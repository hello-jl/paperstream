# Paperstream 使用指南

本页说明如何打开、编辑、保存画布，以及如何让 agent 通过 API 整理同一份文件。产品理念与示例见 [README](../README.md)，完整命令见 [API 参考](../skills/paperstream/references/api.md)。

## 开始使用

### 在独立浏览器中打开

构建界面需要 Node.js **22.18+**。取得源码后，在仓库根目录运行：

```sh
npm ci --prefix web
npm --prefix web run dev
```

打开终端显示的本机地址，从文件菜单选择一张 `.canvas`。可以先试这些示例，再另存为自己的文件：

| 示例 | 适合用来了解什么 |
| --- | --- |
| [ResNet、DenseNet、ResNeXt](../examples/resnet.canvas) | 用三篇论文快速熟悉卡片、要点与关系 |
| [CNN 演进](../examples/cnn-evolution.canvas) | 查看 LeNet 等经典工作的联系 |
| [量子力学经典论文](../examples/quantum-foundations.canvas) | 围绕一个学科组织阅读 |
| [DeepH 阅读路线](../examples/deeph-reading.canvas) | 整理具体研究方向的阅读路线 |
| [从电子计算到 AI](../examples/computing-ai-history.canvas) | 含人物肖像的计算机与 AI 发展图 |
| [AI 历史连续时间线](../examples/computing-ai-history-connected.canvas) | 用真实连线连续串起 16 个里程碑，可继续编辑 |
| [深度学习的几条发展线](../examples/deep-learning-history.canvas) | 从反向传播到视觉、注意力、语言与生成模型 |

历史画布的人物、论文来源及素材许可分别见 [计算机与 AI 来源表](research/computing-ai-history-sources.md)、[深度学习来源表](research/deep-learning-history-sources.md)。分享导出图时请带上相应来源表。

支持文件句柄的浏览器可保存回原文件；其他环境使用下载副本。请确认保存位置和文件名，草稿恢复不能替代正式保存。

### 直接绑定一份本地文件

本地单文件桥适合希望页面直接读写一个确定文件的情况。除上述 web 依赖外，需要 Python **3.10+**。在仓库根目录构建页面，再启动只读预览：

```sh
npm --prefix claude run build
python3 -m paperstream serve examples/resnet.canvas --read-only --port 3817
```

打开命令输出的**完整本机链接**，其中的随机令牌用于访问这份文件。只输入裸端口地址不能取得文件权限。该浏览器入口不需要 Claude 账号。

准备编辑时，将路径换成自己的 `.canvas`，去掉 `--read-only`。服务只监听 `127.0.0.1`，只授权启动时指定的文件；进程保持前台运行，用 Ctrl-C 停止。端口被占用时可换端口，或用 `--port 0` 自动分配，不必停止其他服务。它不提供目录浏览、任意路径读写、创建或删除文件的接口。

本地桥与便携包的详细操作见 [Claude／浏览器适配说明](../claude/README.md)。

## 手工整理与保存

双击卡片简称、要点（takeaway）或关系文字（relation）即可就地编辑。点击卡片的文档图标，或右键卡片／边，可以打开附近的详情。

有效修改立即进入当前画布，没有“应用更改”步骤；**保存文件仍是单独操作**。Enter 结束单行编辑，Ctrl/Cmd+Enter 结束多行编辑。要恢复已经生效的修改，使用撤销。

| 要做什么 | 操作 |
| --- | --- |
| 新增内容 | 空白处双击，或点击底部“插入”，选择论文、Note 或共享关系标签 |
| 连接两张卡片 | 拖动连接点；也可选择起点后点击“连线”，再点目标。关系说明可为空 |
| 调整关系 | 右键打开详情，设置方向、双向箭头、线型、箭头形状、依据与人工权重；多条线可共用一个标签 |
| 表达重要程度 | 节点边框与关系线宽在各自详情中独立调节；人工权重另行保存 |
| 打开原文 | 使用卡片的原文 URL 入口，经浏览器或宿主打开链接 |
| 加入图片 | 选中卡片后 Ctrl/Cmd+V，或在详情中导入 PNG/JPEG/WebP；拖图片右下角调整宽度 |
| 查看全局 | 智能竖排、搜索、只看附近、适应视图；滚轮缩放，拖空白处平移 |
| 导出图片 | 文件菜单导出全图 PNG 或 SVG |
| 调整外观 | 右上角设置切换主题与直角／圆角／曲线路径 |

