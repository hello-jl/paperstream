# Paperstream agent 约定

Paperstream 让人和 agent 维护同一份独立 JSON Canvas 文档：人用 React Flow 画布编辑，agent 用 Python 标准库 API、CLI 或其标准 MCP 工具做可核对的修改。新工作使用 `.canvas`，旧 Mermaid API 与档案继续保留。自动化改图必须经过 API。

本文件适用于本仓库的工作。若用户要求将 Paperstream 部署或安装到当前机器及本地宿主环境，请先阅读 [DEPLOY.md](DEPLOY.md) 并统一通过 `python3 scripts/setup.py` 执行体检、构建、预览安装与验收。可单独分发给其他 agent 的改图指南是 [skills/paperstream/SKILL.md](skills/paperstream/SKILL.md)；完整的命令样例、运行时定位与错误处理见其 [API 参考](skills/paperstream/references/api.md)。

## 使用画布：读取、定点修改、核验

若当前宿主提供标准 `paperstream_*` MCP 工具，先 `paperstream_list_canvases` 取得预选文件 ID，再 `paperstream_read_graph` 读取所有节点、边和 revision，以稳定 ID 调 `paperstream_apply_changes`，传入该次读取的 `expectedRevision`。服务器从完整文档加载并通过 CanvasGraph 一次保存；模型阅读视图省略图片源字节，不能据此重建整图。冲突时重读并核对意图，不换一个新版本号盲重试。工具范围与示例见 [标准 MCP 约定](mcp/README.md#给-agent-的工具约定)。以下步骤适用于本地 API／CLI。

1. 确认用户指定的文件与请求范围；操作 Canvas 时先运行 `python3 -m paperstream show <file> --raw` 读取完整文档，使用返回的稳定节点、边 ID。Mermaid 使用不带 `--raw` 的 `show`。`nodes()` / 普通 `show` 仅提供论文与关系摘要，不能作为整图重建来源。
2. 普通字段使用 `update_node` / `update_edge` 或对应 CLI 子命令。多个相关变更优先在同一个 `CanvasGraph.load()` 实例内完成，`validate()` 后 `save()` 一次；Python 的 `with CanvasGraph.load(...)` 会在正常退出时保存。CLI 每个修改命令分别加载、保存，不是跨命令事务。
3. 保存后重新读取，核验请求结果以及无关内容。向用户报告实际修改的 ID 和范围；未验证的宿主交互要单独说明。

### 文档与 API 边界

- 修改用户维护的 `.canvas`（包括样例）必须调用 `paperstream.CanvasGraph` 或 `python3 -m paperstream`。可用 `set_document` 处理标准布局和未知字段，但必须先加载原文档并保留未请求修改的数据。不能直接文本替换或手写文件绕过 API。
- 新图优先 `.canvas`；通过 `export_canvas` 或 `export-canvas` 单向转换旧 `.mmd`，不自动双向同步或删除旧档案。
- `.canvas` 论文数据只保存于标准 text 卡片的 fenced JSON，`paperstream: 1` 表示模板版本；边的 `label` 表示 relation。保留无关节点、未知字段、坐标、尺寸及数组顺序。不要把 React Flow 的 `toObject()` 结果当作 JSON Canvas 保存。
- 修改用户维护的 `.mmd`（包括 `examples/` 中的样例）必须调用 `paperstream.Graph` 或 `python3 -m paperstream`。
- 不使用 `apply_patch`、文本替换、重定向或直接文件写入绕过 API 编辑这些图。新建 Canvas 使用 `CanvasGraph.create` 或 CLI 的 `init`；新建 Mermaid 使用 `Graph.create` 或 CLI 的 `init`。
- 先读取图，通过稳定 ID 操作 `name`、`alias`、`takeaway`、`url`、`year`、`relation`，保持未请求修改的内容。`name` 是论文完整原始标题，`url` 是原文页面，`year` 是对应版本年份；缺失时保留为空，不猜测或编造。正式发表年份与预印本首次公开年份不得混淆。
- API 报告不支持的语法时，保留原文件并报告原因。确有需要时，先完善 API 和对应测试，再通过 API 修改。
- 冲突后保留本次编辑意图，重新读取最新内容并核对差异，只重新应用仍然合适的修改，不以原来的快照强制覆盖。不自动删除其他写入者的锁。
- UI 中尚未保存的编辑不在磁盘 API 的视野中。不要用外部 API 假装接管这份草稿；先在当前宿主保存或导出草稿，并明确选择要操作的版本。未经用户授权不通过重载丢弃草稿。宿主提供的资源工具按其 revision / ETag 保存，不绕过宿主写一个同名本地文件。
- CLI 成功在 stdout 输出 JSON，错误在 stderr 输出 `{"ok": false, "error": "...", "message": "..."}`；业务/读写错误退出码 1，用法错误 2。读取退出码和结构化错误，不把空输出当作成功；`--help` 是人工说明。不要把用户文本或路径当 shell 代码拼接。
- 删除关联节点默认保留约束；只有用户授权删除相连关系时才使用 `cascade=True` 或 `--cascade`。
- 人工仍可直接编辑文件。这些规则不是操作系统级权限隔离。

测试可以在临时目录写入故意无效的 `.mmd` 作为输入，但不得把测试例外用于修改用户文档。

## 开发本仓库：实现、验证与记录

- 保持 Python 运行时无第三方依赖，除非任务有明确需要。
- 文档与重要机制更新到现有 `docs/mechanisms/paperstream-design.md`，相关内容尽量合并维护。
- 修改读写行为后运行 `python3 -m unittest discover -s tests -v`，重点检查未改内容与保存失败时的文件完整性。
- Canvas 前端数据检查：`node --experimental-strip-types web/src/canvas.test.ts` 与 `node --experimental-strip-types web/src/files.test.ts`；DSH 注册检查：`node dsh/test/register.test.mjs`。这些均不能替代依赖完整时的 `npm --prefix web run build` 和实际浏览器/DSH 联调。
- 终端回复含数学记号时遵循用户的 math-unicode 约定；变量与工具名称保持朴实明确。

## Git 提交

- 勤快地 commit：完成一个独立、可验证的小功能或修复后就及时提交，不把多个已完成的功能长期堆在工作区。功能、修复和仓库整理尽量分别提交。
- 提交前检查 `git diff` 和 `git status`，运行与本次修改相关的测试或构建。界面变更还应在实际 DSH 中验证；尚未验证的范围要如实记录，不能把一次构建成功当作全部功能通过。
- 使用说明具体结果的提交消息，按明确文件列表暂存；不要顺带提交无关改动。不得覆盖、回退或混入用户尚未完成的工作。
- 保持 `.gitignore` 简洁，依赖、构建产物、本机 DSH 数据、临时测试文件和凭据不进入版本库；依赖锁文件应提交。
- 默认只在本地提交。推送、合并和发布按用户授权范围执行，不因要求勤快提交而自动推送。
