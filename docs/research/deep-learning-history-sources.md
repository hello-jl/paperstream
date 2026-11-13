# 深度学习发展史：来源与肖像归属

核对日期：2026-11-13。配套可编辑图为 [`examples/deep-learning-history.canvas`](../../examples/deep-learning-history.canvas)，由 [`scripts/create-deep-learning-history.py`](../../scripts/create-deep-learning-history.py) 调用 `CanvasGraph.create`、`add_node`、`add_edge`、`set_document`、`validate`、`save` 生成，并通过 API 回读核验。

这是从 Hinton 参与的 1986 年工作出发的 **14 项精选**，截至核对日整理，所选论文发表于 1986–2022 年；不是 2026 年最新模型清单，也不是深度学习完整起源史。反向传播、自动微分、神经网络、卷积和扩散模型各有更早工作。排列相邻不意味着直接继承，图中只画了明确说明的几条技术联系。后续模型另见计算机与 AI 总史。不能把有限篇幅或代表肖像理解成对作者贡献排名。

## 论文与年份

| 稳定 ID | 卡片 | 引用版本与原始来源 | 肖像中的代表共作者 |
|---|---|---|---|
| `dl_backprop_1986` | 反向传播 | Rumelhart, Hinton, Williams. *Learning representations by back-propagating errors*. Nature 323, 533–536 (1986). [原文 DOI](https://doi.org/10.1038/323533a0)，[作者收藏](https://www.cs.toronto.edu/~hinton/absps/naturebp.pdf) | Geoffrey Hinton |
| `dl_lenet_1989` | 早期 LeNet | LeCun 等. *Handwritten Digit Recognition with a Back-Propagation Network*. NIPS 1989. [会议原文](https://papers.nips.cc/paper_files/paper/1989/hash/53c3bce66e43be4f209556518c2fcb54-Abstract.html) | Yann LeCun |
| `dl_lstm_1997` | LSTM | Hochreiter, Schmidhuber. *Long Short-Term Memory*. Neural Computation 9(8), 1735–1780 (1997). [DOI](https://doi.org/10.1162/neco.1997.9.8.1735)，[作者收藏](https://people.idsia.ch/~juergen/lstm1997-2024head.pdf) | Jürgen Schmidhuber |
| `dl_dbn_2006` | 深度信念网络 | Hinton, Osindero, Teh. *A fast learning algorithm for deep belief nets*. Neural Computation 18(7), 1527–1554 (2006). [作者原文](https://www.cs.toronto.edu/~hinton/absps/fastnc.pdf) | Geoffrey Hinton |
| `dl_alexnet_2012` | AlexNet | Krizhevsky, Sutskever, Hinton. *ImageNet Classification with Deep Convolutional Neural Networks*. NIPS 2012. [会议原文](https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html) | Geoffrey Hinton |
| `dl_gan_2014` | GAN | Goodfellow 等. *Generative Adversarial Networks*. [2014-06-10 预印本](https://arxiv.org/abs/1406.2661)。会议版题目为 *Generative Adversarial Nets*；图使用所链接预印本的完整题目。 | Ian Goodfellow |
| `dl_seq2seq_2014` | Seq2Seq | Sutskever, Vinyals, Le. *Sequence to Sequence Learning with Neural Networks*. [2014-09-10 预印本](https://arxiv.org/abs/1409.3215)，同年 NIPS。 | Ilya Sutskever |
| `dl_resnet_2015` | ResNet | He, Zhang, Ren, Sun. *Deep Residual Learning for Image Recognition*. [2015-12-10 预印本](https://arxiv.org/abs/1512.03385)；正式发表于 CVPR 2016，**未将预印本年份写成发表年份**。 | 待授权，未冒用他人或同名人物照片 |
| `dl_alphago_2016` | AlphaGo | Silver, Huang 等. *Mastering the game of Go with deep neural networks and tree search*. Nature 529, 484–489 (2016). [DOI](https://doi.org/10.1038/nature16961)，[DeepMind 原文](https://storage.googleapis.com/deepmind-media/alphago/AlphaGoNaturePaper.pdf) | Demis Hassabis，为论文共作者 |
| `dl_transformer_2017` | Transformer | Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin. *Attention Is All You Need*. [2017-06-12 首版](https://arxiv.org/abs/1706.03762v1)，NIPS 2017；当前 arXiv 页修订于 2023 年，不改变首版日期。 | Aidan N. Gomez，为八位共作者之一 |
| `dl_gpt3_2020` | GPT-3 | Brown 等. *Language Models are Few-Shot Learners*. [2020-05-28 预印本](https://arxiv.org/abs/2005.14165)，NeurIPS 2020。 | Dario Amodei，为论文共作者；不以其后来的机构角色作为贡献依据 |
| `dl_ddpm_2020` | DDPM | Ho, Jain, Abbeel. *Denoising Diffusion Probabilistic Models*. [2020-06-19 预印本](https://arxiv.org/abs/2006.11239)，NeurIPS 2020。不是扩散模型的最早起点。 | Pieter Abbeel |
| `dl_alphafold_2021` | AlphaFold 2 | Jumper, Evans 等. *Highly accurate protein structure prediction with AlphaFold*. [Nature，2021-07-15](https://www.nature.com/articles/s41586-021-03819-2)；不是 2020 年 CASP14 评测事件的年份。 | John Jumper |
| `dl_instructgpt_2022` | InstructGPT | Ouyang 等. *Training language models to follow instructions with human feedback*. [2022-03-04 预印本](https://arxiv.org/abs/2203.02155)，NeurIPS 2022。 | Paul Christiano，为论文共作者；并非第一作者 |

1989 卡片展示早期 LeNet 路线，不把该网络称为 1998 年的 LeNet-5。1986 卡片也不宣称 Hinton 独自发明反向传播。DBN 并不被绘制为 AlexNet 的直接架构父节点。AlphaGo 与 AlphaFold 仅作为不同应用节点，不以同属机构推断直接技术继承。

关系 `dl_bp_to_lenet` 的短标签“反传训练”表示反向传播训练方法进入视觉识别实践；`dl_transformer_to_gpt3` 的“自回归”表示以 Transformer 架构进行自回归语言建模。短标签用于适配卡片间的 90 px 空隙，详细含义保留于此；不把有限显示宽度当作删减技术含义的理由。

## 真实肖像与许可

照片仅用于研究史说明，不表示所摄人物、摄影者或机构为 Paperstream 背书。照片拍摄时间不等于论文发表时间，现代照片没有被描述成历史现场。已沿用 Commons 上现成裁剪版本，下载 Wikimedia 提供的约 250 px 缩略图，不作本地裁剪、修饰或 AI 改脸。Ilya Sutskever 与 Pieter Abbeel 当前是包含人物的真实照片，未伪称为新拍摄的大头照；可在获得更合适的开放肖像后替换。

所有文件在 [`assets/history/deep-learning/`](../../assets/history/deep-learning/)，详细原图链接、下载链接、逐文件哈希、尺寸与修改说明亦记录于 [`portraits.json`](../../assets/history/deep-learning/portraits.json)。各 figure 同时保留 `sourceUrl`、`author`、`license`、`licenseUrl` 与 `changes`。这些图片的许可独立于项目代码许可证；分发 Canvas、SVG 或 PNG 时应随附本归属文件，并保留图内归属提示。

| 文件 / 人物 | 摄影或原作者 | 来源 | 许可 |
|---|---|---|---|
| `hinton.jpg` / Geoffrey Hinton | Cmichel67 | [Geoffrey Hinton in 2026](https://commons.wikimedia.org/wiki/File:Geoffrey_Hinton_in_2026.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `lecun.jpg` / Yann LeCun | Jérémy Barande / École polytechnique Université Paris-Saclay | [Yann LeCun - 2018 (cropped)](https://commons.wikimedia.org/wiki/File:Yann_LeCun_-_2018_(cropped).jpg) | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `schmidhuber.jpg` / Jürgen Schmidhuber | ITU/R.Farrell | [Jürgen Schmidhuber, 2017 (cropped)](https://commons.wikimedia.org/wiki/File:J%C3%BCrgen_Schmidhuber,_2017_(cropped).jpg) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `goodfellow.jpg` / Ian Goodfellow | Ian Goodfellow | [Ian Goodfellow (cropped)](https://commons.wikimedia.org/wiki/File:Ian_Goodfellow_(cropped).jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `sutskever.jpg` / Ilya Sutskever | Eladkarmel | [Ilya Sutskever and Sam Altman in TAU (cropped)](https://commons.wikimedia.org/wiki/File:Ilya_Sutskever_and_Sam_Altman_in_TAU_(cropped).jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `hassabis.jpg` / Demis Hassabis | John Sears | [Demis Hassabis, 2024 Nobel Prize Laureate in Chemistry 7 (cropped)](https://commons.wikimedia.org/wiki/File:Demis_Hassabis,_2024_Nobel_Prize_Laureate_in_Chemistry_7_(cropped).jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `gomez.jpg` / Aidan N. Gomez | Gabriel Hutchinson | [Aidan Gomez at ALL IN 2025 06](https://commons.wikimedia.org/wiki/File:Aidan_Gomez_at_%22ALL_IN%22_2025_06.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `amodei.jpg` / Dario Amodei | TechCrunch | [Dario Amodei at TechCrunch Disrupt 2023 02 (close up cropped)](https://commons.wikimedia.org/wiki/File:Dario_Amodei_at_TechCrunch_Disrupt_2023_02_(close_up_cropped).jpg) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `abbeel.jpg` / Pieter Abbeel | Pieterabbeel | [Pieter Abbeel pictured at CovariantHQ in November 2017](https://commons.wikimedia.org/wiki/File:Pieter_Abbeel_pictured_at_CovariantHQ_in_November_2017.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `jumper.jpg` / John Jumper | Jennifer 8. Lee | [John Jumper at 2024 Nobel Prize Conference 3 (cropped)](https://commons.wikimedia.org/wiki/File:John_Jumper_at_2024_Nobel_Prize_Conference_3_(cropped).jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `christiano.jpg` / Paul Christiano | Institute for Pure & Applied Mathematics (IPAM) | [Paul Christiano at UCLA, 2026 (cropped)](https://commons.wikimedia.org/wiki/File:Paul_Christiano_-_Mechanistic_Estimation_-_IPAM_at_UCLA_-_0-34-09_(cropped).jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

### 尚缺的肖像

ResNet 作者何恺明、张祥雨、任少卿与孙剑的可明确自由再分发肖像仍未核实。MIT/个人主页照片未被当作默认开放；搜索中的同名篮球运动员 Jian Sun 也已排除。保留 ResNet 的真实论文信息和“肖像待授权”文字，没有拿不相关人物充数。补图应取得授权或可核实开放许可，并同步更新 figure 归属、资产 manifest 与本文件。