卡片随内容增减自动调整高度，年份贴在卡片内部右下角。手动调整尺寸后可以保留留白。要点支持用 `- ` 分点。

图片默认铺满内容宽度，不显示上传文件名。论文图表保留原图比例；人物照片可在详情里选择方形或 3:4 肖像框，调整取景和缩放，让同组头像大小一致。取景只改变展示，不改写原照片，切回原图即可恢复。PNG/SVG 导出沿用同样的取景参数。每张图片上限为 **8 MB、3200 万像素、单边 16384 像素**。当前提供 PNG/SVG 导出，不提供 PPT 或放映。

### 与外部修改交接

人和 agent 切换操作时，先保存当前画布，再确认要操作的是哪一份文件。API 只能读取已写入磁盘的内容，看不到尚未保存的 UI 草稿。

本地桥及原生文件宿主会检查保存版本。遇到外部更新时，保留本次编辑意图，重新读取最新内容，核对差异后再应用合适的修改。请勿用旧快照强行覆盖，也不要通过重载丢弃尚未保存的草稿。不同入口的外部更新提示与权限边界见各宿主说明。

## 让 agent 操作画布

先向 agent 提供文件路径、要修改的范围与可靠的论文资料。可以这样描述任务：

> 读取这张画布，把指定论文的要点更新成我提供的三点，再补一条方法比较关系。保留已有布局、其他笔记和无关内容。完成后回读并核验修改。

仓库提供两种约定：

- [AGENTS.md](../AGENTS.md)：约束在本仓库工作的 agent，包含改图和开发要求。
- [Paperstream Skill](../skills/paperstream/SKILL.md)：可单独分发的画布操作流程，带 [API 参考](../skills/paperstream/references/api.md)。安装时复制整个 `skills/paperstream/` 目录；只复制 `SKILL.md` 会丢失参考资料。

Codex／Claude 插件构建产物已包含 Skill 与 Python 启动器。单独分发 Skill 时，仍需提供现有 Paperstream 运行时；Skill 本身不包含完整运行环境。

### CLI：先读取，再按 ID 修改

以下命令在仓库根目录运行。`show --raw` 读取完整 Canvas 文档；普通 `show` 仅提供论文与关系摘要，不能用来重建整图。

```sh
python3 -m paperstream show examples/resnet.canvas --raw
python3 -m paperstream validate examples/resnet.canvas
```

修改自己的文件时，使用读取结果中的真实节点 ID：

```sh
python3 -m paperstream update-node /path/to/papers.canvas ACTUAL_NODE_ID --alias '自定义简称'
python3 -m paperstream show /path/to/papers.canvas --raw
```

每个 CLI 修改命令会分别加载、保存，不是跨命令事务。成功时 stdout 输出 JSON；错误时 stderr 输出结构化错误，业务或读写错误退出码为 1，用法错误为 2。请同时检查退出码和错误信息，不把空输出当作成功。完整命令见 `python3 -m paperstream --help`。

### Python API：多个相关修改，一次保存

Python 运行时只使用标准库。下面的 ID 是占位符，必须替换为先前读取到的真实 ID：

```python
from paperstream import CanvasGraph

graph = CanvasGraph.load("papers.canvas")
graph.update_node("ACTUAL_NODE_ID", takeaway="- 核心贡献\n- 适用边界")
graph.update_edge("ACTUAL_EDGE_ID", relation="比较两种连接方式")
graph.validate()
graph.save()
```

使用同一个实例可将多个相关修改校验后一次保存。保存后重新读取，核验请求结果以及无关内容。普通字段优先使用 `update_node` / `update_edge`；完整文档操作需先读取原文档，并保留坐标、尺寸、数组顺序和未知字段。

API 保存检查读取时的磁盘版本，使用协作锁与原子替换。它不提供实时协作或自动合并。冲突后重新读取并核对，不自动删除其他写入者的锁。删除仍有关联边的节点默认受约束，只有用户授权同时删除关系时才使用 `cascade=True` 或 `--cascade`。

### API、MCP 与 Skill 的分工

API 负责读写与校验；CLI 让有本地执行能力的 agent 调用 API；Skill 说明整理步骤、来源核对和冲突处理；AGENTS.md 约束当前仓库的工作。

MCP 可以将 API 包装成可发现的工具，但不会自动补齐业务规则。**当前 Codex MCP 提供画布 UI 资源和文件入口，没有供模型增删改图的通用工具。** Claude 接入使用 Skill、CLI 与本地文件桥。当前沿用同一套 API 写入逻辑；没有 shell 的客户端如需改图，仍需额外接入。详见 [交互方式审查](research/agent-interaction-audit.md)。

