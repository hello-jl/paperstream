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
from paperstream import CanvasGraph  # noqa: E402
from scripts.history_portraits import apply_portrait_layout  # noqa: E402
from scripts.history_illustrations import apply_history_illustrations  # noqa: E402

MILESTONES = [
    ("dl_backprop_1986", 1986, "反向传播 · 表示学习",
     "Learning representations by back-propagating errors",
     "https://doi.org/10.1038/323533a0",
     "- Rumelhart、Hinton、Williams\n- 让多层网络学习内部表示", "hinton", "Geoffrey Hinton"),
    ("dl_lenet_1989", 1989, "LeNet 的早期实践",
     "Handwritten Digit Recognition with a Back-Propagation Network",
     "https://papers.nips.cc/paper_files/paper/1989/hash/53c3bce66e43be4f209556518c2fcb54-Abstract.html",
     "- LeCun 等：手写邮编识别\n- 共享权重与任务结构进入网络", "lecun", "Yann LeCun"),
    ("dl_alexnet_2012", 2012, "AlexNet · GPU 与大数据",
     "ImageNet Classification with Deep Convolutional Neural Networks",
     "https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html",
     "- Krizhevsky、Sutskever、Hinton\n- 大规模卷积网络推动视觉突破", "hinton", "Geoffrey Hinton"),
    ("dl_resnet_2015", 2015, "ResNet · 残差连接",
     "Deep Residual Learning for Image Recognition",
     "https://arxiv.org/abs/1512.03385",
     "- He、Zhang、Ren、Sun\n- 让极深网络更容易优化\n- 2015 预印本；CVPR 2016", None, None),
    ("dl_vit_2020", 2020, "ViT · 视觉 Transformer",
     "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
     "https://arxiv.org/abs/2010.11929",
     "- Dosovitskiy 等（2020 预印本；ICLR 2021）\n- 图像切分 patch 序列直接送入标准 Transformer\n- 大规模预训练下突破卷积局部归纳偏置", None, None),
    ("dl_lstm_1997", 1997, "LSTM · 记住更长的序列",
     "Long Short-Term Memory",
     "https://doi.org/10.1162/neco.1997.9.8.1735",
     "- Hochreiter 与 Schmidhuber\n- 缓解长时依赖的梯度问题", "schmidhuber", "Jürgen Schmidhuber"),
    ("dl_seq2seq_2014", 2014, "Seq2Seq · 端到端序列转换",
     "Sequence to Sequence Learning with Neural Networks",
     "https://arxiv.org/abs/1409.3215",
     "- Sutskever、Vinyals、Le\n- 深层 LSTM 编码与解码序列", "sutskever", "Ilya Sutskever"),
    ("dl_transformer_2017", 2017, "Transformer · 注意力架构",
     "Attention Is All You Need",
     "https://arxiv.org/abs/1706.03762",
     "- Vaswani 等八位共同作者\n- 用注意力进行并行序列建模", None, None),
    ("dl_gpt3_2020", 2020, "GPT-3 · 大规模少样本学习",
     "Language Models are Few-Shot Learners",
     "https://arxiv.org/abs/2005.14165",
     "- Brown 等；上下文学习\n- 从提示中的示例执行多种任务", None, None),
    ("dl_instructgpt_2022", 2022, "InstructGPT · 人类反馈对齐",
     "Training language models to follow instructions with human feedback",
     "https://arxiv.org/abs/2203.02155",
     "- Ouyang 等；图示共作者 Christiano\n- 示范、偏好与强化学习结合", "christiano", "Paul Christiano"),
    ("dl_vae_2013", 2013, "VAE · 变分自编码器",
     "Auto-Encoding Variational Bayes",
     "https://arxiv.org/abs/1312.6114",
     "- Kingma 与 Welling（2013 预印本；ICLR 2014）\n- 重参数化技巧让梯度流过随机采样\n- 建立深度潜变量生成与变分下界（ELBO）", None, None),
    ("dl_ddpm_2020", 2020, "DDPM · 逐步去噪生成",
     "Denoising Diffusion Probabilistic Models",
     "https://arxiv.org/abs/2006.11239",
     "- Ho、Jain、Abbeel\n- 扩散模型实现高质量图像合成", "abbeel", "Pieter Abbeel"),
    ("dl_ldm_2022", 2022, "LDM · 隐空间条件扩散",
     "High-Resolution Image Synthesis with Latent Diffusion Models",
     "https://openaccess.thecvf.com/content/CVPR2022/html/Rombach_High-Resolution_Image_Synthesis_With_Latent_Diffusion_Models_CVPR_2022_paper.html",
     "- Rombach 等（CVPR 2022；Stable Diffusion 基础）\n- 在感知压缩隐空间执行高效扩散去噪\n- 用交叉注意力接入文本等条件控制", None, None),
]

