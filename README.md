# Paperstream

**把读过的论文，连成自己的研究脉络。**

读完一篇论文，你可能记住了一个方法、一个结果，或一个值得继续追问的问题。读到十篇、几十篇时，这些认识散落在笔记和记忆里：新工作解决了前人的什么困难？两篇看起来相近的文章，究竟差在哪里？下次回到这个方向，又该从哪一篇接着读？

Paperstream 为这些认识留出一张画布。用卡片记下论文最值得留下的内容，用带文字的连线写清它们之间的联系，把要点、插图和原文入口放在一起。随着阅读推进，这张图也逐步长成你对一个领域的理解。

你可以亲手排布、编辑和判断，也可以请 AI 带着明确的任务和资料，帮助整理同一张图。**人用画布，AI 用 API；成果保存在独立的 JSON 文件里。**

![Paperstream 课堂：DeepSeek 讲解，GPT 与 Claude 专注听课](docs/assets/paperstream-classroom-promo-v4.png)

宣传插画由 AI 生成，角色参考 ZipZipPipe 的社区拟人设定。[角色来源与生成记录](docs/assets/paperstream-classroom-promo-v4-prompt.md)

## 把论文之间的联系也读出来

论文列表告诉你读过什么，研究脉络还需要留下你怎样理解它们。Paperstream 的卡片突出你写下的核心认识，完整标题、年份和原文入口随时可查；旁边可以放一张关键图，也可以留一张 Note，记下暂时没有答案的问题。

连线值得写得具体一点。“相关”可以继续追问：沿用了哪种结构，缓解了什么困难，还是提供了另一种解法？这些说明让你再次打开画布时，能够找回当时的判断。

例如，在[深度学习发展史](examples/deep-learning-history.canvas)里，可以沿着两条不同的线理解 Transformer：

| 连接 | 留在图上的认识 |
| --- | --- |
| AlexNet → ResNet | 从大规模卷积网络，走向用残差学习缓解加深后的训练退化 |
| ResNet → Transformer | 残差连接被沿用到注意力与前馈子层中 |
| Seq2Seq → Transformer | 序列建模从循环计算转向以注意力为核心的架构 |

一条线可以表示方法复用、问题回应、比较，也可以只是你想进一步核实的联系。图上的解释来自你的阅读与来源依据，可以随认识加深继续修改。上面例子的[原论文与关系说明](docs/research/deep-learning-history-sources.md)随样例保留，也可以直接[查看完整图片](docs/assets/deep-learning-history.png)。

![Paperstream 实际编辑界面：论文要点、图片与关系放在同一张画布中](docs/assets/paperstream.jpg)

## 让人和 AI 各自做擅长的事

阅读中有些工作适合亲手完成：把关键论文挪到中心，在两篇文章之间添一句比较，圈定下一轮要读的方向。拖动、连线、双击编辑，都直接发生在画布上，细节在卡片附近展开。

也有一些整理工作可以交给 AI：根据你提供的论文资料补齐卡片，把零散笔记整理成要点，或者为指定的两项工作补上关系说明。例如，你可以给自己的 agent 这样的任务：

> 读取我的画布和这几篇论文资料，为新论文补一张卡片，写三条核心认识；把它与已有的两项工作连接起来，并说明关系依据。保留现在的布局和其他笔记。

AI 通过 Paperstream 的 API 或命令行修改文件；你回到画布上检查、修正，再继续阅读。这样，批量整理和手工思考可以接续进行，你积累的布局与笔记也能继续保留。

Paperstream 本身不调用模型。你可以使用具有本地执行能力的 agent，搭配仓库提供的操作指南；论文解释和关系判断仍需要回到来源核对。交接给 AI 前，先保存当前画布。

## 从第一篇论文，慢慢长成一张研究地图

你可以只放三四篇文章开始，不必一次整理完整个领域。

1. **刚进入一个方向时，先搭起轮廓。** 放入几篇代表工作，用自己的话各写一两句，留下你已经看清的联系。
2. **精读时，把理解补进去。** 添几条要点，粘贴一张关键图，记下方法的适用条件，或用 Note 留住一个疑问。
3. **读到新工作时，放到已有脉络里比较。** 它接着解决了什么？哪些结构被沿用？用一条有说明的线把判断留下来，也可以调整卡片与连线的粗细，突出你当前关注的部分。
4. **回顾或交流时，把整张图拿出来。** 搜索定位、只看附近的关系，或导出 PNG／SVG，向别人讲清你看到的研究路线。

画布会跟着你的认识变化。先记下一个粗略联系，后来再改得准确一些，也是整理的一部分。

## 文件就是你能带走的成果

