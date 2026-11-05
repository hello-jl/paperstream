# paperstream agent 约定

本项目以独立 JSON Canvas 文档为新主格式，React Flow 提供可视编辑，Python 标准库 API 提供自动化。保留旧 Mermaid API 与档案。用户要求自动化操作统一经过 API。

## 图文档编辑

- 修改用户维护的 `.canvas`（包括样例）必须调用 `paperstream.CanvasGraph` 或 `python3 -m paperstream`。可用 `set_document` 处理标准布局和未知字段，但必须先加载原文档并保留未请求修改的数据。不能直接文本替换或手写文件绕过 API。
- 新图优先 `.canvas`；通过 `export_canvas` 或 `export-canvas` 单向转换旧 `.mmd`，不自动双向同步或删除旧档案。
- `.canvas` 论文数据只保存于标准 text 卡片的 fenced JSON，`paperstream: 1` 表示模板版本；边的 `label` 表示 relation。保留无关节点、未知字段、坐标、尺寸及数组顺序。不要把 React Flow 的 `toObject()` 结果当作 JSON Canvas 保存。
- 修改用户维护的 `.mmd`（包括 `examples/` 中的样例）必须调用 `paperstream.Graph` 或 `python3 -m paperstream`。
- 不使用 `apply_patch`、文本替换、重定向或直接文件写入绕过 API 编辑这些图。新建图也使用 `Graph.create` 或 CLI 的 `init`。
- 先读取图，通过稳定 ID 操作 `name`、`alias`、`takeaway`、`url`、`year`、`relation`，保持未请求修改的内容。`name` 是论文完整原始标题，`url` 是原文页面，`year` 是对应版本年份；缺失时保留为空，不猜测或编造。正式发表年份与预印本首次公开年份不得混淆。
- API 报告不支持的语法时，保留原文件并报告原因。确有需要时，先完善 API 和对应测试，再通过 API 修改。
- 冲突后重新读取和核对内容，不以原来的快照强制覆盖。不自动删除其他写入者的锁。
- 删除关联节点默认保留约束；只有用户授权删除相连关系时才使用 `cascade=True` 或 `--cascade`。
- 人工仍可直接编辑文件。这些规则不是操作系统级权限隔离。

测试可以在临时目录写入故意无效的 `.mmd` 作为输入，但不得把测试例外用于修改用户文档。

## 实现与记录

- 保持 Python 运行时无第三方依赖，除非任务有明确需要。
- 文档与重要机制更新到现有 `docs/mechanisms/paperstream-design.md`，相关内容尽量合并维护。
- 修改读写行为后运行 `python3 -m unittest discover -s tests -v`，重点检查未改内容与保存失败时的文件完整性。
- Canvas 前端数据检查：`node --experimental-strip-types web/src/canvas.test.ts` 与 `node --experimental-strip-types web/src/files.test.ts`；DSH 注册检查：`node dsh/test/register.test.mjs`。这些均不能替代依赖完整时的 `npm --prefix web run build` 和实际浏览器/DSH 联调。
- 终端回复含数学记号时遵循用户的 math-unicode 约定；变量与工具名称保持朴实明确。
