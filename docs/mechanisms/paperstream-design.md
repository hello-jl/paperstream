# paperstream 论文关系图设计

> [!NOTE]
> 本文档说明当前有效的架构边界、模块依赖、JSON Canvas 数据规范、Agent 自部署流程与验收状态。
> 2026-11-05 至 2026-11-17 期间的早期选型调研、已退居历史档案的 Mermaid 规范、历轮视觉/性能排查与完整手测记录已归档至 [历史选型、旧规范与验收档案](paperstream-history.md)。

主格式为 JSON Canvas 1.0，可视化界面基于 React Flow；文件 API、独立编辑器、浏览器本地桥、DSH 面板及标准 MCP Apps 适配器共享同一套核心模型与编辑器。此前 Mermaid 格式（`.mmd`）继续保留读取、CLI 维护与 `export-canvas` 单向转换，不再作为新图主格式。

## 模块拓扑与依赖边界

代码按"纯 Python 数据层 + Web 核心编辑器与宿主共享底座 + 薄宿主适配器"的单向星形结构组织，禁止适配器之间横向耦合：

| 层级 | 主要文件 / 目录 | 职责与依赖边界 |
| --- | --- | --- |
| Python 核心 | [`paperstream/`](../../paperstream/canvas.py)（`canvas.py`、`document.py`、`preview.py`、`mcp_bridge.py`、`__main__.py`） | 纯标准库实现，无第三方依赖；负责 `.canvas` / `.mmd` 校验、原子写入、协作锁、`serve` 本地 HTTP 桥与 MCP Python worker。 |
| Web 核心底座 | [`web/src/`](../../web/src/Editor.tsx)（`Editor.tsx`、`canvas.ts`、`connection-path.ts`、`card-layout.ts`、`resource-session.ts`、`local-bridge/`） | React Flow 画布、`Canvas` 序列化与几何计算、跨宿主 `ResourceSession` 状态机及本地 HTTP 桥前端入口。 |
| 单文件构建辅助 | [`bundle-single-html.mjs`](../../web/scripts/bundle-single-html.mjs)、[`distribution-notices.mjs`](../../web/scripts/distribution-notices.mjs) | 统一各端 esbuild 内联单文件 HTML 打包与第三方许可复制逻辑。 |
| 通用 `serve` 资产 | [`build-serve.mjs`](../../scripts/build-serve.mjs) | 直接从 `web/src/local-bridge/app.tsx` 打包独立 `dist/serve/app.html`，不再经过 `claude/`。 |
| 薄宿主适配器 | [`dsh/`](../../dsh/README.md)、[`codex/`](../../codex/README.md)、[`mcp/`](../../mcp/README.md)、`claude/` | 仅保留宿主生命周期、面板注册、MCP stdio 传输、Skills 与包清单；所有 UI 与资源会话统一单向复用 `web/`。 |
| 部署与发布流水线 | [`pyproject.toml`](../../pyproject.toml)、[`setup.py`](../../scripts/setup.py)、[`DEPLOY.md`](../../DEPLOY.md)、`.github/workflows/` | 提供零第三方依赖的 Python CLI 入口、5 步 Agent 自部署协议，以及 `ci.yml` / `pages.yml` / `release.yml` 自动化流程。 |

## JSON Canvas 1.0 格式与扩展约定

主格式遵循 [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/)，确保其他兼容工具仍可读出原始文本与拓扑，而 Paperstream 仅在标准字段与隔离扩展键上叠加论文工作台能力：

- **论文卡片（标准 `type: "text"` 节点）**：`text` 字段为 Markdown `json` 代码块，保存唯一业务数据：
  `{ "paperstream": 1, "name": null, "alias": "简称", "takeaway": "核心认识", "url": null, "year": null }`。
  其中 `"paperstream": 1` 标识模板第一版；`alias`、`takeaway` 允许为空字符串，`name`、`url`、`year` 清空时保持 `null`。
- **关系连线（标准边）**：`label` 直接保存关系说明（允许为空字符串 `""`）；`fromEnd` / `toEnd` 映射 `forward`、`reverse`、`both`、`none` 四种方向，默认起点无箭头、终点有箭头，切换时显式设置两端而不生成伪反向边。
- **扩展字段与保护边界**：
  - `paperstreamCard`：存放共享关系标签 `kind: "relation"`、内嵌图片数组 `figures`（稳定 ID、data URL、caption、widthPercent、像素尺寸及可选 `frame` 裁切/填充取景与 `align`），以及兼容保留的 `kind: "page"`。
  - `paperstreamStyle`：节点与边外观设置（`strokeWidth` 范围 `0.5–8` px，节点默认 `1` px、关系默认 `1.8` px；卡片 `heightMode`: `"auto" | "manual"`；自动布局来源 `routeSource: "elk"`；手工标签坐标 `labelPosition` 与有序折点 `waypoints`）。
  - `paperstreamRelation`：人工关系类型 `type` 与多行依据 `evidence`（与人工权重、视觉线宽独立维护；仅显式点击“按权重映射线宽”时按 `0.8 + 0.6 × 权重` px 执行一次设置）。
