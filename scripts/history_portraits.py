"""Shared, reversible presentation for the two sourced history examples.

This module only prepares a document copy. Callers must load/create, validate
and save with CanvasGraph; it never writes a Canvas or changes source photos.
"""
from __future__ import annotations


PORTRAIT_WIDTH = 108
PORTRAIT_ASPECT = 3 / 4

# Positions follow object-position: the remaining space after scaling is
# multiplied by the percentage. Profiles are display crops, not altered photos.
PORTRAIT_PROFILES: dict[str, dict] = {
    "mauchly": {"positionX": 60, "positionY": 0, "zoom": 1.25},
    "turing": {"positionY": 0},
    "mccarthy": {"fit": "contain", "positionY": 50},
    "rosenblatt": {"positionY": 0},
    "weizenbaum": {"positionY": 0, "zoom": 1.25},
    "hinton": {"positionX": 100, "positionY": 0, "zoom": 1.1},
    "kasparov": {"positionY": 0},
    "lecun": {"positionX": 46, "positionY": 0, "zoom": 1.15},
    "schmidhuber": {"positionY": 0},
    "goodfellow": {"fit": "contain", "positionY": 50},
    "sutskever": {"positionX": 47, "positionY": 20, "zoom": 2.8},
    "deep-learning:hassabis": {"positionY": 0},
    "computing:hassabis": {"positionX": 90, "positionY": 0, "zoom": 1.25},
    "gomez": {"positionX": 75, "positionY": 25, "zoom": 1.2},
    "amodei": {"positionY": 0},
    "abbeel": {"positionX": 69, "positionY": 32, "zoom": 2.5},
    "jumper": {"positionY": 0},
    "christiano": {"positionX": 60, "positionY": 0, "zoom": 2},
}


def apply_portrait_layout(document: dict, family: str, milestone_ids: list[str]) -> None:
    if family not in ("computing", "deep-learning"):
        raise ValueError("Unknown history family")
    indices = {identity: index for index, identity in enumerate(milestone_ids)}
    for node in document["nodes"]:
        if node["id"] not in indices:
            continue
        index = indices[node["id"]]
        node["y"] = 170 + index // 4 * 400 if family == "computing" else 160 + index // 4 * 440
        node["height"] = 340 if family == "computing" else 320
        card = node.get("paperstreamCard", {})
        for figure in card.get("figures", []):
            if not isinstance(figure, dict) or not figure.get("id", "").startswith("portrait_"):
                continue
            person = figure["id"].removeprefix("portrait_")
            profile = PORTRAIT_PROFILES.get(f"{family}:{person}", PORTRAIT_PROFILES.get(person, {}))
            figure["frame"] = {**figure.get("frame", {}), "aspectRatio": PORTRAIT_ASPECT,
                               "fit": "cover", "positionX": 50, "positionY": 35, "zoom": 1,
                               **profile}
            figure["align"] = "center"
            # The UI content box excludes the card border as well as padding.
            stroke = node.get("paperstreamStyle", {}).get("strokeWidth", 1)
            figure["widthPercent"] = PORTRAIT_WIDTH / (node["width"] - 36 - 2 * stroke) * 100
            figure["displayChanges"] = "Reversible 3:4 portrait framing and positioning; embedded source bytes unchanged."

    if family == "computing":
        title = next(node for node in document["nodes"] if node["id"] == "history_title")
        title["height"] = 140
        credits = next(node for node in document["nodes"] if node["id"] == "history_scope_and_credits")
        credits["y"] = 1800
    else:
        title = next(node for node in document["nodes"] if node["id"] == "dl_history_title")
        title["height"] = 120
        for node in document["nodes"]:
            if node["id"] in ("dl_history_scope", "dl_history_credits"):
                node.update(y=1480, height=320)
        routing = {
            "dl_bp_to_lenet": ([], (435, 320)),
            "dl_lenet_to_alexnet": ([(675, 540), (195, 540)], (435, 540)),
            "dl_lstm_to_seq2seq": ([], (1155, 540)),
            "dl_alexnet_to_resnet": ([(195, 1010), (1635, 1010)], (480, 1010)),
            "dl_seq2seq_to_transformer": ([(1155, 980), (675, 980)], (870, 980)),
            "dl_transformer_to_gpt3": ([], (915, 1200)),
            "dl_gpt3_to_instructgpt": ([(1155, 1420), (675, 1420)], (915, 1420)),
            "dl_resnet_to_transformer": ([(1395, 760), (1395, 950), (675, 950)], (1280, 950)),
        }
        for edge in document["edges"]:
            if edge["id"] in routing:
                points, label = routing[edge["id"]]
                style = edge.setdefault("paperstreamStyle", {})
                style["waypoints"] = [{"x": x, "y": y} for x, y in points]
                style["labelPosition"] = {"x": label[0], "y": label[1]}
    document.setdefault("paperstreamHistory", {})["portraitLayout"] = {
        "version": 1, "aspectRatio": PORTRAIT_ASPECT, "width": PORTRAIT_WIDTH,
        "alignment": "center", "checked": "2026-11-14",
    }
