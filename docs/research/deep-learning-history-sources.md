# 深度学习发展史：来源与图像归属

核对日期：2026-11-21。配套可编辑图为 [`examples/deep-learning-history.canvas`](../../examples/deep-learning-history.canvas)，由 [`scripts/create-deep-learning-history.py`](../../scripts/create-deep-learning-history.py) 调用 `CanvasGraph.create`、`add_node`、`add_edge`、`set_document`、`validate`、`save` 生成，并通过 API 回读核验。

这是从 Hinton 参与的 1986 年工作出发的 **13 项精选**（含 15 张卡片、15 条注明依据的技术连线），串联视觉表征、序列与大语言模型、深度概率生成三条演进脉络（1986–2022），并汇流/分光于 Transformer；不是 2026 年最新模型清单，也不是深度学习完整起源史。反向传播、自动微分、神经网络、卷积、注意力、变分推断和扩散模型各有更早工作。不能把有限篇幅或代表肖像理解成对作者贡献排名。后续模型与更大跨度总览另见计算机与 AI 总史。

## 论文与年份

| 稳定 ID | 卡片 | 引用版本与原始来源 | 展示图／代表共作者 |
|---|---|---|---|
| `dl_backprop_1986` | 反向传播 | Rumelhart, Hinton, Williams. *Learning representations by back-propagating errors*. Nature 323, 533–536 (1986). [原文 DOI](https://doi.org/10.1038/323533a0)，[作者收藏](https://www.cs.toronto.edu/~hinton/absps/naturebp.pdf) | Geoffrey Hinton |
| `dl_lenet_1989` | 早期 LeNet | LeCun 等. *Handwritten Digit Recognition with a Back-Propagation Network*. NIPS 1989. [会议原文](https://papers.nips.cc/paper_files/paper/1989/hash/53c3bce66e43be4f209556518c2fcb54-Abstract.html) | Yann LeCun |
| `dl_alexnet_2012` | AlexNet | Krizhevsky, Sutskever, Hinton. *ImageNet Classification with Deep Convolutional Neural Networks*. NIPS 2012. [会议原文](https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html) | Geoffrey Hinton |
| `dl_resnet_2015` | ResNet | He, Zhang, Ren, Sun. *Deep Residual Learning for Image Recognition*. [2015-12-10 预印本](https://arxiv.org/abs/1512.03385)；正式发表于 CVPR 2016，**未将预印本年份写成发表年份**。 | 残差连接原理图；作者身份不变 |
| `dl_vit_2020` | ViT | Dosovitskiy 等. *An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale*. [2020-10-22 预印本](https://arxiv.org/abs/2010.11929)；正式发表于 ICLR 2021，卡片年份按链接预印本标为 2020。 | 纯文字原理卡片 |
| `dl_lstm_1997` | LSTM | Hochreiter, Schmidhuber. *Long Short-Term Memory*. Neural Computation 9(8), 1735–1780 (1997). [DOI](https://doi.org/10.1162/neco.1997.9.8.1735)，[作者收藏](https://people.idsia.ch/~juergen/lstm1997-2024head.pdf) | Jürgen Schmidhuber |
| `dl_seq2seq_2014` | Seq2Seq | Sutskever, Vinyals, Le. *Sequence to Sequence Learning with Neural Networks*. [2014-09-10 预印本](https://arxiv.org/abs/1409.3215)，同年 NIPS。 | Ilya Sutskever |
| `dl_transformer_2017` | Transformer | Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin. *Attention Is All You Need*. [2017-06-12 首版](https://arxiv.org/abs/1706.03762)，NIPS 2017；当前 arXiv 页修订于 2023 年，不改变首版日期。 | 自注意力原理图；不以单人肖像代表团队 |
| `dl_gpt3_2020` | GPT-3 | Brown 等. *Language Models are Few-Shot Learners*. [2020-05-28 预印本](https://arxiv.org/abs/2005.14165)，NeurIPS 2020。 | 上下文学习原理图；完整作者名单见论文 |
| `dl_instructgpt_2022` | InstructGPT | Ouyang 等. *Training language models to follow instructions with human feedback*. [2022-03-04 预印本](https://arxiv.org/abs/2203.02155)，NeurIPS 2022。 | Paul Christiano，为论文共作者；并非第一作者 |
| `dl_vae_2013` | VAE | Kingma, Welling. *Auto-Encoding Variational Bayes*. [2013-12-20 预印本](https://arxiv.org/abs/1312.6114)；正式发表于 ICLR 2014，卡片年份按链接预印本标为 2013。 | 纯文字原理卡片 |
| `dl_ddpm_2020` | DDPM | Ho, Jain, Abbeel. *Denoising Diffusion Probabilistic Models*. [2020-06-19 预印本](https://arxiv.org/abs/2006.11239)，NeurIPS 2020。不是扩散模型的最早起点。 | Pieter Abbeel |
| `dl_ldm_2022` | LDM | Rombach, Blattmann, Lorenz, Esser, Ommer. *High-Resolution Image Synthesis with Latent Diffusion Models*. [CVPR 2022 正式论文](https://openaccess.thecvf.com/content/CVPR2022/html/Rombach_High-Resolution_Image_Synthesis_With_Latent_Diffusion_Models_CVPR_2022_paper.html)（2021 年 12 月挂出预印本，此处链接并标注 CVPR 2022）。 | 纯文字原理卡片 |

1989 卡片展示早期 LeNet 路线，不把该网络称为 1998 年的 LeNet-5。1986 卡片也不宣称 Hinton 独自发明反向传播。原先收录的 4 个无连线支线节点（`DBN`、`GAN`、`AlphaGo`、`AlphaFold 2`）于 2026-11-21 重构时由更直接衔接三条主干脉络的桥梁文献（`VAE`、`ViT`、`LDM`）替代，使其肖像素材留在档案表中备查，不再放于主图。

### 三条脉络与 15 条跨工作关系（2026-11-21）

全图不再按 4×4 方格折行，改以从左到右的三条波形河道与原生 `curved` 贝塞尔曲线连接所有 13 篇论文：实线表示同一主干脉络演进，虚线表示跨脉络机制借鉴，较长解释与原论文节号/链接同时保存在边对象的 `paperstreamRelation.evidence` 中：

- **视觉表征主脉（上流·深苔绿）**：`Backprop → LeNet`（反传训练）、`LeNet → AlexNet`（卷积扩大规模）、`AlexNet → ResNet`（残差学习，缓解退化，见 ResNet §1、§3.1）、`ResNet → ViT`（纯注意力替代卷积，虚线对比替代，见 ViT §1、§4）。
- **序列与大模型主脉（中枢·深青蓝）**：`Backprop → LSTM`（缓解梯度消失，虚线，见 LSTM 1997 §1、§3 针对 BPTT 的分析）、`LSTM → Seq2Seq`（深层 LSTM 编解码）、`Seq2Seq → Transformer`（序列转换：改用注意力）、`Transformer → GPT-3`（自回归规模扩展）、`GPT-3 → InstructGPT`（在 GPT-3 上微调）。
- **汇流与分光于 Transformer**：`ResNet → Transformer`（沿用残差连接，虚线，见 Transformer 2017 NeurIPS 版 §3.1 第 3 页明确引用）、`Transformer → ViT`（图像分块自注意力，见 ViT §3.1）、`Transformer → LDM`（交叉注意力条件，虚线，见 LDM CVPR 2022 §3.3）。
- **深度概率生成主脉（下流·灰蓝）**：`Backprop → VAE`（重参数化反传，虚线，见 VAE §2.4）、`VAE → DDPM`（变分下界 ELBO，见 DDPM §2）、`DDPM → LDM`（隐空间高效去噪，见 LDM CVPR 2022 §3.1–3.2）。

## 原理图与简化边界（2026-11-14）

当前 13 张论文卡使用 **7 张肖像展示（6 份肖像文件）与 3 张自绘原理图**（其余 3 张桥梁节点使用紧凑纯文字卡片）。`ResNet`、`Transformer` 与 `GPT-3` 机制图均为 **Paperstream contributors** 自绘，采用仓库 [MIT 许可证](../../LICENSE)；不是从论文中复制的插图。SVG、Canvas 内嵌 PNG 及校验值见 [原理图 manifest](../../assets/history/principles/manifest.json)。更换展示图不改变真实作者或贡献关系。

| 使用节点 | SVG / PNG | 依据与简化边界 |
|---|---|---|
| `dl_resnet_2015` | [residual.svg](../../assets/history/principles/residual.svg) / [PNG](../../assets/history/principles/residual.png) | [ResNet 原论文 §3.1–3.2 / Fig. 2](https://arxiv.org/html/1512.03385)：输入 x 分成残差支路 F(x) 和恒等捷径，在加法处合成 F(x)＋x。只表示输入、输出维度相同的残差单元；省略卷积、归一化及激活细节，维度变化时还需匹配，不是完整 ResNet。 |
| `dl_transformer_2017` | [self-attention.svg](../../assets/history/principles/self-attention.svg) / [PNG](../../assets/history/principles/self-attention.png) | [Transformer 原论文 §3.2](https://arxiv.org/html/1706.03762v7)：同一输入投影出 Q、K、V，经缩放点积、softmax，再加权汇合 V。仅为单头自注意力，省略多头、位置编码、残差、前馈及完整编码器／解码器。 |
| `dl_gpt3_2020` | [in-context.svg](../../assets/history/principles/in-context.svg) / [PNG](../../assets/history/principles/in-context.png) | [GPT-3 原论文 §2 / Fig. 2.1](https://arxiv.org/html/2005.14165v4)：任务说明和少量示例与待补全输入一起传给模型，推理时参数不更新。图中示例数量仅为示意，不表示进行微调。 |

## 真实肖像与许可

照片仅用于研究史说明，不表示所摄人物、摄影者或机构为 Paperstream 背书。照片拍摄时间不等于论文发表时间，现代照片没有被描述成历史现场。沿用 Commons 原作与现成裁剪版本，不作本地裁剪、修饰或 AI 改脸。当前版本沿用 2026-11-14 版统一 108×144 3:4 展示框与整卡居中姓名，取景参数保存在 figure 的 `frame`。

Abbeel 使用同一 CovariantHQ 照片的 960×709 Wikimedia 缩略图，Christiano 使用同一讲座截图的 893×890 原档，作者和许可均不变。Ilya Sutskever 仍使用 192×287 的已有裁剪版本。两份历史图共用 [取景与布局脚本](../../scripts/history_portraits.py)，不通过拉伸或生成式重绘补造人脸细节。

照片文件在 [`assets/history/deep-learning/`](../../assets/history/deep-learning/)，详细原图链接、下载链接、逐文件哈希、尺寸与修改说明亦记录于 [`portraits.json`](../../assets/history/deep-learning/portraits.json)。各照片 figure 同时保留 `sourceUrl`、`author`、`license`、`licenseUrl` 与 `changes`。照片的许可独立于项目代码许可证；分发 Canvas、SVG 或 PNG 时应随附本归属文件，并保留图内归属提示。

| 文件 / 人物 | 摄影或原作者 | 来源 | 许可 |
|---|---|---|---|
| `hinton.jpg` / Geoffrey Hinton | Cmichel67 | [Geoffrey Hinton in 2026](https://commons.wikimedia.org/wiki/File:Geoffrey_Hinton_in_2026.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `lecun.jpg` / Yann LeCun | Jérémy Barande / École polytechnique Université Paris-Saclay | [Yann LeCun - 2018 (cropped)](https://commons.wikimedia.org/wiki/File:Yann_LeCun_-_2018_(cropped).jpg) | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `schmidhuber.jpg` / Jürgen Schmidhuber | ITU/R.Farrell | [Jürgen Schmidhuber, 2017 (cropped)](https://commons.wikimedia.org/wiki/File:J%C3%BCrgen_Schmidhuber,_2017_(cropped).jpg) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `goodfellow.jpg` / Ian Goodfellow（旧版档案，当前不使用） | Ian Goodfellow | [Ian Goodfellow (cropped)](https://commons.wikimedia.org/wiki/File:Ian_Goodfellow_(cropped).jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `sutskever.jpg` / Ilya Sutskever | Eladkarmel | [Ilya Sutskever and Sam Altman in TAU (cropped)](https://commons.wikimedia.org/wiki/File:Ilya_Sutskever_and_Sam_Altman_in_TAU_(cropped).jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `hassabis.jpg` / Demis Hassabis（旧版档案，当前不使用） | John Sears | [Demis Hassabis, 2024 Nobel Prize Laureate in Chemistry 7 (cropped)](https://commons.wikimedia.org/wiki/File:Demis_Hassabis,_2024_Nobel_Prize_Laureate_in_Chemistry_7_(cropped).jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `gomez.jpg` / Aidan N. Gomez（旧版档案，当前不使用） | Gabriel Hutchinson | [Aidan Gomez at ALL IN 2025 06](https://commons.wikimedia.org/wiki/File:Aidan_Gomez_at_%22ALL_IN%22_2025_06.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `amodei.jpg` / Dario Amodei（旧版档案，当前不使用） | TechCrunch | [Dario Amodei at TechCrunch Disrupt 2023 02 (close up cropped)](https://commons.wikimedia.org/wiki/File:Dario_Amodei_at_TechCrunch_Disrupt_2023_02_(close_up_cropped).jpg) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `abbeel.jpg` / Pieter Abbeel | Pieterabbeel | [Pieter Abbeel pictured at CovariantHQ in November 2017](https://commons.wikimedia.org/wiki/File:Pieter_Abbeel_pictured_at_CovariantHQ_in_November_2017.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `jumper.jpg` / John Jumper（旧版档案，当前不使用） | Jennifer 8. Lee | [John Jumper at 2024 Nobel Prize Conference 3 (cropped)](https://commons.wikimedia.org/wiki/File:John_Jumper_at_2024_Nobel_Prize_Conference_3_(cropped).jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `christiano.jpg` / Paul Christiano | Institute for Pure & Applied Mathematics (IPAM) | [Paul Christiano at UCLA, 2026 (cropped)](https://commons.wikimedia.org/wiki/File:Paul_Christiano_-_Mechanistic_Estimation_-_IPAM_at_UCLA_-_0-34-09_(cropped).jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

### ResNet 的展示选择

ResNet 当前用残差单元示意图说明机制，不再显示“肖像待授权”占位。作者仍为何恺明、张祥雨、任少卿与孙剑，2015 年预印本与 CVPR 2016 的区分保持不变。此前尚未核实这些作者可自由再分发的肖像；个人主页照片没有被当作默认开放，同名篮球运动员 Jian Sun 也已排除。旧档案照片与归属继续保留在素材档案中，供旧版画布核对，当前主画布不再引用。
