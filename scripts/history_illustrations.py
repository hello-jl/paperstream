"""Prepare scoped, portable principle illustrations for the history examples.

This module edits a document copy only; callers save with CanvasGraph.
As a command it loads each full document and saves once through that API.
"""
from __future__ import annotations

import argparse
import base64
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from paperstream import CanvasGraph

ILLUSTRATIONS = {
    "computing": {
        "transformer_2017": "self-attention", "gpt3_2020": "in-context",
        "alphafold3_2024": "diffusion-structure", "claude_2026": "agent-loop",
    },
    "deep-learning": {
        "dl_resnet_2015": "residual", "dl_transformer_2017": "self-attention",
        "dl_gpt3_2020": "in-context",
    },
}


def apply_history_illustrations(document: dict, family: str) -> None:
    """Replace only the selected figure, dependent placeholder text and credits."""
    targets = ILLUSTRATIONS[family]
    manifest = json.loads((ROOT / "assets/history/principles/manifest.json").read_text())
    nodes = {node["id"]: node for node in document["nodes"]}
    for identity, key in targets.items():
        node = nodes[identity]
        info = manifest["diagrams"][key]
        data = (ROOT / info["file"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != info["sha256"]:
            raise ValueError(f"Diagram changed without updated provenance: {key}")
        card = node.setdefault("paperstreamCard", {})
        if family == "deep-learning":
            card.setdefault("kind", "paper")
        figures = card.setdefault("figures", [])
        index = next((i for i, fig in enumerate(figures)
                      if fig.get("id", "").startswith(("portrait_", "diagram_"))), None)
        old = figures[index] if index is not None else {}
        figure = deepcopy(old)
        # Old photograph-specific geometry and attribution cannot describe a
        # newly drawn landscape diagram. Unknown figure fields remain intact.
        for field in ("frame", "person", "attribution", "displayChanges"):
            figure.pop(field, None)
        width = old.get("widthPercent") if old.get("id") == f"diagram_{key}" else None
        if width is None:
            stroke = node.get("paperstreamStyle", {}).get("strokeWidth", 1)
            width = 234 / (node["width"] - 36 - 2 * stroke) * 100
        figure.update(
            id=f"diagram_{key}", src="data:image/png;base64," + base64.b64encode(data).decode("ascii"),
            caption=info["caption"], widthPercent=width, align="center",
            naturalWidth=info["width"], naturalHeight=info["height"],
            **{field: info[field] for field in
               ("sourceUrl", "author", "license", "licenseUrl", "context", "changes")},
        )
        if index is None:
            figures.append(figure)
        else:
            figures[index] = figure

    if family == "computing":
        note = nodes["history_scope_and_credits"]
        note["text"] = note["text"].replace("，Gomez／Gabriel Hutchinson", "") \
            .replace("；BY 2.0：Amodei／TechCrunch", "")
    else:
        note = nodes["dl_history_credits"]
        note["label"] = "来源与插图"
        note["text"] = note["text"].replace("；Gabriel Hutchinson", "").replace("；TechCrunch", "") \
            .replace("\n何恺明等 ResNet 作者肖像待授权。", "")
        # This published provenance map previously included unused portraits.
        # Keep the rights of every photo that is still embedded in this file.
        history = document.get("paperstreamHistory", {})
        rights = history.get("portraitRights")
        if isinstance(rights, dict):
            used = {figure.get("id", "").removeprefix("portrait_")
                    for node in document["nodes"]
                    for figure in node.get("paperstreamCard", {}).get("figures", [])}
            for unused in ("amodei", "gomez"):
                if unused not in used:
                    rights.pop(unused, None)
    credit = "原理示意图：Paperstream contributors · MIT；据原论文／官方说明简化自绘。"
    if credit not in note["text"]:
        note["text"] += "\n" + credit


def update_illustrated_paper_text(graph: CanvasGraph, family: str) -> None:
    if family != "deep-learning":
        return
    papers = {paper.id: paper for paper in graph.nodes()}
    for identity, old, new in (
        ("dl_gpt3_2020", "- Brown 等；图示共作者 Amodei", "- Brown 等；上下文学习"),
        ("dl_resnet_2015", "\n\n肖像待授权：何恺明及共同作者", ""),
    ):
        text = papers[identity].takeaway
        if old in text:
            graph.update_node(identity, takeaway=text.replace(old, new))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", type=Path, nargs="+")
    args = parser.parse_args()
    results = []
    for file in args.files:
        graph = CanvasGraph.load(file)
        document = graph.to_dict()
        family = "deep-learning" if any(n["id"] == "dl_history_title" for n in document["nodes"]) else "computing"
        update_illustrated_paper_text(graph, family)
        document = graph.to_dict()
        apply_history_illustrations(document, family)
        graph.set_document(document)
        graph.validate()
        graph.save()
        if CanvasGraph.load(file).to_dict() != document:
            raise ValueError(f"Saved document did not round-trip: {file}")
        results.append({"file": str(file), "illustratedNodes": list(ILLUSTRATIONS[family]),
                        "nodes": len(document["nodes"]), "edges": len(document["edges"])})
    print(json.dumps({"ok": True, "changes": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
