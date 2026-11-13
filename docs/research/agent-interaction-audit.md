# Agent 交互与开源边界审查

核查日期：2026-11-13。本记录区分源码已实现的能力、官方协议提供的机制和后续可选方案；不代表所有宿主完成真机验收。

## 当前入口实际做什么

| 入口 | 源码中的能力 | 不能据此宣称 |
| --- | --- | --- |
| Python `CanvasGraph` / CLI | 按稳定 ID 读写论文和边，严格校验，保留未知数据，协作锁、外改检查与原子保存。`set_document` 可处理标准节点及扩展。 | 不会查证论文，不提供实时协作或完整历史数据库。 |
| DSH 面板 | 人工操作同一编辑器，浏览器文件选择与保存；宿主路由负责偏好和外链。 | 没有给模型注册图文档 CRUD 工具；不是远程宿主文件浏览器。 |
| Codex 本地 MCP 插件 | `codex/src/server.ts` 仅注册一个 `ui://` HTML resource 和 app-only `paperstream.canvas` 文件入口；UI 通过宿主 `openai/resource` 读取、订阅和条件写回。 | 不是通用 MCP 图编辑 API，没有模型可用的 `read_graph` / `update_node` 等工具，也不自带云端文件服务。 |
| Claude 插件 | `/paperstream:open` 手动 Skill，调用打包的 Python CLI，启动单文件、带令牌的 loopback 页面。 | 当前没有 Claude MCP server，也没有原生 `.canvas` 文件接管。普通浏览器通过不等于 Claude 会话验收通过。 |

以上来自 `paperstream/canvas.py`、`paperstream/__main__.py`、`paperstream/preview.py`、`dsh/src/`、`codex/src/server.ts`、`codex/src/app.tsx` 和 `claude/skills/open/SKILL.md` 的静态核查。

## API、MCP、Skill 和 AGENTS 各自负责什么

| 层 | 责任 |
| --- | --- |
| 文件格式与 `CanvasGraph` | 操作语义、校验、保留未知数据及保存冲突规则；是业务实现的单一来源。 |
| CLI | 把同一操作提供给有 shell 的本地 agent，返回结构化 JSON；复杂多步修改用 Python 一次加载、一次保存。 |
| MCP tools | 让宿主发现有 schema 的动作，不要求 agent 先学习 shell。具体的权限、范围和版本约束仍须服务器实现。 |
| MCP resources / MCP Apps | 分别提供可读取的上下文和交互 HTML；单有 MCP tools 支持不代表宿主能显示 UI，更不代表能写本机文件。 |
| Skill | 可移植、按需加载的操作流程：先读后改、核对来源、使用返回 ID、保留字段、处理冲突并回读结果。 |
| `AGENTS.md` | 本仓库持续适用的约定、构建和验证要求；复制到别处的插件不会自动继承仓库文件的约束。 |

