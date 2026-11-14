#!/usr/bin/env python3
"""Create the curated history example through Paperstream's public API.

This intentionally refuses an existing output. Edit an existing graph by loading
it and applying a scoped API patch instead of rebuilding it with this script.
Portrait files and their attribution manifest are checked into the repository;
the generator makes no network requests and has no third-party dependencies.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from paperstream import CanvasGraph
from scripts.history_portraits import apply_portrait_layout


MILESTONES = [
    ("dl_backprop_1986", 1986, "反向传播 · 表示学习",
     "Learning representations by back-propagating errors",
     "https://doi.org/10.1038/323533a0",
     "- Rumelhart、Hinton、Williams\n- 让多层网络学习内部表示", "hinton", "Geoffrey Hinton"),
    ("dl_lenet_1989", 1989, "LeNet 的早期实践",
     "Handwritten Digit Recognition with a Back-Propagation Network",
     "https://papers.nips.cc/paper_files/paper/1989/hash/53c3bce66e43be4f209556518c2fcb54-Abstract.html",
     "- LeCun 等：手写邮编识别\n- 共享权重与任务结构进入网络", "lecun", "Yann LeCun"),
    ("dl_lstm_1997", 1997, "LSTM · 记住更长的序列",
     "Long Short-Term Memory",
     "https://doi.org/10.1162/neco.1997.9.8.1735",
     "- Hochreiter 与 Schmidhuber\n- 缓解长时依赖的梯度问题", "schmidhuber", "Jürgen Schmidhuber"),
    ("dl_dbn_2006", 2006, "深度信念网络 · 逐层预训练",
     "A fast learning algorithm for deep belief nets",
     "https://www.cs.toronto.edu/~hinton/absps/fastnc.pdf",
     "- Hinton、Osindero、Teh\n- 无监督逐层学习，再整体微调", "hinton", "Geoffrey Hinton"),
    ("dl_alexnet_2012", 2012, "AlexNet · GPU 与大数据",
     "ImageNet Classification with Deep Convolutional Neural Networks",
     "https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html",
     "- Krizhevsky、Sutskever、Hinton\n- 大规模卷积网络推动视觉突破", "hinton", "Geoffrey Hinton"),
    ("dl_gan_2014", 2014, "GAN · 生成与判别的博弈",
     "Generative Adversarial Networks",
     "https://arxiv.org/abs/1406.2661",
     "- Goodfellow 等\n- 用对抗训练学习数据分布", "goodfellow", "Ian Goodfellow"),
    ("dl_seq2seq_2014", 2014, "Seq2Seq · 端到端序列转换",
     "Sequence to Sequence Learning with Neural Networks",
     "https://arxiv.org/abs/1409.3215",
     "- Sutskever、Vinyals、Le\n- 深层 LSTM 编码与解码序列", "sutskever", "Ilya Sutskever"),
    ("dl_resnet_2015", 2015, "ResNet · 残差连接",
     "Deep Residual Learning for Image Recognition",
     "https://arxiv.org/abs/1512.03385",
     "- He、Zhang、Ren、Sun\n- 让极深网络更容易优化\n- 2015 预印本；CVPR 2016\n\n肖像待授权：何恺明及共同作者", None, None),
    ("dl_alphago_2016", 2016, "AlphaGo · 学习与搜索结合",
     "Mastering the game of Go with deep neural networks and tree search",
     "https://doi.org/10.1038/nature16961",
     "- Silver、Huang 等；Hassabis\n- 策略网络、价值网络与树搜索", "hassabis", "Demis Hassabis"),
    ("dl_transformer_2017", 2017, "Transformer · 注意力架构",
     "Attention Is All You Need",
     "https://arxiv.org/abs/1706.03762",
     "- Vaswani 等八位共同作者\n- 用注意力进行并行序列建模", "gomez", "Aidan N. Gomez"),
    ("dl_gpt3_2020", 2020, "GPT-3 · 大规模少样本学习",
     "Language Models are Few-Shot Learners",
     "https://arxiv.org/abs/2005.14165",
     "- Brown 等；图示共作者 Amodei\n- 从提示中的示例执行多种任务", "amodei", "Dario Amodei"),
    ("dl_ddpm_2020", 2020, "DDPM · 逐步去噪生成",
     "Denoising Diffusion Probabilistic Models",
     "https://arxiv.org/abs/2006.11239",
     "- Ho、Jain、Abbeel\n- 扩散模型实现高质量图像合成", "abbeel", "Pieter Abbeel"),
    ("dl_alphafold_2021", 2021, "AlphaFold 2 · 蛋白质结构",
     "Highly accurate protein structure prediction with AlphaFold",
     "https://www.nature.com/articles/s41586-021-03819-2",
     "- Jumper、Evans 等\n- 用领域知识与深度网络预测结构", "jumper", "John Jumper"),
    ("dl_instructgpt_2022", 2022, "InstructGPT · 人类反馈对齐",
     "Training language models to follow instructions with human feedback",
     "https://arxiv.org/abs/2203.02155",
     "- Ouyang 等；图示共作者 Christiano\n- 示范、偏好与强化学习结合", "christiano", "Paul Christiano"),
]

RELATION_EVIDENCE = {
    "dl_alexnet_to_resnet": {
        "type": "other",
        "evidence": "视觉网络不断加深后，单纯堆层会出现训练误差反而上升的退化。ResNet 通过学习残差映射，使深层网络更容易优化。这条阅读线索省略 VGG 等中间工作。\n依据：Deep Residual Learning for Image Recognition，§1、§3.1。\nhttps://arxiv.org/abs/1512.03385",
    },
    "dl_resnet_to_transformer": {
        "type": "inheritance",
        "evidence": "Transformer 在编码器与解码器的注意力、前馈子层外使用残差连接，并明确引用 He 等人的 ResNet。此边表示残差组件的复用；注意力的序列建模路线另见 Seq2Seq → Transformer。\n依据：Attention Is All You Need，2017 NeurIPS 会议版，§3.1，第 3 页。\nhttps://papers.nips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf",
    },
}


def create(output: Path) -> dict:
    asset_root = ROOT / "assets/history/deep-learning"
    portraits = json.loads((asset_root / "portraits.json").read_text())
    graph = CanvasGraph.create(output)
    for index, (identity, year, alias, name, url, body, portrait, person) in enumerate(MILESTONES):
        graph.add_node(alias, body, node_id=identity, name=name, url=url, year=year,
                       x=index % 4 * 480, y=160 + index // 4 * 390,
                       width=390, height=280)

    # Each edge is an explicit technical link, not a claim that adjacent dates
    # or all models form a single direct inheritance chain.
    relations = [
        ("dl_bp_to_lenet", "dl_backprop_1986", "dl_lenet_1989", "反传训练", "right", "left", [], {"x": 435, "y": 300}),
        ("dl_lenet_to_alexnet", "dl_lenet_1989", "dl_alexnet_2012", "卷积网络扩大规模", "bottom", "top", [{"x": 675, "y": 500}, {"x": 195, "y": 500}], {"x": 435, "y": 500}),
        ("dl_lstm_to_seq2seq", "dl_lstm_1997", "dl_seq2seq_2014", "使用深层 LSTM", "bottom", "top", [], {"x": 1155, "y": 500}),
        ("dl_alexnet_to_resnet", "dl_alexnet_2012", "dl_resnet_2015", "残差学习，缓解退化", "bottom", "bottom", [{"x": 195, "y": 905}, {"x": 1635, "y": 905}], {"x": 480, "y": 905}),
        ("dl_seq2seq_to_transformer", "dl_seq2seq_2014", "dl_transformer_2017", "序列转换：改用注意力", "bottom", "top", [{"x": 1155, "y": 875}, {"x": 675, "y": 875}], {"x": 870, "y": 875}),
        ("dl_transformer_to_gpt3", "dl_transformer_2017", "dl_gpt3_2020", "自回归", "right", "left", [], {"x": 915, "y": 1080}),
        ("dl_gpt3_to_instructgpt", "dl_gpt3_2020", "dl_instructgpt_2022", "在 GPT-3 上微调", "bottom", "top", [{"x": 1155, "y": 1280}, {"x": 675, "y": 1280}], {"x": 915, "y": 1280}),
        ("dl_resnet_to_transformer", "dl_resnet_2015", "dl_transformer_2017", "沿用残差连接", "left", "top", [{"x": 1395, "y": 690}, {"x": 1395, "y": 855}, {"x": 675, "y": 855}], {"x": 1280, "y": 855}),
    ]
    routing = {}
    for identity, source, target, label, from_side, to_side, points, position in relations:
        graph.add_edge(source, target, label, edge_id=identity)
        routing[identity] = {"fromSide": from_side, "toSide": to_side,
                             "paperstreamStyle": {"strokeWidth": 1.5,
                                                  "waypoints": points,
                                                  "labelPosition": position}}

    document = graph.to_dict()
    for node, milestone in zip(document["nodes"], MILESTONES):
        node["color"] = "#8cae9e"
        node["paperstreamStyle"] = {"heightMode": "manual", "strokeWidth": 1}
        portrait, person = milestone[-2:]
        if portrait:
            info = portraits[portrait]
            data = (asset_root / info["file"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != info["sha256"]:
                raise ValueError(f"Portrait changed without updating credits: {portrait}")
            node["paperstreamCard"] = {"kind": "paper", "figures": [{
                "id": "portrait_" + portrait,
                "src": "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii"),
                "caption": person, "widthPercent": 21,
                "naturalWidth": info["width"], "naturalHeight": info["height"],
                "sourceUrl": info["source"], "author": info["author"],
                "attribution": info.get("attribution") or info["author"],
                "license": info["license"], "licenseUrl": info["licenseUrl"],
                "changes": info["changes"], "person": person,
            }]}
    for edge in document["edges"]:
        edge.update(routing[edge["id"]])
        if edge["id"] in RELATION_EVIDENCE:
            edge["paperstreamRelation"] = RELATION_EVIDENCE[edge["id"]].copy()

    def note(identity: str, label: str, text: str, x: int, y: int, width: int, height: int):
        return {"id": identity, "type": "text", "x": x, "y": y,
                "width": width, "height": height, "label": label, "text": text,
                "color": "#b5c7bb", "paperstreamCard": {"kind": "note"},
                "paperstreamStyle": {"heightMode": "manual", "strokeWidth": 1}}

    document["nodes"].insert(0, note("dl_history_title", "Paperstream · 深度学习的几条发展线",
        "从 Hinton 参与的 1986 年反传论文出发，精选 14 个里程碑。按行阅读时间，箭头表示注明的技术联系；不是完整谱系，也不是个人英雄史。核对范围截至 2026-11-13，未逐一收录最新模型。",
        0, 0, 1830, 112))
    document["nodes"].extend([
        note("dl_history_scope", "不是一条直线",
             "- 反向传播、神经网络与卷积思想均有更早工作。\n- DBN、GAN、扩散、语言建模各有独立前史。\n- 照片展示代表共作者；不是全部作者，也不表示其背书。\n- 2023–2026 模型可参看配套计算机与 AI 总史。",
             960, 1330, 390, 280),
        note("dl_history_credits", "来源与肖像",
             "论文原文可从各卡片链接打开。\n肖像：Cmichel67；Jérémy Barande；ITU/R.Farrell；Ian Goodfellow；Eladkarmel；John Sears；Gabriel Hutchinson；TechCrunch；Pieterabbeel；Jennifer 8. Lee；IPAM。\nCC BY 2.0/4.0 与 CC BY-SA 2.0/4.0；完整逐图归属、许可链接及缺项见 deep-learning-history-sources.md。\n何恺明等 ResNet 作者肖像待授权。",
             1440, 1330, 390, 280),
    ])
    document["paperstreamHistory"] = {
        "title": "A selective history of deep learning", "checked": "2026-11-13",
        "scope": "14 selected milestones, 1986–2022; not an exhaustive current-model catalogue",
        "sources": "../docs/research/deep-learning-history-sources.md",
        "portraitRights": portraits,
        "missingPortraits": [{"node": "dl_resnet_2015", "people": ["Kaiming He", "Xiangyu Zhang", "Shaoqing Ren", "Jian Sun"],
                              "reason": "No sufficiently verified open portrait license located; no unlicensed substitute included."}],
    }
    apply_portrait_layout(document, "deep-learning", [row[0] for row in MILESTONES])
    graph.set_document(document)
    graph.validate()
    graph.save()
    after = CanvasGraph.load(output)
    after.validate()
    if after.to_dict() != document:
        raise AssertionError("Saved document did not round-trip through CanvasGraph")
    return {"ok": True, "file": str(after.path), "papers": len(after.nodes()),
            "edges": len(after.edges()), "portraits": sum(bool(row[-2]) for row in MILESTONES)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", type=Path,
                        default=ROOT / "examples/deep-learning-history.canvas")
    print(json.dumps(create(parser.parse_args().output), ensure_ascii=False))
