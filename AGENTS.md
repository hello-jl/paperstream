# paperstream agent 约定

本项目用 Python 标准库 API 维护独立的 Mermaid 文档。用户要求自动化操作统一经过 API。

## 图文档编辑

- 修改用户维护的 `.mmd`（包括 `examples/` 中的样例）必须调用 `paperstream.Graph` 或 `python3 -m paperstream`。
- 不使用 `apply_patch`、文本替换、重定向或直接文件写入绕过 API 编辑这些图。新建图也使用 `Graph.create` 或 CLI 的 `init`。
- 先读取图，通过稳定 ID 操作 `name`、`alias`、`takeaway`、`relation`，保持未请求修改的内容。`name` 是论文完整原始标题，缺失时保留为空，不从简称猜测或编造。
- API 报告不支持的语法时，保留原文件并报告原因。确有需要时，先完善 API 和对应测试，再通过 API 修改。
- 冲突后重新读取和核对内容，不以原来的快照强制覆盖。不自动删除其他写入者的锁。
- 删除关联节点默认保留约束；只有用户授权删除相连关系时才使用 `cascade=True` 或 `--cascade`。
- 人工仍可直接编辑文件。这些规则不是操作系统级权限隔离。

测试可以在临时目录写入故意无效的 `.mmd` 作为输入，但不得把测试例外用于修改用户文档。

## 实现与记录

- 保持 Python 运行时无第三方依赖，除非任务有明确需要。
- 文档与重要机制更新到现有 `docs/mechanisms/paperstream-design.md`，相关内容尽量合并维护。
- 修改读写行为后运行 `python3 -m unittest discover -s tests -v`，重点检查未改内容与保存失败时的文件完整性。
- 终端回复含数学记号时遵循用户的 math-unicode 约定；变量与工具名称保持朴实明确。