MCP 的 schema、说明和 server instructions 可以让简单自描述工具不依赖额外 Skill。它们不会自动建立论文来源标准、工作流或写文件隔离。本项目仍适合保留一份精简 Skill，集中表达反复使用的整理流程；AGENTS 不应复制整本 API 手册。[OpenAI MCP 概念](https://developers.openai.com/plugins/concepts/mcp-server)、[Skill 的互补职责](https://developers.openai.com/plugins/concepts/skills)、[持久项目约定](https://learn.chatgpt.com/docs/customization/overview)。

MCP tools 描述结构化动作，resources 提供上下文；MCP Apps 是独立扩展，UI 与宿主通过消息接口通信，能力受宿主支持和授权限制。[MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)、[resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)、[MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)。Claude 官方也将 MCP 的连接能力与 Skill 的流程知识分开，并支持本地 stdio 工具。[Claude MCP](https://code.claude.com/docs/en/mcp)、[Claude Skill](https://code.claude.com/docs/en/skills)。

## 本次建议：保留小内核，不为协议扩功能

当前本地模式的 API/CLI 足够承担有 shell 的 agent 编辑；人工用画布、agent 用语义操作，共享 `.canvas`。优先补操作说明、例子、分发 Skill 和实际验收。避免让 agent 用模拟鼠标输入代替内容 API，也避免让 agent 重写整份 JSON 或把 React Flow 状态当保存格式。

如果出现明确的无 shell 客户端需求，再添加薄 MCP adapter，继续调用 `CanvasGraph`，不再造一种图格式或另一套保存机制。最小候选是 `read_graph` 和批量 `apply_changes`：只允许预先选择的文件、读返回 revision、写必须携带 expected revision、批次全部校验后一次保存、冲突拒绝覆盖、返回实际变更及新 revision。避免最初就暴露任意路径、任意代码执行或通用写文件工具。

当前 Python 批量修改可通过同一个 `CanvasGraph` 实例获得加载到保存之间的外改保护。分开的 CLI `show` 与 `update-*` 每次重新加载，尚没有跨命令传入 expected revision 的接口；若未来包装 MCP，应明确补此边界，不能只把 shell 命令重命名。CLI 的结构化错误、稳定 ID 和 Python API 已可继续复用。

只有 MCP 的传输并不能解决视觉协作：agent 修改磁盘时，用户可能还有未保存的浏览器草稿。现有保护会拒绝覆盖或保留草稿，不会自动合并。先保存、再交给 agent、回读并在画布复核，是目前清晰可审计的操作顺序；不能宣称无冲突实时共编。

## 开源与分发检查

- 仓库没有已选定的根 `LICENSE`，不能替所有者决定许可或声称已经获得某种开源授权。发布前由所有者选择；第三方许可单独保留，见根 `THIRD_PARTY_NOTICES.md`。
- 实际 bundle 涉及 ELK 的 EPL 声明和 MCP 的许可迁移文本，不能统称 MIT。已保留 26 个实际打包 npm 版本的许可与准确来源，含 cfworker 上游派生代码声明。此记录不构成法律兼容性意见。
- Python 模块可从仓库或便携包运行；目前没有 Python 安装元数据，不能写 `pip install paperstream`。JS 源码构建需要 web 锁定依赖；便携包运行要求与源码构建要求应分开。
- Web / DSH 会在同源浏览器存储保留工作区草稿和文件关联；图片可内嵌在 `.canvas`。分享文件也会分享其中图片，删除原图文件不会清除浏览器草稿。Codex 宿主文件模式不把文档写入浏览器草稿；Claude 令牌在标签页 sessionStorage，服务仅绑定单个明确文件。
- 对当前跟踪的 146 个文件做启发式扫描，未发现私钥标记、硬编码长凭据或 `/Users/` 路径。它不是 Git 历史或所有秘密格式的完整扫描，不能作无泄露保证。`.local/`、依赖、构建产物和本机数据已忽略。
- README 中的本机 `.local/start-dsh.sh`、过长的调试历史、重复的旧 Mermaid 主教程和相互不一致的宿主验收描述应移出首屏；保留简洁的支持矩阵和链接，旧功能不作为产品卖点。当前 root README 与 feature-analysis 的 Codex 原生验收措辞已有差异，应以最新实际证据统一。
- 公开源码、自建本地 marketplace 与官方商店上架是不同步骤。OpenAI 当前把本地 stdio 插件的公开商店提交限制为获批伙伴；不影响说明个人本地安装，但不能承诺开源即自动上架。[官方 desktop-only 分发说明](https://developers.openai.com/plugins/deploy/desktop-only)。

OpenAI 特定的文件侧栏能力来自其 Extensions，不是通用 MCP 的必然行为。[官方文件入口说明](https://developers.openai.com/plugins/build/extensions#file-viewers-and-editors)。以上调研未调用模型、注册账号、修改全局插件配置或对外发布。
