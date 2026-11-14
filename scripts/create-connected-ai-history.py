#!/usr/bin/env python3
"""Make an editable, continuously connected variant of the saved history.

Run from the repository root:
  python3 scripts/create-connected-ai-history.py SOURCE.canvas NEW.canvas
Both graph reads and the new document's single save use CanvasGraph.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paperstream import CanvasGraph


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    source = CanvasGraph.load(args.source)
    before = source.to_dict()
    milestone_ids = [paper.id for paper in source.nodes()]
    if len(milestone_ids) != 16:
        raise ValueError("Expected the 16-milestone computing/AI history.")
    expected_pairs = {(milestone_ids[i], milestone_ids[i + 1])
                      for i in range(15) if i % 4 != 3}
    existing_pairs = {(edge.source, edge.target) for edge in source.edges()}
    if existing_pairs != expected_pairs:
        raise ValueError("Expected the original twelve within-row time edges.")

    graph = CanvasGraph.create(args.output)
    graph.set_document(before)
    for row in range(3):
        graph.add_edge(milestone_ids[row * 4 + 3], milestone_ids[(row + 1) * 4],
                       "", edge_id=f"time_row_{row + 1}_to_{row + 2}")
    document = graph.to_dict()
    nodes = {node["id"]: node for node in document["nodes"]}
    title = nodes["history_title"]
    title["label"] = "Paperstream · 从电子计算到 AI · 连续时间线"
    title["text"] = (
        "1946—2026｜16 个里程碑精选。沿箭头阅读，每行从左到右，"
        "再沿行间回折线进入下一行。15 条连线只表示时间顺序，不表示直接技术继承。\n"
        "从电子通用计算机时代切入；机械计算、计算理论与早期专用计算机不在此简图范围内。"
        "肖像仅展示部分相关人物。"
    )
    for edge in document["edges"][len(before["edges"]):]:
        start, end = nodes[edge["fromNode"]], nodes[edge["toNode"]]
        bottom = start["y"] + start["height"]
        if end["y"] - bottom < 50:
            raise ValueError("Not enough space between rows for a clear return path.")
        corridor = (bottom + end["y"]) // 2
        edge.update(fromSide="bottom", toSide="top", paperstreamStyle={
            "strokeWidth": 1.3,
            "waypoints": [
                {"x": start["x"] + start["width"] // 2, "y": corridor},
                {"x": end["x"] + end["width"] // 2, "y": corridor},
            ],
        })
    graph.set_document(document)
    graph.validate()
    # Check the scope before saving: only title text and three edges may differ.
    unchanged = deepcopy(document)
    unchanged["nodes"][0] = deepcopy(before["nodes"][0])
    unchanged["edges"] = unchanged["edges"][:len(before["edges"])]
    if unchanged != before or document["nodes"][0]["id"] != "history_title":
        raise ValueError("Unexpected changes outside the title and added connections.")
    if CanvasGraph.load(args.source).source_revision != source.source_revision:
        raise ValueError("The source changed; regenerate from its latest saved version.")
    graph.save()

    actual = CanvasGraph.load(args.output)
    if actual.to_dict() != document:
        raise ValueError("Saved Canvas verification failed.")
    if CanvasGraph.load(args.source).source_revision != source.source_revision:
        raise ValueError("The source changed during creation; inspect the new variant.")
    print(json.dumps({
        "ok": True, "file": str(args.output), "nodes": len(document["nodes"]),
        "edges": len(document["edges"]), "addedEdges": [
            edge["id"] for edge in document["edges"][len(before["edges"]):]
        ], "sourceSha256": source.source_revision,
        "outputSha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
        "sourceUnchanged": True,
    }))


if __name__ == "__main__":
    main()