Paperstream 编辑器不内置模型调用，也不提供模型账号。可使用哪种 agent，取决于所选客户端及其本地执行能力。

## 文件格式与迁移

每张画布是一份独立的 `.canvas` JSON 文件，可复制、备份、纳入 Git，或迁移到其他电脑与支持的宿主。Paperstream 不要求云端数据库来保存画布。

- 插入或粘贴到论文卡片的图片内嵌在 JSON 中，随 `.canvas` 一起迁移。
- 普通文件卡片引用的本地附件需要一起复制；外部链接需要来源仍可访问。
- 主题等使用偏好保存在各自环境中，不随单张画布迁移。
- 支持 JSON Canvas 的工具可以读取其标准结构，但不保证呈现相同的论文表单与图片扩展。

论文数据存于标准 text 卡片的 fenced JSON，`paperstream: 1` 表示模板版本，业务字段为 `name`、`alias`、`takeaway`、`url`、`year`；边的标准 `label` 表示关系。`name` 保留完整原始标题，`year` 对应所链接的版本。缺失资料留空，不猜测年份或原文地址。

普通文本、文件卡片、链接、分组和未知字段会保留。本项目不完整复刻 Obsidian 的附件／Markdown 体验；原生 Codex 文件适配尚不提供宿主相对路径的本地附件加载，网络图片也受宿主权限约束。保存时 JSON 缩进可能改变，未请求修改的数据应保持。

旧 Mermaid API 与 `.mmd` 档案继续保留。新图使用 `.canvas`，`export-canvas` 可将旧图单向导出为新格式，不自动双向同步或删除原文件。自动化修改 `.canvas` 和 `.mmd` 均须使用对应 API 或 CLI，完整规则见 [agent 约定](../AGENTS.md)。

## 宿主支持与验收范围

| 入口 | 当前验收范围 | 安装与限制 |
| --- | --- | --- |
| 独立浏览器 | 完整编辑器；本地桥的真实文件读写、外改及冲突已验收 | [开始使用](#开始使用) |
| DSH Web | 复用宿主 React 的主面板插件；macOS／Chrome／DSH 0.2.2-rc.1 已实测 | [DSH 说明](../dsh/README.md) |
| ChatGPT／Codex 桌面文件面板 | 原生侧栏显示画布；本机 Codex 会话已实测编辑、撤销重做、写盘、外改与冲突 | [本地插件安装](../codex/README.md) |
| Claude Code | 插件加本地 Browser 页面；包校验、隔离安装、浏览器读写通过，真实 Claude 会话待验收 | [插件与账号边界](../claude/README.md) |

Codex 插件 UI 运行需要 Node.js 22.18+，其 agent CLI 另需 Python 3.10+。Claude 便携包运行只需 Python 3.10+，构建仍需 web 依赖。DSH 的当前宿主版本要求 Node.js 24.9+。

Claude Browser 入口使用本地页面，当前不是 Claude 原生文件查看器。Codex 原生文件适配的验收仅覆盖已测试的桌面会话，不代表所有 Chat／Work 入口与平台版本。远程宿主资源按宿主 revision / ETag 保存，不能绕过宿主另写一个同名本地文件。

尚未完成验证的范围包括 Claude 账号内使用、DSH Desktop、其他操作系统和大规模画布。原生宿主仍观察到 ResizeObserver 循环告警，根因未解决，尚未观察到它造成保存失败。最近的检查结果见 [开源前验收记录](mechanisms/paperstream-design.md#开源前验收2026-11-13)。

## 开发与验证

在仓库根目录运行：

```sh
python3 -m unittest discover -s tests -v
npm --prefix web test
npm --prefix web run test:interop
npm --prefix web run build
npm --prefix dsh run build
npm --prefix dsh test
node dsh/verify-build.mjs
```

桌面适配按各自 [Codex](../codex/README.md)／[Claude](../claude/README.md) 说明安装依赖、执行 typecheck、build 与 test。界面基于 React Flow，智能布局使用 ELK，Python 运行时无第三方依赖。

构建和自动测试不能替代宿主验收。修改读写或交互行为后，应在临时副本中核对保存结果，同时检查冲突与失败路径。问题报告请提供复现步骤、宿主／版本和脱敏后的最小图，不提交访问令牌、个人草稿或论文附件。设计与机制维护在 [设计文档](mechanisms/paperstream-design.md)。
