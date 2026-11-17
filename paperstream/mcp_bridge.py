"""One-request, standard-library worker for explicitly authorized MCP files.

The Node server chooses the path and captured directory identities; model tool
arguments never contain a filesystem path. This is a local application guard,
not an isolation boundary against another process with filesystem access.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import stat
import sys

# The packaged server executes this file directly, without an installed wheel.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from paperstream import CanvasGraph, ConflictError, PaperstreamError, ValidationError
from paperstream.canvas import _paper_fields, _paper_text


MAX_REQUEST_BYTES = 72 * 1024 * 1024
MAX_CANVAS_BYTES = 64 * 1024 * 1024


class BridgeError(PaperstreamError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def check_path(path: Path, guards: object) -> None:
    """Reject replaced directories and symlinks before and after each access."""
    if not path.is_absolute() or path.suffix.lower() != ".canvas":
        raise BridgeError("unsafe_path", "Only explicitly selected absolute .canvas files are supported.")
    if not isinstance(guards, list) or len(guards) != len(path.parents):
        raise BridgeError("unsafe_path", "The selected file has no complete directory guard.")
    try:
        for parent, guard in zip(path.parents, guards):
            info = parent.lstat()
            if (not isinstance(guard, dict) or guard.get("path") != str(parent)
                    or not stat.S_ISDIR(info.st_mode)
                    or str(info.st_dev) != guard.get("dev")
                    or str(info.st_ino) != guard.get("ino")):
                raise BridgeError("unsafe_path", "A selected Canvas parent directory was replaced.")
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or path.resolve(strict=True) != path:
            raise BridgeError("unsafe_path", "The selected Canvas must remain a regular file, not a symlink.")
        if info.st_size > MAX_CANVAS_BYTES:
            raise BridgeError("too_large", "The Canvas exceeds the 64 MiB limit.")
    except OSError as exc:
        raise BridgeError("unsafe_path", "The selected Canvas is no longer available.") from exc


def _redact_images(value: object, *, image: bool = False) -> object:
    if isinstance(value, dict):
        return {key: ("[image source omitted]" if image and key == "src" and isinstance(child, str)
                      else _redact_images(child, image=key in ("figure", "figures")))
                for key, child in value.items()}
    if isinstance(value, list):
        return [_redact_images(child, image=image) for child in value]
    if isinstance(value, str) and value.lstrip().lower().startswith("data:image/"):
        return "[image source omitted]"
    return value


def graph_summary(graph: CanvasGraph) -> dict:
    """Include all nodes, notes, edges and layout, while omitting image payloads."""
    data = graph.to_dict()
    for row in data.get("nodes", []):
        fields = _paper_fields(row["text"]) if row.get("type") == "text" else None
        if fields is not None:
            # Keep the native node shape and any unrelated `paper` metadata.
            # This is a reading view: rebuild only this fenced JSON string
            # after omitting image sources, never the stored document.
            row["text"] = _paper_text(_redact_images(fields))
    return _redact_images(data)


def _keys(change: dict, allowed: set[str], required: set[str]) -> dict:
    if set(change) - allowed - {"op"} or not required <= set(change):
        raise ValidationError("A change has unknown or missing fields.")
    return {key: value for key, value in change.items() if key != "op"}


def apply_changes(graph: CanvasGraph, changes: object) -> list[dict]:
    if not isinstance(changes, list) or not 1 <= len(changes) <= 200:
        raise ValidationError("changes must contain between 1 and 200 operations")
    definitions = {
        "update_node": ({"node_id", "alias", "takeaway", "name", "url", "year"}, {"node_id"}),
        "clear_node_fields": ({"node_id", "fields"}, {"node_id", "fields"}),
        "update_edge": ({"edge_id", "source", "target", "relation"}, {"edge_id"}),
        "add_node": ({"alias", "takeaway", "node_id", "name", "url", "year", "x", "y", "width", "height"},
                     {"alias", "takeaway"}),
        "add_edge": ({"source", "target", "relation", "edge_id"}, {"source", "target", "relation"}),
        "move_node": ({"node_id", "x", "y"}, {"node_id", "x", "y"}),
        "resize_node": ({"node_id", "width", "height"}, {"node_id", "width", "height"}),
    }
    results = []
    for change in changes:
        if not isinstance(change, dict) or change.get("op") not in definitions:
            raise ValidationError("Unsupported semantic change; removal and document replacement are not model operations.")
        op = change["op"]
        allowed, required = definitions[op]
        kwargs = _keys(change, allowed, required)
        result = getattr(graph, op)(**kwargs)
        results.append({"op": op, "id": (result.id if result is not None
                                        else kwargs.get("node_id", kwargs.get("edge_id")))})
    return results


def handle(request: object) -> dict:
    if not isinstance(request, dict):
        raise ValidationError("The worker request must be an object.")
    path_value = request.get("path")
    if not isinstance(path_value, str):
        raise BridgeError("unsafe_path", "No selected Canvas path was provided.")
    path = Path(path_value)
    guards = request.get("guards")
    check_path(path, guards)
    graph = CanvasGraph.load(path)
    check_path(path, guards)
    if graph.path != path:
        raise BridgeError("unsafe_path", "The Canvas path changed while reading.")
    revision = graph.source_revision
    action = request.get("action")
    if action == "read_canvas":
        return {"text": graph.to_json(), "revision": revision}
    if action == "read_graph":
        return {"graph": graph_summary(graph), "revision": revision,
                "representation": "Complete nodes/notes/layout/edges in their native shape; image src values are omitted, including inside paper text JSON. Do not rebuild a document from this view."}
    if action not in ("write_canvas", "apply_changes"):
        raise ValidationError("Unknown worker action.")
    if request.get("readOnly") is not False:
        raise BridgeError("read_only", "This Canvas was opened read-only.")
    expected = request.get("expectedRevision")
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValidationError("expectedRevision must be the exact revision returned by a read.")
    if expected != revision:
        return {"outcome": "conflict", "revision": revision}
    result = None
    if action == "write_canvas":
        text = request.get("text")
        if not isinstance(text, str):
            raise ValidationError("text must contain the full Canvas JSON.")
        if len(text.encode("utf-8")) > MAX_CANVAS_BYTES:
            raise BridgeError("too_large", "The Canvas exceeds the 64 MiB limit.")
        graph.set_json(text)
    else:
        result = apply_changes(graph, request.get("changes"))
    graph.validate()
    if len(graph.to_json().encode("utf-8")) > MAX_CANVAS_BYTES:
        raise BridgeError("too_large", "The Canvas exceeds the 64 MiB limit.")
    check_path(path, guards)
    try:
        graph.save()
    except ConflictError:
        # Preserve the caller's edit intent. A lock/content conflict never
        # retries, and the next read remains a separate explicit action.
        check_path(path, guards)
        latest = CanvasGraph.load(path)
        check_path(path, guards)
        return {"outcome": "conflict", "revision": latest.source_revision}
    check_path(path, guards)
    response = {"outcome": "saved", "revision": graph.source_revision}
    if result is not None:
        response["changes"] = result
    return response


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
        if len(raw) > MAX_REQUEST_BYTES:
            raise BridgeError("too_large", "The worker request exceeds its size limit.")
        request = json.loads(raw.decode("utf-8"))
        response = {"ok": True, **handle(request)}
    except (PaperstreamError, OSError, ValueError, TypeError, UnicodeError, RecursionError) as exc:
        code = getattr(exc, "code", "validation_error" if isinstance(exc, (ValidationError, ValueError, TypeError, UnicodeError)) else "document_error")
        # Errors from CanvasGraph may include the chosen path; the worker is
        # local, but the model does not need to learn filesystem details.
        message = str(exc) if isinstance(exc, (BridgeError, ValidationError, ValueError, TypeError)) else "The selected Canvas could not be read or saved."
        response = {"ok": False, "code": code, "message": message}
    sys.stdout.write(json.dumps(response, ensure_ascii=False, allow_nan=False) + "\n")
    return 0 if response["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