NODE_LAYOUT = {
    "dl_history_title": (20, 15, 425, 195, "#b5c7bb", 1.0),
    "dl_backprop_1986": (20, 385, 355, 312, "#2f6f5e", 2.6),
    "dl_lenet_1989": (525, 110, 345, 305, "#4b7f6c", 1.7),
    "dl_alexnet_2012": (1015, 45, 360, 312, "#2f6f5e", 2.5),
    "dl_resnet_2015": (1520, 95, 395, 318, "#2f6f5e", 2.6),
    "dl_vit_2020": (2115, 130, 360, 210, "#2f6f5e", 2.3),
    "dl_lstm_1997": (545, 505, 345, 305, "#4e8092", 1.7),
    "dl_seq2seq_2014": (1035, 555, 350, 305, "#4e8092", 1.8),
    "dl_transformer_2017": (1535, 525, 415, 328, "#1b5266", 3.0),
    "dl_gpt3_2020": (2165, 455, 395, 318, "#2b6f84", 2.6),
    "dl_instructgpt_2022": (2700, 385, 365, 312, "#2b6f84", 2.3),
    "dl_vae_2013": (685, 935, 360, 210, "#5d6f8a", 1.8),
    "dl_ddpm_2020": (1355, 945, 355, 305, "#5d6f8a", 2.2),
    "dl_ldm_2022": (2125, 910, 390, 215, "#5d6f8a", 2.4),
    "dl_history_credits": (2675, 855, 380, 250, "#b5c7bb", 1.0),
}

EDGES_SPEC = [
    ("dl_bp_to_lenet", "dl_backprop_1986", "dl_lenet_1989", "反传训练", "right", "left", "#2f6f5e", 2.5, "solid"),
    ("dl_bp_to_lstm", "dl_backprop_1986", "dl_lstm_1997", "缓解梯度消失", "right", "left", "#4e8092", 1.9, "dashed"),
    ("dl_bp_to_vae", "dl_backprop_1986", "dl_vae_2013", "重参数化反传", "bottom", "left", "#5d6f8a", 1.9, "dashed"),
    ("dl_lenet_to_alexnet", "dl_lenet_1989", "dl_alexnet_2012", "卷积扩大规模", "right", "left", "#2f6f5e", 2.7, "solid"),
    ("dl_alexnet_to_resnet", "dl_alexnet_2012", "dl_resnet_2015", "残差学习，缓解退化", "right", "left", "#2f6f5e", 2.9, "solid"),
    ("dl_resnet_to_vit", "dl_resnet_2015", "dl_vit_2020", "纯注意力替代卷积", "right", "left", "#2f6f5e", 1.9, "dashed"),
    ("dl_resnet_to_transformer", "dl_resnet_2015", "dl_transformer_2017", "沿用残差连接", "bottom", "top", "#2f6f5e", 2.2, "dashed"),
    ("dl_lstm_to_seq2seq", "dl_lstm_1997", "dl_seq2seq_2014", "深层 LSTM 编解码", "right", "left", "#2b6f84", 2.6, "solid"),
    ("dl_seq2seq_to_transformer", "dl_seq2seq_2014", "dl_transformer_2017", "序列转换：改用注意力", "right", "left", "#2b6f84", 3.1, "solid"),
    ("dl_transformer_to_vit", "dl_transformer_2017", "dl_vit_2020", "图像分块自注意力", "right", "left", "#2f6f5e", 2.4, "solid"),
    ("dl_transformer_to_gpt3", "dl_transformer_2017", "dl_gpt3_2020", "自回归规模扩展", "right", "left", "#2b6f84", 3.2, "solid"),
    ("dl_transformer_to_ldm", "dl_transformer_2017", "dl_ldm_2022", "交叉注意力条件", "right", "left", "#5d6f8a", 2.0, "dashed"),
    ("dl_gpt3_to_instructgpt", "dl_gpt3_2020", "dl_instructgpt_2022", "在 GPT-3 上微调", "right", "left", "#2b6f84", 3.0, "solid"),
    ("dl_vae_to_ddpm", "dl_vae_2013", "dl_ddpm_2020", "变分下界 ELBO", "right", "left", "#5d6f8a", 2.5, "solid"),
    ("dl_ddpm_to_ldm", "dl_ddpm_2020", "dl_ldm_2022", "隐空间高效去噪", "right", "left", "#5d6f8a", 2.7, "solid"),
]

