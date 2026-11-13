#!/usr/bin/env python3
"""Create a compact, sourced historical Canvas using Paperstream's public API.

Run from any directory: python3 scripts/create-computing-ai-history.py NEW.canvas
Creation refuses an existing path. It does not overwrite a reader's later edits.
The bundled portrait thumbnails retain their separate licenses; see the source
table and assets/history/computing/manifest.json when sharing an image export.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from paperstream import CanvasGraph

# name is the original paper title where this is a paper; historical events
# intentionally have no invented paper title. Portrait subjects are not a list
# of all authors. In particular Kasparov is an opponent and Amodei represents a
# company/team, rather than claiming sole authorship of a model.
MILESTONES = [
    ("eniac_1946", 1946, "ENIAC · 电子计算", "电子通用计算机的代表。\nMauchly、Eckert 与编程团队共同推进。", None,
     "https://www.computerhistory.org/tdih/February/14/", "mauchly", "John Mauchly · 设计团队"),
    ("turing_1950", 1950, "图灵 · 机器能思考吗", "以模仿游戏讨论机器智能，\n把问题转向可观察的交互。", "Computing Machinery and Intelligence",
     "https://turingarchive.kings.cam.ac.uk/computing-machinery-and-intelligence", "turing", "Alan Turing"),
    ("dartmouth_1956", 1956, "Dartmouth · AI 命名", "夏季研究项目汇聚早期研究者，\n人工智能成为明确的研究议题。", None,
     "https://www.dartmouth.edu/its-tools/archive/history/timeline/early.html", "mccarthy", "John McCarthy · 组织者之一"),
    ("perceptron_1958", 1958, "Perceptron · 从样例学", "通过调整连接权重学习分类；\n这是早期神经学习的重要节点。", "The Perceptron: A Probabilistic Model for Information Storage and Organization in the Brain",
     "https://www.cs.cmu.edu/~epxing/Class/10715/reading/Rosenblatt.perceptron.pdf", "rosenblatt", "Frank Rosenblatt"),
    ("eliza_1966", 1966, "ELIZA · 规则式对话", "关键词与规则产生对话回应；\n流畅的表面不等于理解。", "ELIZA—A Computer Program For the Study of Natural Language Communication Between Man and Machine",
     "https://www.computerhistory.org/timeline/1966/", "weizenbaum", "Joseph Weizenbaum"),
    ("backprop_1986", 1986, "反向传播 · 学习表征", "Rumelhart、Hinton、Williams\n展示多层网络学习内部表征。", "Learning representations by back-propagating errors",
     "https://www.cs.toronto.edu/~hinton/backprop.html", "hinton", "Geoffrey Hinton · 共同作者"),
    ("deepblue_1997", 1997, "Deep Blue · 搜索与算力", "IBM 系统在六局国际象棋赛中\n战胜世界冠军 Kasparov。", None,
     "https://www.ibm.com/history/deep-blue", "kasparov", "Garry Kasparov · 对弈者"),
    ("lenet_1998", 1998, "LeNet-5 · 卷积识别", "卷积与梯度学习用于手写数字，\n形成实用的文档识别系统。", "Gradient-Based Learning Applied to Document Recognition",
     "https://bottou.org/papers/lecun-98h", "lecun", "Yann LeCun · 共同作者"),
    ("alexnet_2012", 2012, "AlexNet · 视觉突破", "大数据、GPU 与深层卷积网络\n推动 ImageNet 图像分类进展。", "ImageNet Classification with Deep Convolutional Neural Networks",
     "https://proceedings.neurips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html", "hinton", "Geoffrey Hinton · 共同作者"),
    ("gan_2014", 2014, "GAN · 对抗式生成", "生成器与判别器相互博弈，\n开拓学习数据分布的生成方法。", "Generative Adversarial Nets",
     "https://proceedings.neurips.cc/paper/2014/hash/f033ed80deb0234979a61f95710dbe25-Abstract.html", "goodfellow", "Ian Goodfellow · 共同作者"),
    ("alphago_2016", 2016, "AlphaGo · 学习＋搜索", "策略网络、价值网络与树搜索\n协同处理围棋决策。", "Mastering the game of Go with deep neural networks and tree search",
     "https://www.nature.com/articles/nature16961", "hassabis", "Demis Hassabis · 共同作者"),
    ("transformer_2017", 2017, "Transformer · 注意力", "以注意力为核心的序列架构，\n为后续大规模预训练提供基础。", "Attention Is All You Need",
     "https://arxiv.org/abs/1706.03762v1", "gomez", "Aidan N. Gomez · 共同作者"),
    ("gpt3_2020", 2020, "GPT-3 · 上下文学习", "扩大自回归语言模型，探索\n只用提示与少量示例完成任务。", "Language Models are Few-Shot Learners",
     "https://arxiv.org/abs/2005.14165v1", "amodei", "Dario Amodei · 共同作者"),
    ("instructgpt_2022", 2022, "InstructGPT · 人类反馈", "示范、偏好排序与强化学习\n让模型更好地遵循用户指令。", "Training language models to follow instructions with human feedback",
     "https://arxiv.org/abs/2203.02155v1", "christiano", "Paul Christiano · 共同作者"),
    ("alphafold3_2024", 2024, "AlphaFold 3 · 科学模型", "用扩散模型预测蛋白质及其他\n生物分子的复合物结构。", "Accurate structure prediction of biomolecular interactions with AlphaFold 3",
     "https://www.nature.com/articles/s41586-024-07487-w", "hassabis", "Demis Hassabis · 共同作者"),
    ("claude_2026", 2026, "Claude Opus 5.5 · Agent", "2026-09-22 发布。编程、工具\n与长任务成为模型应用方向。", None,
     "https://www.anthropic.com/claude-opus-5-5", "amodei", "Dario Amodei · 团队代表"),
]


def jpeg_size(data: bytes) -> tuple[int, int]:
    """Read JPEG frame geometry without an image-library runtime dependency."""
    assert data[:2] == b"\xff\xd8"
    offset = 2
    while offset < len(data):
        if data[offset] != 255:
            offset += 1
            continue
        while data[offset] == 255:
            offset += 1
        marker = data[offset]
        offset += 1
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        length = struct.unpack(">H", data[offset:offset + 2])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height, width = struct.unpack(">HH", data[offset + 3:offset + 7])
            return width, height
        offset += length
    raise ValueError("No JPEG frame found")


def create(path: Path) -> CanvasGraph:
    manifest = json.loads((ROOT / "assets/history/computing/manifest.json").read_text())
    graph = CanvasGraph.create(path)
    for index, (identity, year, alias, takeaway, name, url, portrait, caption) in enumerate(MILESTONES):
        graph.add_node(alias, takeaway, node_id=identity, name=name, url=url,
                       year=year, x=60 + index % 4 * 540, y=170 + index // 4 * 380,
                       width=460, height=320)
    # Keep each row independent: these arrows indicate chronology, not a false
    # scientific ancestry chain or direct influence between adjacent events.
    for row in range(4):
        for col in range(3):
            index = row * 4 + col
            graph.add_edge(MILESTONES[index][0], MILESTONES[index + 1][0], "",
                           edge_id=f"time_{row + 1}_{col + 1}")
    document = graph.to_dict()
    for index, node in enumerate(document["nodes"]):
        entry = MILESTONES[index]
        portrait, caption = entry[-2:]
        provenance = manifest["portraits"][portrait]
        data = (ROOT / provenance["file"]).read_bytes()
        assert hashlib.sha256(data).hexdigest() == provenance["sha256"]
        width, height = jpeg_size(data)
        node["color"] = ["4", "5", "6", "2"][index // 4]
        node["paperstreamStyle"] = {"heightMode": "manual", "strokeWidth": 1.5}
        node["paperstreamCard"] = {
            "kind": "paper" if entry[4] else "note",
            "figures": [{"id": f"portrait_{portrait}", "src": "data:image/jpeg;base64," + base64.b64encode(data).decode(),
                         "caption": caption.split(" · ")[0], "widthPercent": 25,
                         "context": caption,
                         "naturalWidth": width, "naturalHeight": height,
                         "sourceUrl": provenance["commons"], "author": provenance["author"],
                         "license": provenance["license"], "licenseUrl": provenance["licenseUrl"],
                         "changes": provenance["changes"]}],
        }
    for edge in document["edges"]:
        edge.update(fromSide="right", toSide="left")
        edge["paperstreamStyle"] = {"strokeWidth": 1.3}
    document["nodes"].insert(0, {
        "id": "history_title", "type": "text", "x": 60, "y": 20, "width": 2080, "height": 135,
        "label": "Paperstream · 从电子计算到 AI",
        "text": "1946—2026｜16 个里程碑精选。每行从左向右，再读下一行；箭头只表示时间顺序，不表示直接继承。\n从电子通用计算机时代切入；机械计算、计算理论与早期专用计算机不在此简图范围内。肖像仅展示部分相关人物。",
        "paperstreamCard": {"kind": "note"}, "paperstreamStyle": {"heightMode": "manual"},
    })
    document["nodes"].append({
        "id": "history_scope_and_credits", "type": "text", "x": 60, "y": 1660, "width": 2080, "height": 205,
        "label": "截至 2026-11-13 · 精选而非全史",
        "text": "2025 DeepSeek-R1 推进强化学习推理；2026 DeepSeek-V4.1-Flash-1017（10-17）与 Claude Opus 5.5（09-22）是当年更新的两个例子，不是完整模型榜单。\n肖像署名（Commons 缩略图，未另作修改）：BY-SA 4.0：Rosenblatt／匿名（HNF 来源），Hinton、Hassabis／Cmichel67，Goodfellow／Ian Goodfellow，Gomez／Gabriel Hutchinson；BY-SA 2.0：McCarthy／null0，LeCun／Jérémy Barande；BY 4.0：Christiano／IPAM；BY 2.0：Amodei／TechCrunch。\n公共领域来源：Turing／Elliott & Fry，Weizenbaum／RIT，Kasparov／Commons 上传者 Sergei。Mauchly／摄影者未知，Commons 标注美国无版权声明公有领域。\n完整事实来源、原图及许可链接：docs/research/computing-ai-history-sources.md（分发导出图片时请一并附上）。",
        "paperstreamCard": {"kind": "note"}, "paperstreamStyle": {"heightMode": "manual"},
    })
    document["paperstreamHistory"] = {
        "scope": "Selected computing and AI milestones; chronology is not direct scientific inheritance",
        "checked": "2026-11-13", "sources": "docs/research/computing-ai-history-sources.md",
        "currentExamples": ["https://api-docs.deepseek.com/news/news250120/", "https://api-docs.deepseek.com/news/news261017/", "https://www.anthropic.com/claude-opus-5-5"],
    }
    graph.set_document(document)
    graph.validate()
    graph.save()
    actual = CanvasGraph.load(path)
    actual.validate()
    assert actual.to_dict() == document
    assert len(actual.nodes()) == 16 and len(actual.edges()) == 12
    return actual


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New .canvas path; existing files are refused")
    args = parser.parse_args()
    result = create(args.output.resolve())
    print(json.dumps({"ok": True, "file": str(result.path), "milestones": len(result.nodes()), "edges": len(result.edges())}))
