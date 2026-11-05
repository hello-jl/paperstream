"""Command-line interface for the local paperstream document API."""

from __future__ import annotations

import argparse
from dataclasses import asdict
import json
import sys
from typing import Any

from paperstream import Graph, PaperstreamError


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
        description="Read and edit a local paperstream Mermaid document.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    def command(name: str, help_text: str) -> argparse.ArgumentParser:
        child = commands.add_parser(name, help=help_text)
        child.add_argument("file", help="Path to the Mermaid .mmd document")
        return child

    init = command("init", "Create a new graph without replacing an existing file")
    init.add_argument(
        "--direction", choices=("TD", "TB", "BT", "LR", "RL"), default="TD"
    )

    command("show", "Read all node and edge fields as JSON")
    command("validate", "Check document syntax, fields, IDs and references")

    add_node = command("add-node", "Add a paper node")
    add_node.add_argument("--alias", required=True)
    add_node.add_argument("--takeaway", required=True)
    add_node.add_argument("--name", help="Full original paper title, if known")
    add_node.add_argument("--id", dest="node_id")

    update_node = command("update-node", "Update selected fields of a paper node")
    update_node.add_argument("id", help="Stable node ID")
    update_node.add_argument("--alias")
    update_node.add_argument("--takeaway")
    update_node.add_argument("--name", help="Full original paper title")

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
    return parser


def _run(args: argparse.Namespace) -> dict[str, Any]:
    result: dict[str, Any] = {
        "ok": True,
        "operation": args.command,
        "file": args.file,
    }
    if args.command == "init":
        graph = Graph.create(args.file, direction=args.direction)
        graph.save()
        result["direction"] = args.direction
        return result

    graph = Graph.load(args.file)
    if args.command == "show":
        result["nodes"] = [asdict(node) for node in graph.nodes()]
        result["edges"] = [asdict(edge) for edge in graph.edges()]
        return result
    if args.command == "validate":
        graph.validate()
        result["valid"] = True
        return result

    if args.command == "add-node":
        node = graph.add_node(
            args.alias, args.takeaway, node_id=args.node_id, name=args.name
        )
        result["node"] = asdict(node)
    elif args.command == "update-node":
        node = graph.update_node(
            args.id, alias=args.alias, takeaway=args.takeaway, name=args.name
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

    graph.save()
    return result


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = _parser()
    args = parser.parse_args(argv)
    if args.command == "update-node" and all(
        getattr(args, field) is None for field in ("alias", "takeaway", "name")
    ):
        parser.error("update-node requires --alias, --takeaway or --name")
    if args.command == "update-edge" and all(
        getattr(args, field) is None for field in ("source", "target", "relation")
    ):
        parser.error("update-edge requires --source, --target or --relation")
    try:
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
