"""Independent, standard-library JSON Canvas storage for paperstream.

Paper fields live once, in a text node's fenced JSON Markdown block. All other
Canvas data stays in the original JSON object and survives targeted changes.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict
from decimal import Decimal, DecimalException
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import tempfile
from urllib.parse import urlsplit
from uuid import uuid4

from .document import (
    ConflictError, Edge, FormatError, Graph, Node, PaperstreamError, ValidationError,
)


_MAX_SAFE_INTEGER = 9007199254740991
# ECMAScript String.trim whitespace, used by the browser's paper-card parser.
_TEXT_WHITESPACE = ("\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004"
                    "\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f"
                    "\u205f\u3000\ufeff")


def _text(value: object, field: str, *, multiline: bool = False, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or (not allow_empty and not value.strip()):
        raise ValidationError(f"{field} must be nonempty text")
    value = value.replace("\r\n", "\n")
    if not multiline and "\n" in value:
        raise ValidationError(f"{field} must be a single line")
    if any((ord(c) < 32 and c not in "\n\t") or 0xD800 <= ord(c) <= 0xDFFF for c in value):
        raise ValidationError(f"{field} contains unsupported control characters")
    return value


def _integer(value: object, field: str, *, positive: bool = False) -> int:
    if (type(value) is not int or abs(value) > _MAX_SAFE_INTEGER
            or (positive and value <= 0)):
        raise ValidationError(f"{field} must be {'a positive' if positive else 'a'} safe integer")
    return value


def _optional(value: object, field: str) -> str | int | None:
    if value is None:
        return None
    if field == "year":
        if type(value) is not int or not 1 <= value <= 9999:
            raise ValidationError("year must be an integer from 1 to 9999")
        return value
    value = _text(value, field)
    if field == "url":
        if any(c.isspace() or ord(c) < 32 or 127 <= ord(c) <= 159 for c in value) or "\\" in value:
            raise ValidationError("url must not contain whitespace, control characters or backslashes")
        try:
            parts = urlsplit(value)
            if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
                raise ValueError("missing HTTP(S) scheme or hostname")
            _ = parts.port
        except ValueError as exc:
            raise ValidationError("url must be an absolute HTTP(S) URL with a valid host and port") from exc
    return value


def _object_pairs(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise FormatError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def _bad_constant(value: str) -> None:
    raise FormatError(f"Nonfinite JSON number: {value}")


def _float(token: str) -> float:
    value = float(token)
    try:
        preserved = math.isfinite(value) and Decimal(token) == Decimal(str(value))
    except DecimalException as exc:
        raise FormatError("JSON number cannot be represented") from exc
    if not preserved:
        raise FormatError("JSON number cannot be preserved without losing precision")
    return value


def _loads(text: str) -> object:
    try:
        return json.loads(text, object_pairs_hook=_object_pairs,
                          parse_constant=_bad_constant, parse_float=_float)
    except (ValueError, TypeError, RecursionError) as exc:
        raise FormatError(f"Invalid JSON: {exc}") from exc


def _dumps(value: object) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    except (TypeError, ValueError, RecursionError) as exc:
        raise FormatError(f"Document must contain JSON values: {exc}") from exc


def _json_value(value: object, ancestors: set[int] | None = None) -> None:
    """Refuse Python values json.dumps would coerce or discard."""
    if value is None or type(value) in (bool, int):
        return
    if type(value) is str:
        value.encode("utf-8")
        return
    if type(value) is float:
        if not math.isfinite(value):
            raise FormatError("JSON numbers must be finite")
        return
    if type(value) not in (dict, list):
        raise FormatError("Document values must be JSON objects, arrays, strings, numbers, booleans or null")
    if ancestors is None:
        ancestors = set()
    if id(value) in ancestors:
        raise FormatError("Document contains a circular reference")
    ancestors.add(id(value))
    if isinstance(value, dict):
        for key, child in value.items():
            if type(key) is not str:
                raise FormatError("JSON object keys must be strings")
            key.encode("utf-8")
            _json_value(child, ancestors)
    else:
        for child in value:
            _json_value(child, ancestors)
    ancestors.remove(id(value))


def _paper_fields(text: str) -> dict | None:
    match = re.fullmatch(r"```json\r?\n([\s\S]*)\r?\n```", text.strip(_TEXT_WHITESPACE))
    if not match:
        return None
    try:
        fields = _loads(match.group(1))
    except FormatError:
        # An unrelated code card need not contain valid JSON. A damaged paper
        # card must not silently disappear from the paper API.
        if '"paperstream"' in match.group(1):
            raise
        return None
    if not isinstance(fields, dict) or "paperstream" not in fields:
        return None
    if type(fields["paperstream"]) is not int or fields["paperstream"] != 1:
        return None
    _json_value(fields)
    _text(fields.get("alias"), "alias", allow_empty=True)
    _text(fields.get("takeaway"), "takeaway", multiline=True, allow_empty=True)
    for key in ("name", "url", "year"):
        _optional(fields.get(key), key)
    return fields


def _paper_text(fields: dict) -> str:
    return "```json\n" + _dumps(fields) + "```"


def _node(row: dict) -> Node | None:
    if row.get("type") != "text":
        return None
    fields = _paper_fields(row["text"])
    if fields is None:
        return None
    return Node(row["id"], fields["alias"], fields["takeaway"],
                fields.get("name"), fields.get("url"), fields.get("year"))


def _validate(data: object) -> None:
    if not isinstance(data, dict):
        raise FormatError("Canvas must be a JSON object")
    # Preserve unknown JSON exactly as values, never convert tuples or keys.
    _json_value(data)
    _dumps(data).encode("utf-8")
    identities: set[str] = set()
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValidationError("Canvas nodes and edges must be arrays")
    for row in nodes:
        if not isinstance(row, dict):
            raise ValidationError("Each Canvas node must be an object")
        identity = _text(row.get("id"), "node id")
        if identity in identities:
            raise ValidationError(f"Duplicate node ID: {identity}")
        identities.add(identity)
        kind = _text(row.get("type"), "node type")
        if kind not in ("text", "file", "link", "group"):
            raise ValidationError(f"Unsupported node type: {kind}")
        for key in ("x", "y", "width", "height"):
            _integer(row.get(key), key, positive=key in {"width", "height"})
        if kind == "text":
            if not isinstance(row.get("text"), str):
                raise ValidationError("Text nodes require a text string")
            _node(row)
        elif kind == "file":
            _text(row.get("file"), "file")
        elif kind == "link":
            _text(row.get("url"), "link url")
        for key in ("color", "label", "background", "subpath"):
            if key in row and not isinstance(row[key], str):
                raise ValidationError(f"Node {key} must be text")
        if "subpath" in row and not row["subpath"].startswith("#"):
            raise ValidationError("Node subpath must start with #")
        if "backgroundStyle" in row and row["backgroundStyle"] not in ("cover", "ratio", "repeat"):
            raise ValidationError("Invalid node backgroundStyle")
    edge_ids: set[str] = set()
    for row in edges:
        if not isinstance(row, dict):
            raise ValidationError("Each Canvas edge must be an object")
        identity = _text(row.get("id"), "edge id")
        if identity in edge_ids:
            raise ValidationError(f"Duplicate edge ID: {identity}")
        edge_ids.add(identity)
        for key in ("fromNode", "toNode"):
            if _text(row.get(key), key) not in identities:
                raise ValidationError(f"Edge {identity} references a missing node")
        for key in ("label", "color"):
            if key in row and not isinstance(row[key], str):
                raise ValidationError(f"Edge {key} must be text")
        for key in ("fromSide", "toSide"):
            if key in row and row[key] not in ("top", "right", "bottom", "left"):
                raise ValidationError(f"Invalid {key}")
        for key in ("fromEnd", "toEnd"):
            if key in row and row[key] not in ("none", "arrow"):
                raise ValidationError(f"Invalid {key}")


class CanvasGraph:
    """Edit papers within a JSON Canvas; unrelated objects remain intact.

    No edits reach disk until save. API writers share a lock, and external
    changes are detected before replacement on a best-effort basis.
    """

    def __init__(self, path: Path, data: dict, snapshot: bytes | None = None):
        self.path = path
        self._snapshot = snapshot
        self._data: dict = {}
        self.set_document(data)
        self._baseline = deepcopy(self._data)

    @classmethod
    def create(cls, path: str | os.PathLike[str]) -> CanvasGraph:
        return cls.from_dict(path, {"nodes": [], "edges": []})

    @classmethod
    def from_dict(cls, path: str | os.PathLike[str], data: dict) -> CanvasGraph:
        target = Path(path).expanduser().resolve()
        if target.exists():
            raise ConflictError(f"File already exists: {target}")
        return cls(target, data)

    @classmethod
    def from_json(cls, path: str | os.PathLike[str], text: str) -> CanvasGraph:
        return cls.from_dict(path, _loads(text))

    @classmethod
    def load(cls, path: str | os.PathLike[str]) -> CanvasGraph:
        target = Path(path).expanduser().resolve()
        try:
            snapshot = target.read_bytes()
            text = snapshot.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise FormatError("The Canvas must be UTF-8 JSON") from exc
        except OSError as exc:
            raise PaperstreamError(f"Cannot read {target}: {exc}") from exc
        return cls(target, _loads(text), snapshot)

    def to_dict(self) -> dict:
        return deepcopy(self._data)

    def to_json(self) -> str:
        return _dumps(self._data)

    @property
    def source_revision(self) -> str | None:
        """Content revision of the loaded/saved bytes, not unsaved changes.

        Hosts can associate an optimistic-concurrency token with the exact
        snapshot read by this graph without reopening the path and racing a
        second reader. Unsaved new graphs have no source revision yet.
        """
        return hashlib.sha256(self._snapshot).hexdigest() if self._snapshot is not None else None

    def set_json(self, text: str) -> None:
        """Validate a complete JSON update without losing duplicate fields."""
        self.set_document(_loads(text))

    def set_document(self, data: dict) -> None:
        try:
            candidate = deepcopy(data)
            _validate(candidate)
        except UnicodeEncodeError as exc:
            raise FormatError("Canvas strings must contain valid Unicode") from exc
        except RecursionError as exc:
            raise FormatError("Canvas JSON is nested too deeply") from exc
        self._data = candidate

    def validate(self) -> None:
        _validate(self._data)

    def nodes(self) -> list[Node]:
        return [paper for row in self._data.get("nodes", []) if (paper := _node(row)) is not None]

    def edges(self) -> list[Edge]:
        return [Edge(row["id"], row["fromNode"], row["toNode"], row.get("label", ""))
                for row in self._data.get("edges", [])]

    def _find(self, identity: str, kind: str) -> dict:
        _text(identity, "id")
        for row in self._data.get(kind, []):
            if row["id"] == identity:
                return row
        raise ValidationError(f"Unknown {kind[:-1]}: {identity}")

    def _paper(self, identity: str) -> dict:
        row = self._find(identity, "nodes")
        if _node(row) is None:
            raise ValidationError(f"Node is not a paperstream paper: {identity}")
        return row

    def _new_id(self, requested: str | None) -> str:
        used = {row["id"] for kind in ("nodes", "edges") for row in self._data.get(kind, [])}
        identity = _text(requested, "id") if requested is not None else uuid4().hex
        if identity in used:
            raise ValidationError(f"Identifier already used: {identity}")
        return identity

    def _replace(self, kind: str, identity: str, row: dict) -> None:
        data = self.to_dict()
        data[kind] = [row if item["id"] == identity else item for item in data[kind]]
        self.set_document(data)

    def add_node(self, alias: str, takeaway: str, node_id: str | None = None,
                 *, name: str | None = None, url: str | None = None,
                 year: int | None = None, x: int | None = None, y: int | None = None,
                 width: int = 320, height: int = 220) -> Node:
        identity = self._new_id(node_id)
        fields = {"paperstream": 1, "name": _optional(name, "name"),
                  "alias": _text(alias, "alias", allow_empty=True),
                  "takeaway": _text(takeaway, "takeaway", multiline=True, allow_empty=True),
                  "url": _optional(url, "url"), "year": _optional(year, "year")}
        existing = self._data.get("nodes", [])
        if x is None:
            x = max((row["x"] + row["width"] + 80 for row in existing), default=0)
        if y is None:
            y = 0
        row = {"id": identity, "type": "text", "x": x, "y": y,
               "width": width, "height": height, "text": _paper_text(fields)}
        data = self.to_dict()
        data.setdefault("nodes", []).append(row)
        self.set_document(data)
        return _node(row)

    def update_node(self, node_id: str, *, alias: str | None = None,
                    takeaway: str | None = None, name: str | None = None,
                    url: str | None = None, year: int | None = None) -> Node:
        row = deepcopy(self._paper(node_id))
        fields = _paper_fields(row["text"])
        if all(value is None for value in (alias, takeaway, name, url, year)):
            raise ValidationError("Provide alias, takeaway, name, url or year to update")
        for key, value in (("alias", alias), ("takeaway", takeaway), ("name", name),
                           ("url", url), ("year", year)):
            if value is not None:
                fields[key] = (_text(value, key, multiline=key == "takeaway", allow_empty=True)
                               if key in {"alias", "takeaway"} else _optional(value, key))
        row["text"] = _paper_text(fields)
        self._replace("nodes", node_id, row)
        return _node(row)

    def clear_node_fields(self, node_id: str, fields: list[str]) -> Node:
        if not isinstance(fields, (list, tuple)) or not fields or any(
            key not in ("name", "url", "year") for key in fields
        ):
            raise ValidationError("Only name, url and year can be cleared")
        row = deepcopy(self._paper(node_id))
        values = _paper_fields(row["text"])
        for key in fields:
            values[key] = None
        row["text"] = _paper_text(values)
        self._replace("nodes", node_id, row)
        return _node(row)

    def move_node(self, node_id: str, x: int, y: int) -> None:
        row = deepcopy(self._find(node_id, "nodes"))
        row.update(x=_integer(x, "x"), y=_integer(y, "y"))
        self._replace("nodes", node_id, row)

    def resize_node(self, node_id: str, width: int, height: int) -> None:
        row = deepcopy(self._find(node_id, "nodes"))
        row.update(width=_integer(width, "width", positive=True),
                   height=_integer(height, "height", positive=True))
        self._replace("nodes", node_id, row)

    def remove_node(self, node_id: str, *, cascade: bool = False) -> None:
        self._paper(node_id)
        edges = self._data.get("edges", [])
        connected = [edge for edge in edges if node_id in (edge["fromNode"], edge["toNode"])]
        if connected and not cascade:
            raise ValidationError("Node has connected edges; use cascade=True to remove them")
        data = self.to_dict()
        data["nodes"] = [row for row in data["nodes"] if row["id"] != node_id]
        if connected:
            data["edges"] = [edge for edge in data["edges"]
                             if node_id not in (edge["fromNode"], edge["toNode"])]
        self.set_document(data)

    def add_edge(self, source: str, target: str, relation: str,
                 edge_id: str | None = None) -> Edge:
        self._find(source, "nodes")
        self._find(target, "nodes")
        identity = self._new_id(edge_id)
        row = {"id": identity, "fromNode": source, "toNode": target,
               "toEnd": "arrow", "label": _text(relation, "relation", allow_empty=True)}
        data = self.to_dict()
        data.setdefault("edges", []).append(row)
        self.set_document(data)
        return Edge(identity, source, target, row["label"])

    def update_edge(self, edge_id: str, *, source: str | None = None,
                    target: str | None = None, relation: str | None = None) -> Edge:
        row = deepcopy(self._find(edge_id, "edges"))
        if source is None and target is None and relation is None:
            raise ValidationError("Provide source, target or relation to update")
        for key, value in (("fromNode", source), ("toNode", target)):
            if value is not None:
                self._find(value, "nodes")
                row[key] = value
        if relation is not None:
            row["label"] = _text(relation, "relation", allow_empty=True)
        self._replace("edges", edge_id, row)
        return Edge(edge_id, row["fromNode"], row["toNode"], row.get("label", ""))

    def remove_edge(self, edge_id: str) -> None:
        self._find(edge_id, "edges")
        data = self.to_dict()
        data["edges"] = [edge for edge in data["edges"] if edge["id"] != edge_id]
        self.set_document(data)

    def _check_disk(self) -> None:
        try:
            current = self.path.read_bytes()
        except FileNotFoundError:
            current = None
        if current != self._snapshot:
            raise ConflictError(f"File changed since loading; reload before editing: {self.path}")

    def save(self) -> None:
        self.validate()
        data = (self._snapshot if self._snapshot is not None and self._data == self._baseline
                else self.to_json().encode("utf-8"))
        lock_path = self.path.with_name(f".{self.path.name}.paperstream.lock")
        temporary: str | None = None
        lock_fd: int | None = None
        try:
            try:
                lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except FileExistsError as exc:
                raise ConflictError(f"Another writer holds {lock_path}") from exc
            os.write(lock_fd, str(os.getpid()).encode("ascii"))
            self._check_disk()
            if data == self._snapshot:
                return
            fd, temporary = tempfile.mkstemp(prefix=f".{self.path.name}.", suffix=".tmp", dir=self.path.parent)
            with os.fdopen(fd, "wb") as stream:
                if self._snapshot is not None:
                    os.chmod(temporary, stat.S_IMODE(self.path.stat().st_mode))
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            self._check_disk()
            if self._snapshot is None:
                try:
                    os.link(temporary, self.path)
                except FileExistsError as exc:
                    raise ConflictError(f"File already exists: {self.path}") from exc
            else:
                os.replace(temporary, self.path)
                temporary = None
            self._snapshot = data
            self._baseline = deepcopy(self._data)
        except OSError as exc:
            raise PaperstreamError(f"Cannot save {self.path}: {exc}") from exc
        finally:
            if temporary is not None:
                Path(temporary).unlink(missing_ok=True)
            if lock_fd is not None:
                os.close(lock_fd)
                lock_path.unlink(missing_ok=True)

    def __enter__(self) -> CanvasGraph:
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        if exc_type is None:
            self.save()
        return False


def export_canvas(source: str | os.PathLike[str], destination: str | os.PathLike[str]) -> CanvasGraph:
    """Convert Mermaid to a new Canvas without modifying the source file."""
    original = Graph.load(source)
    graph = CanvasGraph.create(destination)
    # Keep source IDs. Simple rows are an initial layout, not a claim to infer
    # scientific chronology or an optimized graph layout.
    for index, paper in enumerate(original.nodes()):
        fields = asdict(paper)
        identity = fields.pop("id")
        graph.add_node(**fields, node_id=identity,
                       x=(index % 3) * 400, y=(index // 3) * 300)
    for edge in original.edges():
        graph.add_edge(edge.source, edge.target, edge.relation, edge_id=edge.id)
    graph.save()
    return graph
