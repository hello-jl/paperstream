# 从电子计算到 AI：精选历史画布的来源与图像许可

核对日期：2026-11-13。配套文件：[computing-ai-history.canvas](../../examples/computing-ai-history.canvas)。这是 16 个里程碑的入门导览，按行从左到右阅读，再进入下一行。箭头只表示同一行的时间顺序，不代表相邻项目之间存在直接继承或因果关系。

起点选为 1946 年 ENIAC 公开亮相的电子通用计算机时代，并不声称它是所有定义下唯一的“第一台计算机”。机械计算、计算理论、早期专用机，以及许多重要的专家系统、统计学习、机器人、模型和硬件工作未纳入这一张简图。人物是有限的相关人物精选，不是完整贡献名单。

## 连续时间线 Canvas（2026-11-14）

[打开可编辑的连续时间线](../../examples/computing-ai-history-connected.canvas)。这份独立 `.canvas` 沿用原图的 18 张卡片与完整来源，当前 16 个里程碑使用 12 张照片及 4 张原理图。保留行内 12 条边，并补入三条行间回折线，把 16 个里程碑连续串起。每行仍从左到右阅读，再沿箭头进入下一行；连线表示时间顺序。

图像随卡片移动，可调大小、对齐、取景和缩放；当前卡片模板将图片放在正文下方，尚不支持卡内任意拖放或海报版的左右并排。海报是另外的静态排版，可编辑画布使用编辑器实际支持的结构。连续版通过 API 另存创建；本次机制图替换同步到原图和连续版。复现到一个尚不存在的目标路径：

```sh
python3 scripts/create-connected-ai-history.py examples/computing-ai-history.canvas NEW.canvas
```

## 紧凑海报版（2026-11-14）

另提供一份便于分享的横向卡片排版：[PNG](../assets/computing-ai-history-poster-v2.png) · [自含 SVG](../assets/computing-ai-history-poster-v2.svg)。16 个里程碑排列为四行，图像在左、正文在右，年份固定于卡片右下角。导出沿用已保存画布的事实文字、照片或原理图、逐图取景和可见署名；图像许可及完整来源仍见本页。

这是静态海报的另一种排版，不改变编辑器布局；可编辑源仍是上面的 `.canvas`。脚本经 CLI 读取完整文档，不写回源文件，复现命令为：

```sh
node --experimental-strip-types scripts/export-history-poster.mjs examples/computing-ai-history.canvas docs/assets/computing-ai-history-poster-v2 .local/history-renderer/package.json
```

第三个参数指向已安装 `@resvg/resvg-js` 的本地工具包，省略时仅导出 SVG；PNG 字体默认使用系统字体，也可通过 `PAPERSTREAM_EXPORT_FONT` 指定中文字体文件。

## 里程碑与事实依据

