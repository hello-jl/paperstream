# Paperstream API reference for agents

Use the installed runtime's `--help` if its version differs from this reference.
Python runtime: standard library only. The commands below assume the repository
root as the working directory. For a standalone plugin, replace
`python3 -m paperstream` with `python3 '/resolved/plugin/scripts/paperstream.py'`.
The skill itself does not bundle that runtime.

## Read and patch by stable ID

```sh
python3 -m paperstream show '/path/to/papers.canvas' --raw
python3 -m paperstream update-node '/path/to/papers.canvas' paper_001 --alias 'Short name'
python3 -m paperstream update-edge '/path/to/papers.canvas' edge_001 --relation 'Builds on this method'
python3 -m paperstream validate '/path/to/papers.canvas'
python3 -m paperstream show '/path/to/papers.canvas' --raw
```

`paper_001` and `edge_001` are placeholders: use the IDs actually returned by the
initial read. `show` returns paper metadata in `nodes`, relation summaries in
`edges`, and (with `--raw`) the complete Canvas object in `document`. Ordinary
notes and other non-paper nodes appear only in that complete document.

For multiple related changes, prefer one load and one save. The example assumes
these IDs already exist; use verified metadata, not the example's display text.

```python
from paperstream import CanvasGraph

graph = CanvasGraph.load("/path/to/papers.canvas")
before = graph.to_dict()
graph.update_node("paper_001", alias="Short name",
                  takeaway="- First observation\n- Second observation")
graph.update_edge("edge_001", relation="Builds on this method")
graph.validate()
graph.save()
after = CanvasGraph.load(graph.path).to_dict()
```

`save()` validates too. Changes stay in memory until a successful save.
`with CanvasGraph.load(path) as graph:` saves on normal exit and skips saving if
the block raises. `to_dict()` returns a deep copy, so modifying it alone does not
change the graph. Compare the relevant original and reloaded objects to verify
that the requested edit is the only semantic change; JSON indentation may change.

## Create and remove content

```python
from paperstream import CanvasGraph

with CanvasGraph.create("/new/path/papers.canvas") as graph:
    first = graph.add_node("Starting point", "", x=0, y=0)
    second = graph.add_node("Follow-up", "", x=0, y=320)
    edge = graph.add_edge(first.id, second.id, "")
```

This creates a new file only; creation refuses an existing path. `add_node` also
accepts `node_id`, `name`, `url`, `year`, `width`, `height`; use the returned ID.
The empty relation is valid. Required CLI arguments may be explicitly empty:

```sh
python3 -m paperstream init '/new/path/papers.canvas'
python3 -m paperstream add-node '/path/to/papers.canvas' --alias 'Short name' --takeaway ''
python3 -m paperstream add-edge '/path/to/papers.canvas' ACTUAL_SOURCE_ID ACTUAL_TARGET_ID --relation ''
python3 -m paperstream clear-node-fields '/path/to/papers.canvas' ACTUAL_NODE_ID name url year
```

The Python clear operation is `graph.clear_node_fields(id, ["name", "url", "year"])`.
`graph.remove_edge(id)` removes one relation. `graph.remove_node(id)` refuses a
paper with connected edges. Use `cascade=True` (CLI `--cascade`) only when deleting
those edges is authorized. Do not silently use cascading deletion as a retry.

## Layout, notes, figures and extension properties

`move_node(id, x, y)` and `resize_node(id, width, height)` operate on Canvas nodes;
the corresponding CLI commands require both coordinates or both dimensions.
Geometry is a JavaScript-safe integer; dimensions must be positive.

For standard Canvas properties without a typed helper, load the full document,
change only the selected property, then call `set_document`, validate and save:

```python
from paperstream import CanvasGraph

graph = CanvasGraph.load("/path/to/papers.canvas")
document = graph.to_dict()
edge = next(row for row in document["edges"] if row["id"] == "ACTUAL_EDGE_ID")
edge["fromEnd"] = "arrow"  # Together with toEnd="arrow", a bidirectional edge.
graph.set_document(document)
graph.validate()
graph.save()
```

Use this path for ordinary text/file/link/group cards and extension changes only
when their schema is known from the installed version. The API preserves unknown
JSON but does not validate the meaning of every visual extension (for example,
figure placement or stroke styles). Do not guess extension keys. `nodes()` lists
paper cards only; `edges()` lists Canvas edges including ones attached to ordinary
nodes. Note that API-created papers default to a horizontal initial placement
unless coordinates are provided; creation does not infer scientific chronology.

Storage: papers are standard `type: "text"` cards with a whole Markdown fenced
`json` block containing `paperstream: 1`, `alias`, `takeaway`, and optional
`name` / `url` / `year`. Edges use standard `fromNode` / `toNode` / `label`, with
`fromEnd` / `toEnd` arrows. Unknown fields are retained. Preserve existing versions
you do not understand rather than coercing them into paper version 1.

### Embedded figure presentation

`paperstreamCard.figures` stores embedded raster `src`, stable `id`, `caption`,
`widthPercent` (15–100) and decoded `naturalWidth` / `naturalHeight`. Preserve
source attribution and unknown properties when editing these entries.

An optional `align` is `left`, `center` or `right` (default `left`). An optional
`frame` controls reversible display framing, without rewriting the source image:

```json
{"aspectRatio": 0.75, "fit": "cover", "positionX": 50, "positionY": 0, "zoom": 1.2}
```

`aspectRatio` is width / height, from 0.25 to 4. `fit` is `cover` (fill and crop)
or `contain` (show the whole image at zoom 1). Positions range from 0 to 100;
50 centers the scaled image in that axis. `zoom` ranges from 1 to 4. A frame is
opt-in; absent or unsupported frames render at the original aspect ratio.
Do not add frames to ordinary paper figures unless cropping was requested.
The UI and SVG/PNG renderer use the same frame geometry. Use `set_document()`
on a freshly loaded document for these extensions, then validate, save and
read back. Frame changes must preserve embedded bytes and attribution unless
the task explicitly includes replacing the source image.

## Errors and concurrency

CLI success: exit 0 and JSON on stdout with `ok: true`, `operation`, and result
fields. Failure: JSON on stderr with `ok: false`, `error`, `message`; exit 1 for
document/API/I/O failures or 2 for command usage. `--help` prints human-readable
help. Check both exit status and error data.

- `ValidationError` / `FormatError`: fix the proposed values or report unsupported
  input. Do not rewrite an unreadable source with a reduced reconstruction.
- `ConflictError`: file already exists, changed since loading, or another writer
  holds a lock. Keep the original intact; reread, reconcile, then retry only the
  appropriate patch. Do not delete another process's lock or force a stale save.
- `PaperstreamError` / I/O error: report the actual cause; do not bypass atomic
  save with a direct write.

`source_revision` is a SHA-256 identifier of loaded/saved disk bytes, not of
unsaved in-memory changes. Local `save()` detects changes since the most recent
load/save; it is not a merge engine. A host's resource tools may instead use ETag
or another revision token: keep its read and save in the same channel. A browser
draft must be saved or explicitly reconciled before external edits.

## Legacy Mermaid

Use `Graph.load()` / `Graph.create()` or the same CLI for supported `.mmd`
documents. Canvas-only commands such as `show --raw`, moving/resizing and clearing
optional fields do not apply to Mermaid. Convert without touching the source:

```sh
python3 -m paperstream export-canvas '/path/to/legacy.mmd' '/new/path/papers.canvas'
```

No automatic reverse conversion, synchronization, or deletion is implied.