RELATION_EVIDENCE = {
    "dl_bp_to_lstm": {
        "type": "other",
        "evidence": "LSTM 针对循环网络通过时间反向传播（BPTT）时的误差衰减与爆炸问题，设计恒定误差通道与门控机制以维持长程梯度流。\n依据：Long Short-Term Memory，Neural Computation 9(8), 1997，§1、§3。\nhttps://doi.org/10.1162/neco.1997.9.8.1735",
    },
    "dl_bp_to_vae": {
        "type": "other",
        "evidence": "VAE 将随机采样重构为确定性变换加外部噪声（重参数化技巧），使变分下界能够直接通过标准反向传播优化编码器。\n依据：Auto-Encoding Variational Bayes，2013（arXiv:1312.6114），§2.4。\nhttps://arxiv.org/abs/1312.6114",
    },
    "dl_alexnet_to_resnet": {
        "type": "other",
        "evidence": "视觉网络不断加深后，单纯堆层会出现训练误差反而上升的退化。ResNet 通过学习残差映射，使深层网络更容易优化。这条阅读线索省略 VGG 等中间工作。\n依据：Deep Residual Learning for Image Recognition，§1、§3.1。\nhttps://arxiv.org/abs/1512.03385",
    },
    "dl_resnet_to_vit": {
        "type": "other",
        "evidence": "ViT 以标准 Transformer 在大规模图像预训练下直接对 ResNet 类卷积主干提出对比与替代，保留残差流并用全局自注意力取代局部卷积偏置。\n依据：An Image is Worth 16x16 Words，2020（arXiv:2010.11929），§1、§4。\nhttps://arxiv.org/abs/2010.11929",
    },
    "dl_resnet_to_transformer": {
        "type": "inheritance",
        "evidence": "Transformer 在编码器与解码器的注意力、前馈子层外使用残差连接，并明确引用 He 等人的 ResNet。此边表示残差组件的复用；注意力的序列建模路线另见 Seq2Seq → Transformer。\n依据：Attention Is All You Need，2017 NeurIPS 会议版，§3.1，第 3 页。\nhttps://papers.nips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf",
    },
    "dl_transformer_to_vit": {
        "type": "inheritance",
        "evidence": "ViT 将二维图像切分为展平 Patch 线性投影并加上位置编码，尽可能直接复用原始标准 Transformer 编码器模块。\n依据：An Image is Worth 16x16 Words，2020（arXiv:2010.11929），§3.1。\nhttps://arxiv.org/abs/2010.11929",
    },
    "dl_transformer_to_ldm": {
        "type": "inheritance",
        "evidence": "LDM 通过交叉注意力机制将文本或空间掩码等任意条件模态注入去噪 UNet 中间层，实现通用条件图像合成。\n依据：High-Resolution Image Synthesis with Latent Diffusion Models，CVPR 2022，§3.3。\nhttps://openaccess.thecvf.com/content/CVPR2022/html/Rombach_High-Resolution_Image_Synthesis_With_Latent_Diffusion_Models_CVPR_2022_paper.html",
    },
    "dl_vae_to_ddpm": {
        "type": "inheritance",
        "evidence": "DDPM 将扩散去噪过程建模为马尔可夫层次变分自编码器，以等价于重加权变分下界（ELBO）的目标训练噪声预测网络。\n依据：Denoising Diffusion Probabilistic Models，2020（arXiv:2006.11239），§2。\nhttps://arxiv.org/abs/2006.11239",
    },
    "dl_ddpm_to_ldm": {
        "type": "inheritance",
        "evidence": "LDM 将像素级 DDPM 的迭代去噪迁移至预训练自编码器构建的低维感知隐空间，在保持生成质量的同时大幅降低训练与采样算力。\n依据：High-Resolution Image Synthesis with Latent Diffusion Models，CVPR 2022，§3.1–3.2。\nhttps://openaccess.thecvf.com/content/CVPR2022/html/Rombach_High-Resolution_Image_Synthesis_With_Latent_Diffusion_Models_CVPR_2022_paper.html",
    },
}

RETAINED_PORTRAITS = {row[-2] for row in MILESTONES if row[-2]}