- **无损与防覆盖不变式**：
  - 禁止将 React Flow `toObject()` 直接作为 `.canvas` 保存；所有编辑经纯格式层写回并保留未知字段、数组顺序与原生节点（Note / File / Link / Group）。
  - Python 与前端均拒绝重复 JSON 键、悬空边及无效几何；节点坐标与尺寸限定在 JavaScript 安全整数内且尺寸为正，前端额外拒绝会丢失精度的大整数。
  - 磁盘保存使用文件快照校验、协作锁与同目录原子替换；浏览器使用 File System Access API 写入流并在打开/提交前核对快照（或降级为下载副本）。遇到外部修改一律拒绝覆盖并保留本地草稿供对比。

## 核心编辑器、布局与导出

- **工作台与原位编辑**：点击详情图标或右键打开非模态详情浮层；双击卡片标题/正文或关系文字进入原位即时编辑（含输入法组合期保护），`1100 ms` 内同对象同字段的连续有效输入合并为一次撤销。画布滚轮始终围绕指针位置缩放，不再随选中状态改变线宽。
- **卡片自动尺寸与局部视图**：带 `paperstreamCard` 扩展的新卡片默认 `heightMode: "auto"`，由 `ResizeObserver` 按自然内容高度更新（含 `year` 底部 42 px 预留区），手动调整后切为 `manual` 保持宽度与留白。“只看附近”仅作视图过滤，保存始终针对完整文档。
- **智能竖排与共享标签**：按需加载 `elkjs`（ELK Layered）联合计算节点位置、正交折点与在线标签；手动拖放文字或控制柄后移除 `routeSource: "elk"`，保留人工路径。共享关系标签（`kind: "relation"`）跟随不同邻接节点绝对质心均值移动，避免连续位移累计误差。
- **图片预算与导出边界**：新增或粘贴仅接受 PNG / JPEG / WebP，单图上限 **8 MB**、解码前格式头限制 **3200 万像素**且单边不超过 **16384 px**；图注默认为空且隐藏纯文件名历史图注；卡片内宽度支持 `15%–100%`。导出支持全图 **SVG** 与 **PNG**，包含视口外卡片、手工路径及内嵌图片并按实际边框延伸保护，PNG 分配超限时提示改用 SVG；PPTX 导出与演示分页功能已移除，旧文档中的 `paperstreamPresentation` 等扩展原样保留。
- **恢复与宿主偏好**：多页签与草稿按单调时间戳持久化至 IndexedDB（含 localStorage 回退与损坏快照隔离），恢复时先核对文件关联代次与保存基线；全局主题（`sage` / `paper` / `night`）与线形（直角 / 圆角 / 曲线）不写入单张画布，DSH 通过受 `connection.requestRejection` 保护的 `GET/PUT /paperstream/preferences` 读写 `~/.dsh/paperstream/preferences.json`，本机原文链接通过严格限制回环地址与 HTTP(S) 的 `POST /paperstream/open-url` 打开。

## Agent 交互协议与宿主边界

自动化改图强制通过程序接口核对，详见 [AGENTS.md](../../AGENTS.md) 与 [交互审查](../research/agent-interaction-audit.md)：

- **Python CLI / API**：适用于本机仓库或 Agent 环境（`python3 -m paperstream`、`paperstream.CanvasGraph`），基于读取内容与保存前 revision / 锁保护做定点更新；旧 `.mmd` 仅由 `export-canvas` 单向迁移至 `.canvas`。
- **标准 MCP Apps（`mcp/`）**：通过 stdio 运行，向模型暴露 `paperstream_list_canvases`、`paperstream_open_canvas`、`paperstream_read_graph`、`paperstream_apply_changes`，以七种定点语义事务修改节点与边并省略图片源；`paperstream_read_canvas` / `paperstream_write_canvas` 仅向内嵌界面 `ui://paperstream/standard-canvas-v1` 开放。所有磁盘读写交由 Python 标准库 worker 按 `expectedRevision` 原子完成。
- **通用本地桥与宿主适配器**：`paperstream serve` 绑定回环端口并使用 `dist/serve/app.html`（由 `web/src/local-bridge/app.tsx` 编译）配合 `ResourceSession` 处理 ETag / SHA-256 revision 冲突；`dsh/`、`codex/` 与 `claude/` 各自仅封装对应宿主桥接，不在编辑器内静默覆写磁盘。