每张画布都是一份独立的 **`.canvas` JSON 文件**，论文、笔记、关系和布局一起保存。你可以放进自己的研究文件夹，复制给同事，做好备份，或用 Git 记录变化；换一台电脑、换一个支持的 Paperstream 宿主，仍可以继续编辑这份文件。

![Paperstream 架构：人通过可视画布，AI 通过 API，共同维护独立的 JSON Canvas 文件](docs/assets/paperstream-architecture.svg)

存档不依赖 Paperstream 的云端账号或数据库。插入、粘贴到卡片里的图片也内嵌在 JSON 中，随文件一起迁移；普通文件卡片引用的本地附件需要一并带走。JSON Canvas 的标准结构方便其他支持该格式的工具读取，Paperstream 的论文卡片与图片样式则需要相应支持。[文件迁移与兼容说明](docs/guide.md#文件格式与迁移)

## 打开一张图试试

当前可以从源码启动独立浏览器版。准备 Node.js **22.18+**，在仓库根目录运行：

```sh
npm ci --prefix web
npm --prefix web run dev
```

打开终端显示的本机地址，从文件菜单打开一个示例，再另存为自己的文件：

- **先从三篇论文开始：** [ResNet、DenseNet 与 ResNeXt](examples/resnet.canvas)，适合尝试编辑卡片、修改关系和手工排布。
- **沿着一条技术线阅读：** [CNN 演进](examples/cnn-evolution.canvas)、[深度学习的几条发展线](examples/deep-learning-history.canvas)。
- **把研究史展开来看：** [从电子计算到 AI](examples/computing-ai-history.canvas)，含精选里程碑和人物肖像；[查看整图](docs/assets/computing-ai-history.png)。
- **换一个领域：** [量子力学经典论文](examples/quantum-foundations.canvas)、[DeepH 阅读路线](examples/deeph-reading.canvas)。

历史样例中的论文事实与肖像来源分别记录在[计算机与 AI 来源表](docs/research/computing-ai-history-sources.md)、[深度学习来源表](docs/research/deep-learning-history-sources.md)。分享这些样例或导出图片时，请附上相应来源表。

常用操作很少：双击文字直接编辑，拖动连接点建立关系，选中卡片后粘贴图片；滚轮缩放，拖动空白处平移。有效编辑立即进入当前文档，**完成后记得保存文件**。更多操作、快捷键和本地文件服务见[使用指南](docs/guide.md)。

## 选择你习惯的入口

几个入口复用同一套画布编辑器，你可以按自己的工作环境选择。

| 入口 | 使用方式 |
| --- | --- |
| 独立浏览器 | 从上面的命令开始，也可用本地服务直接打开指定文件；见[使用指南](docs/guide.md#开始使用) |
| DSH Web | 在主面板整理画布；见[安装说明](dsh/README.md) |
| ChatGPT／Codex 桌面文件面板 | 在支持文件编辑扩展的桌面会话中打开 `.canvas`；见[本地插件说明](codex/README.md) |
| Claude Code | 通过插件在本地 Browser 页面使用画布；见[接入说明](claude/README.md) |

目前已在本机 Codex 文件面板、DSH Web 和普通浏览器完成实际编辑与保存验证。Claude Code 已完成本地打包和浏览器链路检查，真实 Claude 账号会话尚待验证；其他系统和宿主版本的范围见[验收记录](docs/mechanisms/paperstream-design.md#开源前验收2026-11-13)。

## 让你的 agent 学会整理画布

仓库提供一份可分发的 [Paperstream Skill](skills/paperstream/SKILL.md)，说明怎样读取画布、按要求修改、保留其他内容并核验结果。安装时请带上整个 `skills/paperstream/` 目录；Codex／Claude 插件构建包已包含它和 Python 启动器。

如果你准备编写自己的自动化流程，继续阅读 [API 参考](skills/paperstream/references/api.md)与[操作指南](docs/guide.md#让-agent-操作画布)。参与本仓库开发的 agent 还应遵循 [AGENTS.md](AGENTS.md)。API、MCP 与 Skill 的分工及当前接入边界记录在[交互审查](docs/research/agent-interaction-audit.md)，开发与检查命令见[使用指南](docs/guide.md#开发与验证)。

## 许可与参与

Paperstream 的自有代码与文档采用 [MIT License](LICENSE)。第三方依赖、人物肖像和社区角色素材保留各自许可，详见[第三方声明](THIRD_PARTY_NOTICES.md)及对应来源记录。

欢迎分享你怎样用它整理一个方向，也欢迎提出那些打断阅读和思考的小问题。报告 bug 时，附上复现步骤、使用环境和脱敏后的最小画布，会更容易定位。想了解实现与设计取舍，可以继续阅读[设计记录](docs/mechanisms/paperstream-design.md)。
