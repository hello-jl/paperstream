"""Command-line interface for the local paperstream document API."""

from __future__ import annotations

import argparse
from dataclasses import asdict
import json
import os
from pathlib import Path
import sys
from typing import Any

from paperstream import CanvasGraph, Graph, PaperstreamError, ValidationError, export_canvas


def _write_json(value: dict[str, Any], *, error: bool = False) -> None:
    stream = sys.stderr if error else sys.stdout
    print(json.dumps(value, ensure_ascii=False, indent=2), file=stream)


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        _write_json(
            {"ok": False, "error": "UsageError", "message": message},
            error=True,
        )
        self.exit(2)


def _parser() -> argparse.ArgumentParser:
    parser = _Parser(
        prog="python3 -m paperstream",
        description="Read and edit a local paperstream Mermaid or JSON Canvas document.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    def command(name: str, help_text: str) -> argparse.ArgumentParser:
        child = commands.add_parser(name, help=help_text)
        child.add_argument("file", help="Path to a .mmd or .canvas document")
        return child

    init = command("init", "Create a new graph without replacing an existing file")
    init.add_argument(
        "--direction", choices=("TD", "TB", "BT", "LR", "RL"), default="TD"
    )

    show = command("show", "Read all paper and edge fields as JSON")
    show.add_argument("--raw", action="store_true", help="Include the complete Canvas document")
    command("validate", "Check document syntax, fields, IDs and references")

    serve = command("serve", "Open one existing Canvas through a local browser editor")
    serve.add_argument("--port", type=int, default=0, help="Loopback port; 0 chooses an available port")
    serve.add_argument("--read-only", action="store_true", help="Display the document without allowing saves")

    add_node = command("add-node", "Add a paper node")
    add_node.add_argument("--alias", required=True)
    add_node.add_argument("--takeaway", required=True)
    add_node.add_argument("--name", help="Full original paper title, if known")
    add_node.add_argument("--url", help="Absolute HTTP or HTTPS paper URL, if known")
    add_node.add_argument("--year", type=int, help="Publication year from 1 to 9999, if known")
    add_node.add_argument("--id", dest="node_id")
    for field in ("x", "y", "width", "height"):
        add_node.add_argument(f"--{field}", type=int, help="Canvas geometry (integer)")

    update_node = command("update-node", "Update selected fields of a paper node")
    update_node.add_argument("id", help="Stable node ID")
    update_node.add_argument("--alias")
    update_node.add_argument("--takeaway")
    update_node.add_argument("--name", help="Full original paper title")
    update_node.add_argument("--url", help="Absolute HTTP or HTTPS paper URL")
    update_node.add_argument("--year", type=int, help="Publication year from 1 to 9999")

    remove_node = command("remove-node", "Remove a paper node")
    remove_node.add_argument("id", help="Stable node ID")
    remove_node.add_argument(
        "--cascade", action="store_true", help="Also remove the node's connected edges"
    )

    add_edge = command("add-edge", "Add a relation between existing nodes")
    add_edge.add_argument("source", help="Source node ID")
    add_edge.add_argument("target", help="Target node ID")
    add_edge.add_argument("--relation", required=True)
    add_edge.add_argument("--id", dest="edge_id")

    update_edge = command("update-edge", "Update selected fields of a relation")
    update_edge.add_argument("id", help="Stable edge ID")
    update_edge.add_argument("--source")
    update_edge.add_argument("--target")
    update_edge.add_argument("--relation")

    remove_edge = command("remove-edge", "Remove a relation")
    remove_edge.add_argument("id", help="Stable edge ID")

    move = command("move-node", "Move a Canvas card")
    move.add_argument("id")
    move.add_argument("--x", type=int, required=True)
    move.add_argument("--y", type=int, required=True)
    resize = command("resize-node", "Resize a Canvas card")
    resize.add_argument("id")
    resize.add_argument("--width", type=int, required=True)
    resize.add_argument("--height", type=int, required=True)
    clear = command("clear-node-fields", "Clear optional Canvas paper fields")
    clear.add_argument("id")
    clear.add_argument("fields", nargs="+", choices=("name", "url", "year"))
    export = command("export-canvas", "Export Mermaid to a new Canvas; preserve the source")
    export.add_argument("destination", help="New .canvas file")
    return parser


def _run(args: argparse.Namespace) -> dict[str, Any]:
    result: dict[str, Any] = {
        "ok": True,
        "operation": args.command,
        "file": args.file,
    }
    canvas = Path(args.file).suffix.lower() == ".canvas"
    if args.command == "export-canvas":
        if canvas or Path(args.destination).suffix.lower() != ".canvas":
            raise ValidationError("export-canvas requires a Mermaid source and a .canvas destination")
        graph = export_canvas(args.file, args.destination)
        result.update(destination=args.destination, nodes=len(graph.nodes()), edges=len(graph.edges()))
        return result
    if args.command == "init":
        graph = CanvasGraph.create(args.file) if canvas else Graph.create(args.file, direction=args.direction)
        graph.save()
        if not canvas:
            result["direction"] = args.direction
        return result

    graph = CanvasGraph.load(args.file) if canvas else Graph.load(args.file)
    if args.command == "show":
        result["nodes"] = [asdict(node) for node in graph.nodes()]
        result["edges"] = [asdict(edge) for edge in graph.edges()]
        if args.raw:
            if not canvas:
                raise ValidationError("--raw requires a .canvas document")
            result["document"] = graph.to_dict()
        return result
    if args.command == "validate":
        graph.validate()
        result["valid"] = True
        return result

    if args.command == "add-node":
        geometry = {field: getattr(args, field) for field in ("x", "y", "width", "height")
                    if getattr(args, field) is not None}
        if geometry and not canvas:
            raise ValidationError("Node geometry requires a .canvas document")
        node = graph.add_node(
            args.alias, args.takeaway, node_id=args.node_id,
            name=args.name, url=args.url, year=args.year, **geometry,
        )
        result["node"] = asdict(node)
    elif args.command == "update-node":
        node = graph.update_node(
            args.id, alias=args.alias, takeaway=args.takeaway,
            name=args.name, url=args.url, year=args.year,
        )
        result["node"] = asdict(node)
    elif args.command == "remove-node":
        graph.remove_node(args.id, cascade=args.cascade)
        result["removed_node"] = args.id
    elif args.command == "add-edge":
        edge = graph.add_edge(
            args.source, args.target, args.relation, edge_id=args.edge_id
        )
        result["edge"] = asdict(edge)
    elif args.command == "update-edge":
        edge = graph.update_edge(
            args.id, source=args.source, target=args.target, relation=args.relation
        )
        result["edge"] = asdict(edge)
    elif args.command == "remove-edge":
        graph.remove_edge(args.id)
        result["removed_edge"] = args.id
    elif args.command in {"move-node", "resize-node", "clear-node-fields"}:
        if not canvas:
            raise ValidationError(f"{args.command} requires a .canvas document")
        if args.command == "move-node":
            graph.move_node(args.id, args.x, args.y)
        elif args.command == "resize-node":
            graph.resize_node(args.id, args.width, args.height)
        else:
            result["node"] = asdict(graph.clear_node_fields(args.id, args.fields))
        result["updated_node"] = args.id

    graph.save()
    return result


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = _parser()
    args = parser.parse_args(argv)
    if args.command == "serve" and not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    if args.command == "update-node" and all(
        getattr(args, field) is None for field in ("alias", "takeaway", "name", "url", "year")
    ):
        parser.error("update-node requires --alias, --takeaway, --name, --url or --year")
    if args.command == "update-edge" and all(
        getattr(args, field) is None for field in ("source", "target", "relation")
    ):
        parser.error("update-edge requires --source, --target or --relation")
    try:
        if args.command == "serve":
            from paperstream.preview import create_preview_server
            app = Path(os.environ.get("PAPERSTREAM_APP_PATH", Path(__file__).resolve().parent.parent / "claude/dist/app.html"))
            if not app.is_file():
                raise ValidationError("Browser editor not built. Run npm --prefix claude run build first.")
            with create_preview_server(args.file, app, port=args.port, read_only=args.read_only) as server:
                _write_json({"ok": True, "operation": "serve", "file": server.file_name, "url": server.url,
                             "message": "Local file editor; keep this process running. Ctrl-C stops it."})
                sys.stdout.flush()
                try:
                    server.serve_forever()
                except KeyboardInterrupt:
                    pass
            return 0
        result = _run(args)
    except (PaperstreamError, OSError) as exc:
        _write_json(
            {"ok": False, "error": type(exc).__name__, "message": str(exc)},
            error=True,
        )
        return 1
    _write_json(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