| 稳定 ID | 年份及版本 | 简图节点 | 展示图／相关人物与角色 | 原论文／机构史料 |
|---|---|---|---|---|
| `eniac_1946` | 1946 | ENIAC · 电子计算 | John Mauchly · 设计团队 | [ENIAC · 电子计算](https://www.computerhistory.org/tdih/February/14/) |
| `turing_1950` | 1950 | 图灵 · 机器能思考吗 | Alan Turing | [Computing Machinery and Intelligence](https://turingarchive.kings.cam.ac.uk/computing-machinery-and-intelligence) |
| `dartmouth_1956` | 1956 | Dartmouth · AI 命名 | John McCarthy · 组织者之一 | [Dartmouth · AI 命名](https://www.dartmouth.edu/its-tools/archive/history/timeline/early.html) |
| `perceptron_1958` | 1958 | Perceptron · 从样例学 | Frank Rosenblatt | [The Perceptron: A Probabilistic Model for Information Storage and Organization in the Brain](https://www.cs.cmu.edu/~epxing/Class/10715/reading/Rosenblatt.perceptron.pdf) |
| `eliza_1966` | 1966 | ELIZA · 规则式对话 | Joseph Weizenbaum | [ELIZA—A Computer Program For the Study of Natural Language Communication Between Man and Machine](https://www.computerhistory.org/timeline/1966/) |
| `backprop_1986` | 1986 | 反向传播 · 学习表征 | Geoffrey Hinton · 共同作者 | [Learning representations by back-propagating errors](https://www.cs.toronto.edu/~hinton/backprop.html) |
| `deepblue_1997` | 1997 | Deep Blue · 搜索与算力 | Garry Kasparov · 对弈者 | [Deep Blue · 搜索与算力](https://www.ibm.com/history/deep-blue) |
| `lenet_1998` | 1998 | LeNet-5 · 卷积识别 | Yann LeCun · 共同作者 | [Gradient-Based Learning Applied to Document Recognition](https://bottou.org/papers/lecun-98h) |
| `alexnet_2012` | 2012 | AlexNet · 视觉突破 | Geoffrey Hinton · 共同作者 | [ImageNet Classification with Deep Convolutional Neural Networks](https://proceedings.neurips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html) |
| `gan_2014` | 2014 | GAN · 对抗式生成 | Ian Goodfellow · 共同作者 | [Generative Adversarial Nets](https://proceedings.neurips.cc/paper/2014/hash/f033ed80deb0234979a61f95710dbe25-Abstract.html) |
| `alphago_2016` | 2016 | AlphaGo · 学习＋搜索 | Demis Hassabis · 共同作者 | [Mastering the game of Go with deep neural networks and tree search](https://www.nature.com/articles/nature16961) |
| `transformer_2017` | 2017 | Transformer · 注意力 | 自注意力原理图；完整作者名单见论文 | [Attention Is All You Need](https://arxiv.org/abs/1706.03762v1) |
| `gpt3_2020` | 2020 | GPT-3 · 上下文学习 | 上下文学习原理图；完整作者名单见论文 | [Language Models are Few-Shot Learners](https://arxiv.org/abs/2005.14165v1) |
| `instructgpt_2022` | 2022 | InstructGPT · 人类反馈 | Paul Christiano · 共同作者 | [Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155v1) |
| `alphafold3_2024` | 2024 | AlphaFold 3 · 科学模型 | 条件扩散结构预测原理图；完整作者名单见论文 | [Accurate structure prediction of biomolecular interactions with AlphaFold 3](https://www.nature.com/articles/s41586-024-07487-w) |
| `claude_2026` | 2026 | Claude Opus 5.5 · Agent | 通用 Agent 工作循环示意；不代表模型内部架构 | [Claude Opus 5.5 · Agent](https://www.anthropic.com/claude-opus-5-5) |

年代按该节点引用版本记录：Perceptron 为 1958 论文；LeNet 为 1998 系统论文；Transformer/GPT-3/InstructGPT 为最初公开的预印本年份。Dartmouth 提案写于 1955 年，本图标的是 1956 年研究项目；ENIAC 标的是 1946 年公开亮相。1986 反向传播论文在多层表征学习的推广中很重要，本图没有声称它首次发明了所有反向求导方法。AlphaGo 的 2016 论文包含 Fan Hui 比赛；本图不把该论文说成李世石比赛报告。

Claude 节点采用 2026-09-22 发布的 Opus 5.5 作为当年长任务／Agent 方向的一个例子，并不声称它是截至核对日最后发布或最强的模型。GPT-3、Transformer、AlphaFold 3 与 Claude 当前用机制图说明团队成果；更换展示图不改变原论文作者、事件年代或技术关系。Kasparov 是 Deep Blue 的对弈者；Deep Blue 的研发属于 IBM 团队。

图尾现状说明另据以下实际打开的官方发布页：

- [DeepSeek-R1（2025-01-20）](https://api-docs.deepseek.com/news/news250120/)。
- [DeepSeek-V4.1-Flash-1017（2026-10-17）](https://api-docs.deepseek.com/news/news261017/)。
- [Claude Opus 5.5（2026-09-22）](https://www.anthropic.com/claude-opus-5-5)。

## 原理图与简化边界（2026-11-14）

主图和连续时间线共用下列四张自绘图，作者均为 **Paperstream contributors**，按仓库 [MIT 许可证](../../LICENSE) 分发。SVG 为可缩放原图，PNG 为 Canvas 内嵌图；文件与校验值见 [原理图 manifest](../../assets/history/principles/manifest.json)。图根据论文机制重新绘制，不复制论文插图，也不把团队成果归于一张代表肖像。

| 使用节点 | SVG / PNG | 依据与简化边界 |
|---|---|---|
| `transformer_2017` | [self-attention.svg](../../assets/history/principles/self-attention.svg) / [PNG](../../assets/history/principles/self-attention.png) | [原论文 §3.2](https://arxiv.org/html/1706.03762v7)：同一输入投影为 Q、K、V，缩放点积经 softmax 得到权重，再汇合 V。仅画单头自注意力；省略多头、位置编码、残差、前馈及完整编码器／解码器。 |
| `gpt3_2020` | [in-context.svg](../../assets/history/principles/in-context.svg) / [PNG](../../assets/history/principles/in-context.png) | [原论文 §2 / Fig. 2.1](https://arxiv.org/html/2005.14165v4)：任务说明、少量示例与待补全输入组成上下文，由模型生成答案；推理时不更新参数。示例数量仅为示意，不是微调或预训练过程。 |
| `alphafold3_2024` | [diffusion-structure.svg](../../assets/history/principles/diffusion-structure.svg) / [PNG](../../assets/history/principles/diffusion-structure.png) | [原论文扩散模块](https://www.nature.com/articles/s41586-024-07487-w)：以序列及分子信息为条件，逐步去噪原子坐标以预测复合物结构。不是实际分子的折叠动力学，也不表示每次都得到唯一、准确的真实结构。 |
| `claude_2026` | [agent-loop.svg](../../assets/history/principles/agent-loop.svg) / [PNG](../../assets/history/principles/agent-loop.png) | [Anthropic 官方 Agent 说明](https://www.anthropic.com/research/building-effective-agents)：任务、模型决策、工具执行、环境结果构成可停止的循环。表示通用 Agent 工作方式，不宣称是 Opus 5.5 的内部网络结构或 2026 年才出现的机制。 |

## 肖像素材与署名

当前两份计算机与 AI 画布各有 **12 张照片，使用 11 个独立照片文件，另有 4 张原理图**；同一人物可出现在多项共同参与的工作中。照片均为真实照片，沿用 Commons 原作与缩略图，无生成脸、换脸、重绘或美化。2026-11-14 版照片采用 3:4 展示框，逐图调整可逆取景、位置与缩放；McCarthy 和 Goodfellow 用完整显示保留头部边界。源照片文件不作本地裁剪，Commons 原文件已经裁剪的情形由文件名和来源页说明；画布与导出图呈现的是取景后的版本。历史卡的年份表示事件／论文年份，照片可以拍摄于其他年份。

Christiano 已换成同一 Commons 讲座截图的 893×890 原档，署名与许可不变；其余照片沿用现有文件。取景参数保存在各 figure 的 `frame`，布局脚本为 [history_portraits.py](../../scripts/history_portraits.py)。姓名用整卡宽度居中，年份固定在卡片内右下角；保留用户对图片大小的调整，原图纵横比不会拉伸。

各原照片分别保留其许可。画布内 `paperstreamCard.figures` 保存 `sourceUrl`、`author`、`license`、`licenseUrl`、`changes`；机器可读明细和 SHA-256 在 [素材 manifest](../../assets/history/computing/manifest.json)。图尾保留了简短可见署名。分享 PNG/SVG 时，请一并附上本来源表或保留等价的完整署名与许可链接；不要把仓库代码许可证当成第三方照片的许可证。

| 本地文件／人物 | 摄影者或来源署名 | Commons 原图与许可 | 本项目修改 |
|---|---|---|---|
| [mauchly.jpg](../../assets/history/computing/mauchly.jpg) | Unknown photographer | [Commons 文件页](https://commons.wikimedia.org/wiki/File:John_Mauchly.jpg) · [Public domain in the United States (published without notice)](https://commons.wikimedia.org/wiki/Commons:Public_domain) | 下载已有缩略图；无额外修改 |
| [turing.jpg](../../assets/history/computing/turing.jpg) | Elliott & Fry | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Alan_Turing_(1951).jpg) · [Public domain](https://commons.wikimedia.org/wiki/Commons:Public_domain) | 下载已有缩略图；无额外修改 |
| [mccarthy.jpg](../../assets/history/computing/mccarthy.jpg) | "null0" | [Commons 文件页](https://commons.wikimedia.org/wiki/File:John_McCarthy_Stanford.jpg) · [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | 下载已有缩略图；无额外修改 |
| [rosenblatt.jpg](../../assets/history/computing/rosenblatt.jpg) | Unknown photographer (source: Heinz Nixdorf MuseumsForum) | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Frank_Rosenblatt.jpg) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 下载已有缩略图；无额外修改 |
| [weizenbaum.jpg](../../assets/history/computing/weizenbaum.jpg) | Rochester Institute of Technology | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Weizenbaum_1982.jpg) · [Public domain](https://commons.wikimedia.org/wiki/Commons:Public_domain) | 下载已有缩略图；无额外修改 |
| [hinton.jpg](../../assets/history/computing/hinton.jpg) | Cmichel67 | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Geoffrey_Hinton_in_2026.jpg) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 下载已有缩略图；无额外修改 |
| [kasparov.jpg](../../assets/history/computing/kasparov.jpg) | Unknown photographer; uploaded by Sergei | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Garry_Kasparov.jpg) · [Public domain](https://commons.wikimedia.org/wiki/Commons:Public_domain) | 下载已有缩略图；无额外修改 |
| [lecun.jpg](../../assets/history/computing/lecun.jpg) | Jérémy Barande | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Yann_LeCun_-_2018_(cropped).jpg) · [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | 下载已有缩略图；无额外修改 |
| [goodfellow.jpg](../../assets/history/computing/goodfellow.jpg) | Ian Goodfellow | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Ian_Goodfellow_(cropped).jpg) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 下载已有缩略图；无额外修改 |
| [hassabis.jpg](../../assets/history/computing/hassabis.jpg) | Cmichel67 | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Demis_Hassabis_in_2025_by_Christopher_Michel_A.jpg) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 下载已有缩略图；无额外修改 |
| [gomez.jpg](../../assets/history/computing/gomez.jpg)（旧版档案，当前不使用） | Gabriel Hutchinson | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Aidan_Gomez_at_%22ALL_IN%22_2025_06.jpg) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 下载已有缩略图；无额外修改；保留归属供旧版使用 |
| [christiano.jpg](../../assets/history/computing/christiano.jpg) | Institute for Pure & Applied Mathematics (IPAM) | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Paul_Christiano_-_Mechanistic_Estimation_-_IPAM_at_UCLA_-_0-34-09_(cropped).jpg) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | 下载同一截图的 893×890 原档；源文件不裁剪，展示取景 |
| [amodei.jpg](../../assets/history/computing/amodei.jpg)（旧版档案，当前不使用） | TechCrunch | [Commons 文件页](https://commons.wikimedia.org/wiki/File:Dario_Amodei_at_TechCrunch_Disrupt_2023_02_(close_up_cropped).jpg) · [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | 下载已有缩略图；无额外修改；保留归属供旧版使用 |

Mauchly 照片的 Commons 声明是 **美国境内因当年未附版权声明而进入公共领域**；这里不把它扩大为全球公有领域结论。Rosenblatt 照片的原摄影者未知，Commons 文件页列 Heinz Nixdorf MuseumsForum 为来源并标注 CC BY-SA 4.0；本记录如实保留该来源与许可声明。Kasparov 图的作者栏缺姓名，页面声明为上传者的 own work、PD-self，历史记录显示上传者 Sergei。其他明确署名见上表。公开宣传如要求全部素材都有已知摄影者及直接授权链，需再替换这类历史照片，而不是凭空补造摄影者或许可。

## API 生成与核验

复现命令（新路径，不覆盖已有文档）：

```sh
python3 scripts/create-computing-ai-history.py '/new/path/computing-ai-history.canvas'
python3 -m paperstream validate '/new/path/computing-ai-history.canvas'
python3 -m paperstream show '/new/path/computing-ai-history.canvas' --raw
```

脚本只通过 `CanvasGraph.create`、`add_node`、`add_edge`、`set_document`、`validate` 和 `save` 保存图。生成后再次加载，核验完整文档、稳定 ID、16 个数据卡／2 个说明卡、12 条行内时间边和内嵌图像校验值。后续机制图更新也通过 API 加载、定点修改、验证与保存，保留已有节点和边的 ID、年代、关系及用户对无关图像的调整。

该图已用项目自身 `exportGraphSvg` 和本地 resvg 导出 SVG／PNG 并目检：标题、来源说明、照片、年份与行间连线均可读；尚不能把离线导出证明当作每个宿主交互均已重新验收。