## Agent 自部署与免编译分发（2026-11-20）

为让用户把仓库交给本地 Agent 即可完成安装与配置，同时不依赖 npm 公共包发布，提供四层基础设施：

1. **标准 Python 包元数据（`pyproject.toml`）**：零第三方依赖声明 `paperstream` CLI 入口，支持 `uv tool install`、`pip install -e .` 或便携本地 shim。
2. **解耦 `serve` 单文件编辑器资源（`scripts/build-serve.mjs` 与 `resolve_preview_app`）**：`scripts/build-serve.mjs` 直接从 `web/src/local-bridge/app.tsx` 构建通用 `dist/serve/app.html`；Python 启动器按 `PAPERSTREAM_APP_PATH` → `dist/serve/app.html` → `claude/dist/app.html` → 用户数据目录（`PAPERSTREAM_DATA_DIR` / `XDG_DATA_HOME/paperstream` / `~/.local/share/paperstream`）依次解析，保留精确错误信息。
3. **零依赖部署编排与协议（`scripts/setup.py` + `DEPLOY.md`）**：提供只读 `doctor`、按顺序安装锁文件依赖并构建的 `build`、默认 dry-run / `--apply` 备份原配置原子安装的 `install`（支持 `cli` / `serve` / `skill` / `mcp` / `claude` / `codex` / `dsh`），以及全在临时目录隔离执行的 `verify` 冒烟检查。
4. **GitHub Actions 自动化与相对路径静态页（`.github/workflows/` 与 `web/vite.config.ts`）**：`web/vite.config.ts` 使用 `base: './'` 支持子路径静态托管；`ci.yml` 运行全量 Python/JS 检查与五端构建；`pages.yml` 部署纯前端工作台；`release.yml` 在 `v*` tag 时产出全端免编译归档与 `SHA256SUMS.txt` 供无 Node.js 22.18+ 环境直接使用。

## 开源前验收（2026-11-13）

> [!IMPORTANT]
> 本表摘要 2026-11-13 开源前基线验证范围与未覆盖边界；后续各轮（包括 2026-11-14 图片取景与历史海报、2026-11-17 历史图原理插画与标准 MCP Apps 验收）的详细数据、逐轮测试计数与实测截图口径请见 [paperstream-history.md#开源前验收2026-11-13](paperstream-history.md#开源前验收2026-11-13)。

| 范围 | 基线实测结论 | 明确边界（不外推） |
| --- | --- | --- |
| Codex 原生文件面板 | 独立 `.canvas` 副本上验证实时改名、撤销/重做、宿主保存、外改自动刷新及两次连续冲突不覆写磁盘，`1e-7` 等未知字段保留。 | 仅限特定 Codex 会话面板链路，不自动覆盖全部平台、Chat/Work 入口或后续桌面端版本。 |
| DSH Web | 独立第三页签验证逐字输入、箭头与独立线宽、剪贴板加图（34% 拖宽）、共享关系标签、智能竖排、主题切换、局部搜索定位及热卸载后 IndexedDB 恢复。 | ResizeObserver 原生告警保留诊断；不将局部交互等同于超大图压力测试或 DSH Desktop 全量覆盖。 |
| 普通浏览器本地桥 | 使用 `CanvasGraph` 副本实测智能竖排、外改拒绝覆写、两次冲突磁盘保护并导出 `docs/assets/paperstream.jpg`。 | 无跨浏览器长期文件句柄恢复保证，远程浏览器需手动重新授权或下载保存。 |
| Claude Code & MCP | Claude CLI 清单与隔离包运行、HTTP 409 冲突通过；MCP 另经本地参考 `AppBridge` 验证 stdio 工具、事务保存与草稿保护。 | 无真实 Claude 商业账号，Claude Desktop 内嵌显示、真实会话发现及云端 claude.ai 仍未真机实测。 |
| 许可与构建分发 | 核对实际 bundle 输入与完整上游 LICENSE 文本（2026-11-13 基线 26 项、2026-11-17 MCP 扩展至 32 项），各端产物与分发包字节核验通过。 | 构建和静态打包通过不等于所有宿主真机交互已测。 |

更多早期设计缘起、竞品对比分析与逐轮变更档案请查阅 [历史选型、旧规范与验收档案](paperstream-history.md)；深度文案与样例来源见 [需求分析与研究样例](../research/feature-analysis.md)。
