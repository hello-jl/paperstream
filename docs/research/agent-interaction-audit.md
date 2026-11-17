# Agent 交互与开源边界审查

核查日期：2026-11-17。本记录区分源码已实现的能力、官方协议提供的机制和后续可选方案；不代表所有宿主完成真机验收。

## 当前入口实际做什么

| 入口 | 源码中的能力 | 不能据此宣称 |
| --- | --- | --- |
| Python `CanvasGraph` / CLI | 按稳定 ID 读写论文和边，严格校验，保留未知数据，协作锁、外改检查与原子保存。`set_document` 可处理标准节点及扩展。 | 不会查证论文，不提供实时协作或完整历史数据库。 |
| DSH 面板 | 人工操作同一编辑器，浏览器文件选择与保存；宿主路由负责偏好和外链。 | 没有给模型注册图文档 CRUD 工具；不是远程宿主文件浏览器。 |
| Codex 本地 MCP 插件 | `codex/src/server.ts` 仅注册一个 `ui://` HTML resource 和 app-only `paperstream.canvas` 文件入口；UI 通过宿主 `openai/resource` 读取、订阅和条件写回。 | 不是通用 MCP 图编辑 API，没有模型可用的 `read_graph` / `update_node` 等工具，也不自带云端文件服务。 |
| 标准 MCP Apps | `mcp/` 提供模型可用的 list/open/read/apply 工具，app-only 完整 JSON 读写，以及标准 `ui://` 页面。调用同一 CanvasGraph，访问启动时选择的文件，按 revision 条件保存。 | 不接管宿主原生文件侧栏，不提供远端 HTTP/OAuth 服务；本地参考宿主通过不等于 Claude 账号真机通过。 |
| Claude Code 插件 | `/paperstream:open` 手动 Skill，调用打包的 Python CLI，启动单文件、带令牌的 loopback 页面。 | 该插件包本身没有 MCP server，也没有原生 `.canvas` 文件接管。普通 Desktop 对话内嵌使用独立的标准 MCP 配置。 |

以上来自 `paperstream/canvas.py`、`paperstream/mcp_bridge.py`、`paperstream/preview.py`、`dsh/src/`、`codex/src/`、`mcp/src/` 和 `claude/skills/open/SKILL.md` 的源码核查。

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

## 当前方案：API 内核与薄 MCP 适配器

当前本地模式的 API/CLI 足够承担有 shell 的 agent 编辑；人工用画布、agent 用语义操作，共享 `.canvas`。优先补操作说明、例子、分发 Skill 和实际验收。避免让 agent 用模拟鼠标输入代替内容 API，也避免让 agent 重写整份 JSON 或把 React Flow 状态当保存格式。

用户已明确需要没有 Shell 的 Claude 对话入口，因此新增独立 [MCP adapter](../../mcp/README.md)，继续调用 `CanvasGraph`。`paperstream_read_graph` 和 `paperstream_apply_changes` 只操作预选文件，读取返回 revision，写入必须携带 expected revision，批次校验后一次保存；冲突拒绝覆盖并返回实际变更／新版本。模型不能传任意路径、执行任意代码、删除或整图替换。读图包含普通 Note、布局及未知字段，内嵌图片源被省略，明确不能用于重建整图。

Python 批量修改可通过同一个 `CanvasGraph` 实例获得加载到保存之间的外改保护。分开的 CLI `show` 与 `update-*` 每次重新加载，仍不是跨命令事务。MCP worker 额外核对调用者提供的 expected revision，弥合读取工具与修改工具之间的间隔；不是简单把 Shell 命令重命名。

Claude 官方明确演示了 Desktop 配置本地 stdio 服务后，在对话中内嵌 MCP Apps。不能把 Claude Code plugin 的加载范围泛化成所有 Desktop MCP 的限制，也不能仅凭 `openai/ui` 元数据键认定不兼容；原 Codex 适配真正依赖的是宿主 `openai/resource` 文件能力。标准适配器将模型动作放在 server tools，UI 通过 `app.callServerTool` 调用；不依赖 Claude 另有账户和远端要求的前端 view tools。[本地 MCP Apps 示例](https://claude.com/docs/connectors/building/mcp-apps/getting-started#try-an-example-mcp-app-in-claude-desktop)、[view tools 范围](https://claude.com/docs/connectors/building/mcp-apps/app-tools#views-that-claude-can-reach)。网页／云端远程连接器不能直接使用本机 stdio 或 `127.0.0.1` 文件桥；本轮没有新增公网服务。

只有 MCP 的传输并不能解决视觉协作：agent 修改磁盘时，用户可能还有未保存的浏览器草稿。现有保护会拒绝覆盖或保留草稿，不会自动合并。先保存、再交给 agent、回读并在画布复核，是目前清晰可审计的操作顺序；不能宣称无冲突实时共编。

## 开源与分发检查

- 维护者已选择 MIT，根 `LICENSE` 为完整许可原文，各端构建和分发包携带它。项目自有代码与文档的 MIT 许可不替换第三方依赖、历史肖像或社区角色素材的许可；各自来源与要求见根 `THIRD_PARTY_NOTICES.md` 和相关素材记录。
- 实际 bundle 涉及 ELK 的 EPL 声明和 MCP 的许可迁移文本，不能统称 MIT。标准 MCP 适配器加入后保留 32 个实际打包 npm 版本的许可与准确来源，含 cfworker 上游派生代码声明。此记录不构成法律兼容性意见。
- Python 模块可从仓库或便携包运行；目前没有 Python 安装元数据，不能写 `pip install paperstream`。JS 源码构建需要 web 锁定依赖；便携包运行要求与源码构建要求应分开。
- Web / DSH 会在同源浏览器存储保留工作区草稿和文件关联；图片可内嵌在 `.canvas`。分享文件也会分享其中图片，删除原图文件不会清除浏览器草稿。Codex 宿主文件模式不把文档写入浏览器草稿；Claude 令牌在标签页 sessionStorage，服务仅绑定单个明确文件。
- 发布前追加只读历史扫描：扫描时全部 6 个 refs 可达的 62 个提交、191 个历史路径、414 个去重 blob（7.62 MB），另检查当前 186 个已跟踪文件。未发现误入历史的 `.local`、`.env`、凭据／本机数据路径、私钥、高置信服务令牌或 JWT 常量；两处路径启发式命中核对为 `/tmp` 测试 fixture。范围不含忽略／未跟踪文件、不可达对象、未取回远端分支及所有未知凭据格式，不作零泄露保证；没有改写历史。
- README 中的本机 `.local/start-dsh.sh`、过长的调试历史、重复的旧 Mermaid 主教程和相互不一致的宿主验收描述应移出首屏；保留简洁的支持矩阵和链接，旧功能不作为产品卖点。当前 root README 与 feature-analysis 的 Codex 原生验收措辞已有差异，应以最新实际证据统一。
- 公开源码、自建本地 marketplace 与官方商店上架是不同步骤。OpenAI 当前把本地 stdio 插件的公开商店提交限制为获批伙伴；不影响说明个人本地安装，但不能承诺开源即自动上架。[官方 desktop-only 分发说明](https://developers.openai.com/plugins/deploy/desktop-only)。

OpenAI 特定的文件侧栏能力来自其 Extensions，不是通用 MCP 的必然行为。[官方文件入口说明](https://developers.openai.com/plugins/build/extensions#file-viewers-and-editors)。以上调研未调用模型、注册账号、修改全局插件配置或对外发布。