def populate_graph(graph: CanvasGraph) -> dict:
    """Populate a CanvasGraph with the curated 3-river deep learning history."""
    asset_root = ROOT / "assets/history/deep-learning"
    portraits = json.loads((asset_root / "portraits.json").read_text())

    graph.set_document({"nodes": [], "edges": []})
    for identity, year, alias, name, url, body, _, _ in MILESTONES:
        x, y, width, height, _, _ = NODE_LAYOUT[identity]
        graph.add_node(alias, body, node_id=identity, name=name, url=url, year=year,
                       x=x, y=y, width=width, height=height)

    routing = {}
    for eid, source, target, label, from_side, to_side, color, stroke, line_style in EDGES_SPEC:
        graph.add_edge(source, target, label, edge_id=eid)
        routing[eid] = {
            "fromSide": from_side,
            "toSide": to_side,
            "color": color,
            "paperstreamStyle": {"strokeWidth": stroke, "lineStyle": line_style, "waypoints": []},
        }

    document = graph.to_dict()
    for node, milestone in zip(document["nodes"], MILESTONES):
        nid = node["id"]
        _, _, width, _, color, stroke = NODE_LAYOUT[nid]
        node["color"] = color
        node["paperstreamStyle"] = {"heightMode": "manual", "strokeWidth": stroke}
        node["paperstreamCard"] = {"kind": "paper"}
        portrait, person = milestone[-2:]
        if portrait:
            info = portraits[portrait]
            data = (asset_root / info["file"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != info["sha256"]:
                raise ValueError(f"Portrait changed without updating credits: {portrait}")
            node["paperstreamCard"]["figures"] = [{
                "id": "portrait_" + portrait,
                "src": "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii"),
                "caption": person,
                "widthPercent": 108 / (width - 36 - 2 * stroke) * 100,
                "naturalWidth": info["width"],
                "naturalHeight": info["height"],
                "sourceUrl": info["source"],
                "author": info["author"],
                "attribution": info.get("attribution") or info["author"],
                "license": info["license"],
                "licenseUrl": info["licenseUrl"],
                "changes": info["changes"],
                "person": person,
            }]

    for edge in document["edges"]:
        edge.update(routing[edge["id"]])
        if edge["id"] in RELATION_EVIDENCE:
            edge["paperstreamRelation"] = RELATION_EVIDENCE[edge["id"]].copy()

    def note(identity: str, label: str, text: str) -> dict:
        x, y, width, height, color, stroke = NODE_LAYOUT[identity]
        return {
            "id": identity, "type": "text", "x": x, "y": y,
            "width": width, "height": height, "label": label, "text": text,
            "color": color, "paperstreamCard": {"kind": "note"},
            "paperstreamStyle": {"heightMode": "manual", "strokeWidth": stroke},
        }

    document["nodes"].insert(0, note(
        "dl_history_title",
        "Paperstream · 深度学习的几条发展线",
        "从 1986 年反向传播出发，串联视觉、语言与生成三条核心演进脉络（1986–2022），汇流于 Transformer。\n"
        "绿流：视觉表征 · 蓝流：序列与大模型 · 灰蓝流：概率生成\n"
        "粗框/实线标分水岭主脉，虚线表跨脉络关键借鉴。",
    ))
    document["nodes"].append(note(
        "dl_history_credits",
        "来源与插图",
        "论文原文可从各卡片链接打开。\n"
        "肖像：Cmichel67；Jérémy Barande；ITU/R.Farrell；Eladkarmel；Pieterabbeel；IPAM"
        "（CC BY 2.0/4.0 与 CC BY-SA 2.0/4.0，详见 deep-learning-history-sources.md）。\n"
        "原理示意图：Paperstream contributors · MIT；据原论文／官方说明简化自绘。\n"
        "精选 13 篇串联三条主脉，非完整谱系。",
    ))
    document["paperstreamHistory"] = {
        "title": "A selective history of deep learning",
        "checked": "2026-11-21",
        "scope": "13 selected milestones bridging Vision, Sequence/LLM & Generative threads (1986–2022); not an exhaustive current-model catalogue",
        "sources": "../docs/research/deep-learning-history-sources.md",
        "portraitRights": {k: portraits[k] for k in portraits if k in RETAINED_PORTRAITS},
        "missingPortraits": [{"node": "dl_resnet_2015", "people": ["Kaiming He", "Xiangyu Zhang", "Shaoqing Ren", "Jian Sun"],
                              "reason": "No sufficiently verified open portrait license located; no unlicensed substitute included."}],
    }
    apply_portrait_layout(document, "deep-learning", [row[0] for row in MILESTONES])
    apply_history_illustrations(document, "deep-learning")

    # Apply final diagram display widths matched to the three-river layout.
    for node in document["nodes"]:
        nid = node["id"]
        stroke = node.get("paperstreamStyle", {}).get("strokeWidth", 1)
        content_box = node["width"] - 36 - 2 * stroke
        for fig in node.get("paperstreamCard", {}).get("figures", []):
            if fig.get("id", "").startswith("diagram_"):
                target_px = 268 if nid == "dl_transformer_2017" else 248
                fig["widthPercent"] = target_px / content_box * 100

    graph.set_document(document)
    graph.validate()
    graph.save()
    after = CanvasGraph.load(graph.path)
    after.validate()
    if after.to_dict() != document:
        raise AssertionError("Saved document did not round-trip through CanvasGraph")
    return {
        "ok": True, "file": str(after.path), "cards": len(document["nodes"]),
        "papers": len(after.nodes()), "edges": len(after.edges()),
        "portraits": sum(bool(row[-2]) for row in MILESTONES),
    }


def create(output: Path) -> dict:
    return populate_graph(CanvasGraph.create(output))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", type=Path,
                        default=ROOT / "examples/deep-learning-history.canvas")
    print(json.dumps(create(parser.parse_args().output), ensure_ascii=False))
