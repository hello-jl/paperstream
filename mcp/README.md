# Paperstream：标准 MCP Apps 接入

让支持 MCP Apps 的桌面对话直接显示、编辑 Paperstream 画布，模型也能通过服务器工具整理同一份 `.canvas`。这个适配器不需要 agent 执行 Shell，不使用 OpenAI 的 `openai/resource` 文件协议，也不启动 HTTP 编辑器。原有 [Codex 原生文件面板](../codex/README.md)和 [Claude Code 插件](../claude/README.md)继续独立提供。

界面复用 Paperstream 编辑器，服务器只访问启动时明确选择的现有文件。模型的定点修改和人手动保存都经过 Python `CanvasGraph`，写入必须携带读取时的 revision。文件有外改时拒绝覆盖，编辑器保留当前草稿；这仍是保存后交接，不是实时无冲突共编。

## 构建与启动

需要 Node.js **22.18+** 和 Python **3.10+**。构建时在仓库根运行：

```sh
npm ci --prefix web
npm ci --prefix mcp
npm --prefix mcp run typecheck
npm --prefix mcp run build
```

分发目录是 `mcp/dist/package/`，包含打包的服务器、编辑页面、标准库 Python 实现与许可，不需要携带 `node_modules`。可把整个目录复制到其他位置；运行机器仍需 Node 与 Python。

```sh
node /absolute/path/paperstream-mcp/dist/server.mjs --file /absolute/path/papers.canvas
```

这是 **stdio MCP 服务**，等待宿主通过标准输入输出连接；不会打印网页地址。重复 `--file` 可授权多份画布，`--read-only` 将全部文件以只读方式打开，`--python /absolute/path/python3` 可指定 Python。未选择文件会拒绝启动，不提供任意路径、目录浏览、创建或删除文件的工具。

## 在 Claude Desktop 中配置

在 Settings → Developer → Edit Config 打开的 `claude_desktop_config.json` 中，合并以下条目并保留其他服务：

```json
{
  "mcpServers": {
    "paperstream": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/paperstream-mcp/dist/server.mjs",
        "--file", "/absolute/path/papers.canvas",
        "--python", "/absolute/path/to/python3"
      ]
    }
  }
}
```

替换为实际可执行文件、完整分发目录和画布的绝对路径，保存后重启 Claude Desktop。可以对 Claude 说：

> 列出 Paperstream 已授权的画布，打开 papers.canvas。先读取图中的节点与关系，再把我提供的论文摘要补到指定卡片；保留现有排版，修改后回读核对。

宿主支持 MCP Apps 且允许显示时，`paperstream_open_canvas` 的工具结果会承载可编辑画布。只有普通 MCP 工具支持的客户端仍可读图、定点改图；终端不因此获得 React 画布。

Claude 官方提供了[本地 stdio MCP Apps 在 Desktop 对话中内嵌的示例](https://claude.com/docs/connectors/building/mcp-apps/getting-started#try-an-example-mcp-app-in-claude-desktop)。这个安装渠道与 Claude Code 的 plugin 目录不同，不能把 `/paperstream:open` 插件直接当作桌面 MCP 配置。

本实现不依赖前端 `app.registerTool`。必要的模型工具在服务器端，UI 通过标准 `app.callServerTool` 读写；Claude 的前端 view tools 另有远端连接器和账户开放条件，见[官方能力说明](https://claude.com/docs/connectors/building/mcp-apps/app-tools#views-that-claude-can-reach)。

## 给 agent 的工具约定

| 工具 | 调用方 | 用途 |
| --- | --- | --- |
| `paperstream_list_canvases` | 模型／画布 | 列出预选文件的 `fileId`、名称和权限 |
| `paperstream_open_canvas` | 模型／画布 | 打开指定 `fileId` 的 MCP Apps 编辑器 |
| `paperstream_read_graph` | 模型 | 读取所有卡片、边、正文、布局及 revision；省略内嵌图片字节 |
| `paperstream_apply_changes` | 模型 | 用稳定 ID 与 `expectedRevision` 批量定点修改，一次校验保存 |
| `paperstream_read_canvas` | 画布 | 读取完整 JSON 和版本 |
| `paperstream_write_canvas` | 画布 | 按版本保存完整编辑草稿 |

先列文件再读取；`fileId` 是服务器标识，不是文件路径。`read_graph` 明确省略图片源字节，不能拿它重建整张图。定点写入由服务器重新加载完整文档，保留无关图片、未知字段、Note、数组顺序和排版。已有论文的原题、年份与链接应据资料填写，缺失时留空，不编造。

`apply_changes` 的 `changes` 支持 `update_node`、`update_edge`、`add_node`、`add_edge`、`move_node`、`resize_node`、`clear_node_fields`。例如以实际读取的 ID 和 revision 调用：

```json
{
  "fileId": "FROM_LIST_CANVASES",
  "expectedRevision": "FROM_READ_GRAPH",
  "changes": [
    {"op": "update_node", "node_id": "ACTUAL_NODE_ID", "takeaway": "- 第一条认识\n- 第二条认识"},
    {"op": "add_edge", "source": "ACTUAL_SOURCE_ID", "target": "ACTUAL_TARGET_ID", "relation": "沿用残差连接"}
  ]
}
```

`update_node` 只编辑论文模板，其可选字段是 `alias`、`takeaway`、`name`、`url`、`year`；普通 Note 全文目前由画布手工编辑。清除 `name`、`url`、`year` 使用 `clear_node_fields`。批次任一操作无效则整批不保存。冲突返回 `conflict`，不得用新 revision 盲重试旧内容，应重读并核对编辑意图。模型工具不提供整图替换或删除操作。

MCP 工具 schema 和服务器说明已覆盖基础操作，因此简单读写不强制安装 Skill；[Paperstream Skill](../skills/paperstream/SKILL.md)仍适合表达论文来源要求、交接流程和本地 API 操作规范。磁盘工具看不到未保存 UI 草稿：交给模型前先在画布保存，修改后再刷新核对。

## 支持与验收范围

- 本地 stdio 面向运行在用户机器上的 MCP 宿主。桌面配置、Claude Code plugin 和远端 connector 是不同安装渠道。
- `claude.ai` 或云端会话无法直接运行这份本地 stdio 配置。本包未实现远端 HTTP/OAuth 部署；云端连接也不会自动取得用户电脑的磁盘权限，见[官方网络说明](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)。
- 不接管 Claude 的原生 `.canvas` 文件侧栏，不承诺所有客户端都能显示 MCP Apps。
- 没有 Claude 账号时可验证真实 stdio 协议、工具、UI 资源、文件读写与冲突，以及官方 AppBridge 的本地参考宿主。Claude 账户内的授权、内嵌显示和剪贴板仍需实机验收，不能用本地测试冒充通过。

## 开发检查

```sh
python3 -m unittest discover -s tests -v
npm --prefix mcp run typecheck
npm --prefix mcp run build
npm --prefix mcp test
npm --prefix mcp run preview
```

最后一条启动仅供开发的参考宿主：使用官方 AppBridge、真实 stdio Client 和临时测试画布，不改 `examples/`。测试页可验证 UI 修改／保存与外改冲突，它不是 Claude 客户端。运行完毕用 Ctrl-C 停止。

服务拒绝符号链接或启动后被替换的父目录，保存继续使用 CanvasGraph 协作锁及原子写盘。这些措施不隔离已经能够访问该目录的其他本机进程；版本检查也不能提供跨 UI 草稿的自动合并。
