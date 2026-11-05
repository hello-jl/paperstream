"""Edit a deliberately small Mermaid subset without rewriting unrelated text.

Only a flowchart header, comments, paperstream node declarations, and named
edges are accepted. This is not a parser for arbitrary Mermaid diagrams.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
import html
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from urllib.parse import urlsplit


class PaperstreamError(Exception):
    """An operation failed without intentionally changing the saved graph."""


class FormatError(PaperstreamError):
    """The document contains unsupported or malformed source syntax."""


class ValidationError(PaperstreamError):
    """A field, identifier, or reference violates the graph contract."""


class ConflictError(PaperstreamError):
    """The file changed since loading, or another API writer holds its lock."""


@dataclass(frozen=True)
class Node:
    id: str
    alias: str
    takeaway: str
    name: str | None = None
    url: str | None = None
    year: int | None = None


@dataclass(frozen=True)
class Edge:
    id: str
    source: str
    target: str
    relation: str


@dataclass(frozen=True)
class _Record:
    value: Node | Edge
    start: int
    end: int
    label_start: int
    label_end: int
    indent: str
    bold: bool = False
    source_span: tuple[int, int] | None = None
    target_span: tuple[int, int] | None = None
    alias_span: tuple[int, int] | None = None
    takeaway_span: tuple[int, int] | None = None
    metadata: dict[str, _MetadataRecord] = field(default_factory=dict)


@dataclass(frozen=True)
class _MetadataRecord:
    value: str | int
    span: tuple[int, int]
    value_span: tuple[int, int]


_ID = r"[A-Za-z_][A-Za-z0-9_]*"
_LINE_END = r"[ \t]*;?[ \t]*(?:\r?\n|\Z)"
_HEADER = re.compile(r"\ufeff?[ \t]*flowchart[ \t]+(TD|TB|LR|RL|BT)" + _LINE_END)
_NODE = re.compile(
    r'(?P<indent>[ \t]*)(?P<id>' + _ID + r')\["`(?P<label>[^"`]*)`"\]'
    + _LINE_END
)
_EDGE = re.compile(
    r'(?P<indent>[ \t]*)(?P<source>' + _ID + r')[ \t]+'
    r'(?P<id>' + _ID + r')@-->\|"(?P<label>[^"\r\n]*)"\|[ \t]+'
    r'(?P<target>' + _ID + r')' + _LINE_END
)
_COMMENT = re.compile(r"[ \t]*%%[^\r\n]*(?:\r?\n|\Z)")
_BLANK = re.compile(r"[ \t]*\r?\n")
_RETIRED = re.compile(r"[ \t]*%% paperstream: retired (" + _ID + r")[ \t]*")
_METADATA = re.compile(
    r'[ \t]*%% paperstream: (?P<field>name|url|year)[ \t]+'
    r'(?P<id>' + _ID + r')[ \t]+(?P<value>.+?)[ \t]*'
)
_ENTITY = re.compile(r"#(\d+|[A-Za-z][A-Za-z0-9]*);")
_RESERVED = {
    "end", "subgraph", "flowchart", "graph", "style", "classDef", "class",
    "linkStyle", "click", "direction", "default",
}
_ESCAPE = set('#"`&<>|\\*_[]{}()%')


def _identifier(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(_ID, value) or value in _RESERVED:
        raise ValidationError(f"Invalid identifier: {value!r}")
    return value


def _field(value: str, name: str, *, multiline: bool = False) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{name} must be nonempty text")
    value = value.replace("\r\n", "\n")
    if not multiline and "\n" in value:
        raise ValidationError(f"{name} must be a single line")
    if any((ord(c) < 32 and c not in "\n\t") or 0xD800 <= ord(c) <= 0xDFFF for c in value):
        raise ValidationError(f"{name} contains unsupported control characters")
    return value


def _encode(value: str) -> str:
    # A single pass also protects literal strings such as '#quot;'.
    return "".join(f"#{ord(c)};" if c in _ESCAPE else c for c in value)


def _metadata_value(name: str, value: str | int) -> str | int:
    if name == "year":
        if type(value) is not int or not 1 <= value <= 9999:
            raise ValidationError("year must be an integer from 1 to 9999")
        return value
    value = _field(value, name)
    if name == "url":
        if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value) or "\\" in value:
            raise ValidationError("url must not contain whitespace, control characters or backslashes")
        try:
            parts = urlsplit(value)
            if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
                raise ValueError("missing HTTP(S) scheme or hostname")
            # Accessing port also validates malformed and out-of-range ports.
            _ = parts.port
        except ValueError as exc:
            raise ValidationError("url must be an absolute HTTP(S) URL with a valid host and port") from exc
    return value


def _encode_metadata(name: str, value: str | int) -> str:
    # Mermaid scans for %%{ directives before stripping ordinary comments.
    # JSON escapes keep metadata intact without exposing directive markers.
    return json.dumps(_metadata_value(name, value), ensure_ascii=False).replace("%", r"\u0025")


def _decode(value: str) -> str:
    def entity(match: re.Match[str]) -> str:
        token = match.group(1)
        if token.isdecimal():
            try:
                number = int(token)
                if not 0 <= number <= 0x10FFFF or 0xD800 <= number <= 0xDFFF:
                    raise ValueError
                return chr(number)
            except ValueError as exc:
                raise FormatError(f"Invalid Mermaid entity: {match.group()}") from exc
        decoded = html.unescape("&" + token + ";")
        if decoded == "&" + token + ";":
            raise FormatError(f"Unknown Mermaid entity: {match.group()}")
        return decoded

    # Never decode recursively: '#35;quot;' means the literal '#quot;'.
    return _ENTITY.sub(entity, value)


def _parse(text: str) -> tuple[dict[str, _Record], set[str], str]:
    records: dict[str, _Record] = {}
    metadata: dict[str, dict[str, _MetadataRecord]] = {}
    retired: set[str] = set()
    direction = ""
    pos = 0
    while pos < len(text):
        blank = _BLANK.match(text, pos)
        if blank:
            pos = blank.end()
            continue
        if not text[pos:].strip(" \t"):
            break
        comment = _COMMENT.match(text, pos)
        if comment:
            content = comment.group().rstrip("\r\n")
            if content.lstrip().startswith("%%{"):
                raise FormatError("Mermaid configuration directives are not supported")
            tombstone = _RETIRED.fullmatch(content)
            item = _METADATA.fullmatch(content)
            if tombstone:
                retired.add(_identifier(tombstone.group(1)))
            elif item:
                identity = _identifier(item.group("id"))
                key = item.group("field")
                fields = metadata.setdefault(identity, {})
                if key in fields:
                    raise ValidationError(f"Duplicate {key} for node: {identity}")
                if "%%{" in item.group("value"):
                    raise FormatError(r"Encode percent signs in metadata directives as \u0025")
                try:
                    value = json.loads(item.group("value"))
                except json.JSONDecodeError as exc:
                    raise FormatError(f"Invalid {key} JSON for node: {identity}") from exc
                fields[key] = _MetadataRecord(
                    _metadata_value(key, value), comment.span(),
                    (pos + item.start("value"), pos + item.end("value")),
                )
            elif content.lstrip().startswith("%% paperstream:"):
                raise FormatError("Malformed paperstream metadata comment")
            pos = comment.end()
            continue
        if not direction:
            header = _HEADER.match(text, pos)
            if not header:
                raise FormatError("Expected 'flowchart TD' (or TB, LR, RL, BT)")
            direction = header.group(1)
            pos = header.end()
            continue
        node = _NODE.match(text, pos)
        edge = None if node else _EDGE.match(text, pos)
        match = node or edge
        if not match:
            line = text.count("\n", 0, pos) + 1
            raise FormatError(
                f"Unsupported or malformed Mermaid at line {line}; "
                "only paperstream nodes, named edges and comments are supported"
            )
        identity = _identifier(match.group("id"))
        if identity in records:
            raise ValidationError(f"Duplicate identifier: {identity}")
        bold = False
        alias_span = takeaway_span = None
        if node:
            raw_label = node.group("label")
            if "%%" in raw_label:
                raise FormatError("Encode literal percent pairs in labels as #37;#37;")
            label = raw_label.replace("\r\n", "\n")
            if "\n" not in label:
                raise FormatError(f"Node {identity} needs an alias line and a takeaway")
            alias, takeaway = label.split("\n", 1)
            bold = alias.startswith("**") and alias.endswith("**") and len(alias) >= 4
            if bold:
                alias = alias[2:-2]
            first_newline = raw_label.index("\n")
            first_end = first_newline - int(raw_label[first_newline - 1:first_newline] == "\r")
            alias_span = (node.start("label") + (2 if bold else 0),
                          node.start("label") + first_end - (2 if bold else 0))
            takeaway_span = (node.start("label") + first_newline + 1, node.end("label"))
            value: Node | Edge = Node(
                identity, _field(_decode(alias), "alias"),
                _field(_decode(takeaway), "takeaway", multiline=True),
            )
        else:
            if "%%" in match.group("label"):
                raise FormatError("Encode literal percent pairs in labels as #37;#37;")
            value = Edge(
                identity, _identifier(match.group("source")),
                _identifier(match.group("target")),
                _field(_decode(match.group("label")), "relation"),
            )
        records[identity] = _Record(
            value, match.start(), match.end(), *match.span("label"),
            match.group("indent"), bold,
            match.span("source") if edge else None,
            match.span("target") if edge else None,
            alias_span, takeaway_span,
        )
        pos = match.end()
    if not direction:
        raise FormatError("Missing flowchart header")
    reused = retired.intersection(records)
    if reused:
        raise ValidationError(f"Retired identifiers cannot be reused: {sorted(reused)}")
    nodes = {key for key, rec in records.items() if isinstance(rec.value, Node)}
    for identity, fields in metadata.items():
        if identity not in nodes:
            raise ValidationError(f"Metadata references a missing node: {identity}")
        record = records[identity]
        records[identity] = replace(
            record, value=replace(record.value, **{key: item.value for key, item in fields.items()}),
            metadata=fields,
        )
    for record in records.values():
        value = record.value
        if isinstance(value, Edge) and (value.source not in nodes or value.target not in nodes):
            raise ValidationError(f"Edge {value.id} references a missing node")
    return records, retired, direction


class Graph:
    """Load/create, edit in memory, then save atomically.

    A successful context-manager exit saves; an exceptional exit does not.
    API writers cooperate via a temporary lock file. An external editor that
    ignores this lock is detected by a best-effort content check before replace.
    """

    def __init__(self, path: Path, text: str, snapshot: bytes | None):
        self.path = path
        self._snapshot = snapshot
        self._set_text(text)

    @classmethod
    def load(cls, path: str | os.PathLike[str]) -> Graph:
        target = Path(path).expanduser().resolve()
        try:
            data = target.read_bytes()
            text = data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise FormatError("The graph must be UTF-8 text") from exc
        except OSError as exc:
            raise PaperstreamError(f"Cannot read {target}: {exc}") from exc
        return cls(target, text, data)

    @classmethod
    def create(cls, path: str | os.PathLike[str], direction: str = "TD") -> Graph:
        if direction not in {"TD", "TB", "LR", "RL", "BT"}:
            raise ValidationError("Direction must be TD, TB, LR, RL or BT")
        target = Path(path).expanduser().resolve()
        if target.exists():
            raise ConflictError(f"File already exists: {target}")
        return cls(target, f"flowchart {direction}\n", None)

    @property
    def direction(self) -> str:
        return self._direction

    def to_mermaid(self) -> str:
        return self._text

    def nodes(self) -> list[Node]:
        return [r.value for r in self._records.values() if isinstance(r.value, Node)]

    def edges(self) -> list[Edge]:
        return [r.value for r in self._records.values() if isinstance(r.value, Edge)]

    def validate(self) -> None:
        _parse(self._text)

    def _set_text(self, text: str) -> None:
        # Parse first so failed mutations leave the object unchanged.
        records, retired, direction = _parse(text)
        self._text = text
        self._records = records
        self._retired = retired
        self._direction = direction
        self._newline = "\r\n" if "\r\n" in text else "\n"

    def _patch(self, changes: list[tuple[int, int, str]]) -> None:
        text = self._text
        for start, end, replacement in sorted(changes, reverse=True):
            text = text[:start] + replacement + text[end:]
        self._set_text(text)

    def _get(self, identity: str, kind: type[Node] | type[Edge]) -> _Record:
        _identifier(identity)
        record = self._records.get(identity)
        if record is None or not isinstance(record.value, kind):
            raise ValidationError(f"Unknown {kind.__name__.lower()}: {identity}")
        return record

    def _new_id(self, requested: str | None, prefix: str) -> str:
        used = set(self._records) | self._retired
        if requested is not None:
            identity = _identifier(requested)
        else:
            numbers = [int(x[len(prefix):]) for x in used
                       if x.startswith(prefix) and x[len(prefix):].isdigit()]
            identity = f"{prefix}{max(numbers, default=0) + 1:03d}"
        if identity in used:
            raise ValidationError(f"Identifier already used or retired: {identity}")
        return identity

    def _label(self, alias: str, takeaway: str, bold: bool = True) -> str:
        first = _encode(_field(alias, "alias"))
        rest = _encode(_field(takeaway, "takeaway", multiline=True)).replace("\n", self._newline)
        return (f"**{first}**" if bold else first) + self._newline + rest

    def add_node(self, alias: str, takeaway: str, node_id: str | None = None,
                 *, name: str | None = None, url: str | None = None,
                 year: int | None = None) -> Node:
        identity = self._new_id(node_id, "paper_")
        label = self._label(alias, takeaway)
        declaration = f'    {identity}["`{label}`"]{self._newline}'
        comments = []
        for key, value in (("name", name), ("url", url), ("year", year)):
            if value is not None:
                encoded = _encode_metadata(key, value)
                comments.append(f"    %% paperstream: {key} {identity} {encoded}{self._newline}")
        declaration = "".join(comments) + declaration
        # Keep declarations before connections without moving existing text.
        edges = [r for r in self._records.values() if isinstance(r.value, Edge)]
        position = edges[0].start if edges else len(self._text)
        prefix = self._newline if position and self._text[position - 1] != "\n" else ""
        self._patch([(position, position, prefix + declaration)])
        return self._get(identity, Node).value

    def update_node(self, node_id: str, *, alias: str | None = None,
                    takeaway: str | None = None, name: str | None = None,
                    url: str | None = None, year: int | None = None) -> Node:
        record = self._get(node_id, Node)
        if all(value is None for value in (alias, takeaway, name, url, year)):
            raise ValidationError("Provide alias, takeaway, name, url or year to update")
        changes = []
        if alias is not None:
            changes.append((*record.alias_span, _encode(_field(alias, "alias"))))
        if takeaway is not None:
            encoded = _encode(_field(takeaway, "takeaway", multiline=True))
            changes.append((*record.takeaway_span, encoded.replace("\n", self._newline)))
        comments = []
        for key, value in (("name", name), ("url", url), ("year", year)):
            if value is not None:
                encoded = _encode_metadata(key, value)
                if key in record.metadata:
                    changes.append((*record.metadata[key].value_span, encoded))
                else:
                    comments.append(f"{record.indent}%% paperstream: {key} {node_id} {encoded}{self._newline}")
        if comments:
            changes.append((record.start, record.start, "".join(comments)))
        self._patch(changes)
        return self._get(node_id, Node).value

    def _remove(self, records: list[_Record]) -> None:
        changes = []
        for record in records:
            for item in record.metadata.values():
                changes.append((*item.span, ""))
            ending = self._newline if self._text[record.start:record.end].endswith("\n") else ""
            comment = f"{record.indent}%% paperstream: retired {record.value.id}{ending}"
            changes.append((record.start, record.end, comment))
        self._patch(changes)

    def remove_node(self, node_id: str, *, cascade: bool = False) -> None:
        record = self._get(node_id, Node)
        incident = [r for r in self._records.values()
                    if isinstance(r.value, Edge) and node_id in (r.value.source, r.value.target)]
        if incident and not cascade:
            raise ValidationError("Node has connected edges; use cascade=True to remove them")
        self._remove([record, *incident])

    def add_edge(self, source: str, target: str, relation: str,
                 edge_id: str | None = None) -> Edge:
        self._get(source, Node)
        self._get(target, Node)
        identity = self._new_id(edge_id, "relation_")
        label = _encode(_field(relation, "relation"))
        prefix = "" if self._text.endswith("\n") else self._newline
        declaration = f'    {source} {identity}@-->|"{label}"| {target}{self._newline}'
        self._set_text(self._text + prefix + declaration)
        return self._get(identity, Edge).value

    def update_edge(self, edge_id: str, *, source: str | None = None,
                    target: str | None = None, relation: str | None = None) -> Edge:
        record = self._get(edge_id, Edge)
        if source is None and target is None and relation is None:
            raise ValidationError("Provide source, target or relation to update")
        changes = []
        for value, span in ((source, record.source_span), (target, record.target_span)):
            if value is not None:
                self._get(value, Node)
                changes.append((*span, value))
        if relation is not None:
            changes.append((record.label_start, record.label_end, _encode(_field(relation, "relation"))))
        self._patch(changes)
        return self._get(edge_id, Edge).value

    def remove_edge(self, edge_id: str) -> None:
        self._remove([self._get(edge_id, Edge)])

    def _check_disk(self) -> None:
        try:
            current = self.path.read_bytes()
        except FileNotFoundError:
            current = None
        if current != self._snapshot:
            raise ConflictError(f"File changed since loading; reload before editing: {self.path}")

    def save(self) -> None:
        self.validate()
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
            data = self._text.encode("utf-8")
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
                # Link creation fails atomically if another process created the file.
                try:
                    os.link(temporary, self.path)
                except FileExistsError as exc:
                    raise ConflictError(f"File already exists: {self.path}") from exc
            else:
                os.replace(temporary, self.path)
                temporary = None
            self._snapshot = data
        except OSError as exc:
            raise PaperstreamError(f"Cannot save {self.path}: {exc}") from exc
        finally:
            if temporary is not None:
                Path(temporary).unlink(missing_ok=True)
            if lock_fd is not None:
                os.close(lock_fd)
                lock_path.unlink(missing_ok=True)

    def __enter__(self) -> Graph:
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        if exc_type is None:
            self.save()
        return False
