# paperstream 论文关系图设计

更新日期：2026-11-06。用户现已批准采用 JSON Canvas 主格式与 React Flow 界面。文件 API、独立界面源码及 DSH 面板接入源码已实现；前端依赖安装受限，完整构建与浏览器/DSH 真机联调仍待验证。此前 Mermaid 记录保留为选型与兼容机制档案，不代表当前主方案。

## 当前实现：Canvas、独立界面与 DSH 面板

用户确认：复用 DSH 已有 React，以 React Flow 提供拖动、缩放和连线；卡片显示 alias 和简短 takeaway，完整原题 name、url、year 在详情面板编辑；边显示 relation；支持只看选中卡片附近的关系；原文点击打开，不为每张卡片嵌入 PDF 或加载网页。不依赖 Obsidian，保留文件独立与 agent 通过 API 操作的要求。

实现分为三部分，均可单独检查：[Python Canvas API](../../paperstream/canvas.py)、[React 编辑器](../../web/src/Editor.tsx)、[DSH 接入](../../dsh/README.md)。React Flow 负责通用交互；项目只做论文字段、公开 Canvas 格式的转换和文件保存。DSH 面板与独立编辑器复用同一个组件，不另起一套桌面运行时。DSH 当前目标为核验源码的 0.2.2-rc.1；不将源码匹配等同于安装版本兼容实测。

数据以一份 `.canvas` 为主。每个论文为标准 `type: "text"` 节点，text 是 Markdown 的 json 代码块，内容为 `{ "paperstream": 1, "name": null, "alias": "简称", "takeaway": "核心认识", "url": null, "year": null }`。其中 paperstream 的数值 1 表示本项目论文模板第一版；六个业务字段只保存一份，关键资料不依赖 JSON Canvas 未定义的私有节点字段。其他编辑器会显示这段代码块，不会自动提供本项目的紧凑论文卡片。边的 `label` 直接表示 relation，坐标与尺寸使用标准属性。依据：[JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/)。

Python `CanvasGraph` 提供 create/load、论文与关系增删改、move_node/resize_node、clear_node_fields、to_dict/to_json/set_document 及 save。标准库运行，无需 React 或浏览器。CLI 按 `.canvas` 后缀选择新 API；`export-canvas` 单向转换旧 `.mmd` 为新文件，保留 ID 与原档案，目标存在时拒绝覆盖。[ResNet Canvas 样例](../../examples/resnet.canvas) 已由 API 从真实论文旧样例转换，初始坐标也通过 API 修改。新 Canvas 自动 ID 使用随机 UUID 的 32 位十六进制表示，不按增删重排；旧编号不改变。

前端新增与修改通过纯函数格式层，不能直接保存 React Flow 的内部快照。论文详情应用到文档后再保存文件；拖动和缩放只改位置尺寸；提供撤销/重做及删除连线确认。只看附近通过显示过滤实现，保存始终使用完整文档，避免隐藏节点被当作删除。普通备注、文件卡、链接及分组不会被清除；此版本只做基本展示，文件卡显示路径，分组框移动不自动带动框内卡片，不宣称完整复刻 Obsidian 的笔记/附件体验。

读写保留未知顶层、节点、边与论文代码块字段以及节点顺序；JSON 缩进可能重排。Python 不修改数据的保存保留原字节。两端均拒绝重复 JSON 键、悬空边及无效字段；浏览器额外拒绝无法无损处理的数字，避免 JavaScript 精度导致未知字段悄悄改变。Python 可精确保留未知字段的大整数，但浏览器会拒绝超出安全整数范围的值。坐标与尺寸两端均限制为 JavaScript 安全整数，尺寸为正。

保存保护分两种。Python 使用文件快照、协作锁及同目录临时文件原子提交。浏览器对选定文件使用 File System Access API，打开写入流前后及提交前核对快照；不支持文件句柄的浏览器通过下载副本保存。浏览器和 Python 没有共享锁，最终核对与提交间仍可能出现外部写入；该方案不承诺无冲突实时协作。遇到外部修改拒绝覆盖，先保留当前副本，再重新读取核对。[浏览器写入流说明](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable)

DSH 主面板通过 main 与 sidebar.panellist 槽位注册，构建时将 React 相关共享模块排除出插件包。组件可能在切换面板时卸载，因此用 sessionStorage 保存当前标签页临时草稿和未应用表单；草稿不恢复文件写入句柄，也不替代正式文件。浏览器选择器访问浏览器机器的文件，当前没有 Host 文件 RPC、模型工具注册或后台 HTTP 服务，远程工作区文件不会自动出现。自动化继续使用 Python API/CLI。

验证状态：Python 全量 73 项测试通过；前端格式层 24 项测试、文件保存逻辑 5 项测试及 DSH 槽位生命周期 5 项测试通过。格式层与文件保存模块通过 TypeScript 严格检查，编辑器通过 esbuild 语法转译（第三方包保留为 external，不代表完整构建）；Python 与 TypeScript 的文件往返已检查。npm 下载被环境网络限制，React Flow 依赖未安装，因此完整 UI 类型检查、生产 bundle、实际浏览器操作、性能测量与 DSH Web/Desktop 联调均未完成。测试是相应层面的证据，不能代替缺失的集成验证。

## 已确认需求与选型（此前 Mermaid 阶段）

用户明确选择 Mermaid，主要考虑纯文本、易修改和轻量维护。以独立的 `.mmd` 文件保存关系图，文件由用户自主保管；文本编辑器、DSH、模型 API 配合的脚本均可维护同一份文档。

用户进一步要求 agent 统一通过 API 编辑图。当前选择 Python 标准库实现，避免引入额外运行依赖；人工仍可直接编辑原生文本。[使用说明](../../README.md)、[agent 规则](../../AGENTS.md)。

节点包含 `name`、`alias`、`takeaway`、`url`、`year`，边包含 `relation`。用户明确 `name` 表示论文完整原始标题；`alias` 为自定义简称，并同意增加原文链接与年份。图允许分支、汇合和交叉关联。优先采用 Mermaid 原生语法。

参考视频：https://www.bilibili.com/video/BV1nA41157y4/ 。已查看用户截图中的方法演进图；视频页面返回 HTTP 412，未观看视频，不将截图理解表述成视频全文结论。

## 最小文档约定（旧 Mermaid 格式）

[paperstream.mmd](../../examples/paperstream.mmd) 是当前样例。内容为虚构方法与关系，四个节点、四条边，展示分支和汇合。

| 内容 | 保存位置与含义 |
| --- | --- |
| 节点 ID | Mermaid 节点标识符，保持稳定 |
| name | 完整原始标题，独立存于关联节点 ID 的 `%% paperstream: name` 注释中；可暂缺，不从简称推断 |
| url | 对应论文版本的原始页面，存于 `%% paperstream: url` 注释；可暂缺 |
| year | 对应论文版本的年份，存于 `%% paperstream: year` 注释；可暂缺 |
| alias | 节点 Markdown 标签的第一行；样例以粗体显示，粗体标记不属于字段值 |
| takeaway | 同一标签第一行之后的全部文本，可多行且非空 |
| 边 ID | Mermaid 原生边标识符，保持稳定 |
| relation | 边的文字标签，非空单行自由文本，不强制分类 |

命名规则：`paper_` 后加固定编号标识节点，例如 `paper_001`；`relation_` 后加固定编号标识边，例如 `relation_001`。新增时使用未用编号，增删不重排，删除后不复用，修改 alias 不修改 ID。

这些字段是 paperstream 的解释约定，不是 Mermaid 内置的任意属性系统。每个字段只保存一次：简称、要点与关系保存在标签，原题、链接、年份保存在同一 `.mmd` 的注释。修改元数据不改变简称、节点 ID 或连线；相同原题也不意味着两个节点必须合并。

标题注释形式为 `%% paperstream: name paper_001 "完整原始标题"`，通常放在节点声明前，归属以节点 ID 为准。引号内遵循标准 JSON 字符串规则，保留原语言、大小写、标点及 Unicode；双引号与反斜杠按 JSON 转义。API 插入缺失标题记录，或只替换已有记录的字符串区间。重复标题记录、悬空引用和非法 JSON 报错；删除节点时删除它的标题记录。

链接使用同样的 JSON 字符串形式，例如 `%% paperstream: url paper_001 "https://example.org/paper"`；年份使用 JSON 整数，例如 `%% paperstream: year paper_001 2020`。同一节点每个字段最多一条记录，各字段可独立添加和修改；不存在的节点或边 ID 不能挂节点元数据。缺失字段保持未知，不写 `null` 注释、不自动猜测。

`url` 接受带主机名的绝对 HTTP(S) 链接，禁止空白、控制字符、反斜杠及非法端口；基本语法校验不等于联网验证页面存在或验证论文身份。`year` 只接受 1 到 9999 的整数，排除布尔值、浮点数和字符串，不根据当前年份限制取值。年份跟随所记录版本：正式会议/期刊页用发表年，预印本页可用首次公开年；图内尽量保持同一口径。

这些元数据不放入图面标签，以免长标题等挤占关系图空间。这是当前显示选择；Mermaid 本身不会将注释解析为标题、可点击链接或悬浮提示。`.mmd` 保留完整信息，导出的图片不会自动包含这些字段。元数据暂缺时读取为 Python `None` / JSON `null`，保持旧文件兼容；调用修改方法传 `None` 表示不修改。目前没有单独清除元数据字段的 API。

官方依据：[Mermaid 注释](https://mermaid.js.org/syntax/flowchart.html#comments) 采用独立行的 `%%`，渲染时忽略其内容。名称记录是项目格式约定，普通文本编辑器仍可阅读和修改。

有一个实际语法边界：Mermaid 的[预处理源码](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/preprocess.ts) 先处理配置指令，后清除普通注释；[指令正则](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/diagram-api/regexes.ts) 可识别注释内部的 `%%{…}%%`。因此 API 在 JSON 编码后将百分号写为 `\u0025`，并拒绝手写元数据 JSON 源码中的原始 `%%{`。解码后仍保留原始百分号，包括 URL 的 `%20` 等编码，不做 URL 解码或规范化。已有特殊标题与链接的往返测试；这不等于完整 Mermaid 渲染验证。

使用 `flowchart TD` 表示从上到下的关系图；TD 是 top-down 的缩写。需要横向显示时可换为 `LR`，即 left-to-right。多行标签采用 Mermaid Markdown Strings，边使用带 ID 的原生连线。

官方依据：[节点、Markdown 标签和边 ID](https://mermaid.js.org/syntax/flowchart.html)。样例需要预览器支持 Markdown Strings 和边 ID；目前没有运行 Mermaid 解析器或预览器，不宣称已验证最低兼容版本。不能将官方文档的“边曲线设置 v11.10.0+”直接当作边 ID 首次支持版本。

## 关系与布局

- 当前样例的箭头从前序工作指向后续工作，relation 写后续工作引入的变化。
- 引用关系可能采用相反语义，即引用者指向被引用者；每份图应说明方向含义。
- 同一对论文可以有多条不同关系，用不同边 ID 区分。
- 不把图限制为每个节点只有一个父节点的树。
- takeaway 表达用户自己的核心认识，relation 表达用户对两篇论文联系的理解；来源与证据可在后续补充。
- Mermaid 负责自动布局。方向、分组、样式可以写进源码；不承诺保存画布上的任意手工拖拽坐标。
- 自动布局和显示换行可以随预览器版本改变。字段拆分依据源文本中的首个换行，不依据渲染后的视觉换行。

## 维护方式

1. 人工编辑：直接修改节点标签和边标签，保存 `.mmd` 后预览。
2. DSH：调用 `paperstream.Graph` 或 `python3 -m paperstream`，按稳定 ID 修改节点或边。
3. 模型 API：模型提出字段操作，由独立脚本调用同一 Python API 应用到文档。
4. 文档展示：可嵌入 Markdown 的 mermaid 代码块；图片和嵌入副本属于派生展示，主文件仍为 `.mmd`。

## 已实现的读写机制

- `Graph.load` 读取 UTF-8 文档和磁盘快照，解析节点与边，并记录每个字段在源码中的区间。`Graph.create` 创建内存图；目标存在时拒绝覆盖。
- `add_node`、`update_node`、`remove_node` 维护论文；`add_edge`、`update_edge`、`remove_edge` 维护关系。查询返回不可变数据对象，固定 ID 与显示名称分离。
- 所有操作先在内存构造候选文本，通过约定校验后才替换当前内存状态。字段更新只替换对应源码区间，保留未改字段、注释、其他声明和原有换行。一次补多个元数据字段时合并为节点前的一次插入，避免相同位置的修改相互错位。
- name、url、year 使用同一元数据解析与区间记录机制，但分别检查类型和含义。name 与 url 使用 JSON 字符串，year 使用整数。alias 与 relation 限定非空单行，takeaway 可多行；标签中的引号、反引号、Markdown 特殊字符、百分号及实体起始字符使用 Mermaid 十进制实体编码，读取时只解码一轮，避免字面量 `#quot;` 被二次解释。
- 删除节点若仍有关系会拒绝；显式 `cascade=True` 才连同关系一起删除。删除后的 `%% paperstream: retired ID` 注释保存编号历史，防止重载后复用。
- `save` 校验文档并获取同目录排他锁，核对磁盘快照，将候选内容写到临时文件，再核对一次。更新用原子替换；新建用不会覆盖已有目标的硬链接提交。失败时保留旧文件，正常完成后清理临时文件与锁。
- API 写入者共享锁；对不遵守该锁的手工编辑器，快照检查只能尽力检测，最终检查与替换之间仍有竞态。当前不提供实时多人协作。
- `with Graph.load(...)` 或 `with Graph.create(...)` 正常退出时保存；代码块抛出异常时不保存。CLI 成功与错误输出 JSON，便于 agent 处理。

该解析器支持约定的 flowchart、注释、Markdown 多行节点和带 ID 的箭头连线，暂不支持 YAML 前置配置、样式、分组、配置指令或任意 Mermaid 语法。遇到这些内容会明确报错，保留源文件；后续扩展需增加对应解析与测试。

自动化图编辑规则写入 AGENTS.md。这是 agent 工作约定；真正阻止有文件写权限的程序绕过 API，需要宿主权限约束，当前项目不声称已经实现该隔离。

实现使用 Python 3.10+ 标准库，没有第三方运行依赖。当前 55 项测试通过，覆盖增删改查、标题/链接/年份独立维护、旧格式兼容、元数据有效性、多字段插入、字段级文本保留、CRLF、多行与特殊字符、ID 不复用、非法操作不改变图、外部冲突、协作锁及写入失败保护。真实示例另已通过 API 创建与回读校验。当前环境没有 Mermaid 包，npm 网络访问被限制，尚未完成 Mermaid 原生解析或渲染验证；`validate` 是项目文档约定的校验。

## 真实论文示例与来源

[examples/resnet.mmd](../../examples/resnet.mmd) 包含三个节点、两条边。原始标题、正式会议发表年份和原文链接依据 CVF 官方会议页核对，年份口径统一为会议发表年，不使用 arXiv 初投年份。

| alias | 完整原题 | year 与官方来源 |
| --- | --- | --- |
| ResNet | Deep Residual Learning for Image Recognition | [2016，CVPR](https://openaccess.thecvf.com/content_cvpr_2016/html/He_Deep_Residual_Learning_CVPR_2016_paper.html) |
| DenseNet | Densely Connected Convolutional Networks | [2017，CVPR](https://openaccess.thecvf.com/content_cvpr_2017/html/Huang_Densely_Connected_Convolutional_CVPR_2017_paper.html) |
| ResNeXt | Aggregated Residual Transformations for Deep Neural Networks | [2017，CVPR](https://openaccess.thecvf.com/content_cvpr_2017/html/Xie_Aggregated_Residual_Transformations_CVPR_2017_paper.html) |

takeaway 和 relation 为基于原文整理的中文理解。ResNet 要点为残差学习与捷径连接有助于优化深层网络；DenseNet 要点为密集块内拼接已有特征；ResNeXt 要点为聚合相同结构分支，将分支数量作为设计维度。DenseNet 的[原文](https://openaccess.thecvf.com/content_cvpr_2017/papers/Huang_Densely_Connected_Convolutional_CVPR_2017_paper.pdf) 对比了拼接和残差相加，ResNeXt 的[原文](https://openaccess.thecvf.com/content_cvpr_2017/papers/Xie_Aggregated_Residual_Transformations_CVPR_2017_paper.pdf) 图 1 比较了两种残差块。因此两条边写为“连接方式对比”和“残差块扩展”，表示方法比较与演进理解，不表示引用关系或全部思想的直接继承。

联网核对时部分官方页面直接访问返回 403，使用搜索中该官方页面的摘要、BibTeX 及官方 PDF 索引完成核对；未采用第三方转述。原有虚构分支汇合样例继续保留，不给虚构论文补造真实链接。

## 同类产品调研与功能建议

调研日期：2026-11-05。依据官方产品页、帮助文档和官方文档仓库，未注册或安装产品实测。以下功能建议尚未实现，也不表示已决定全部加入。未从官方资料核实的能力记为未知，不据此断言产品不支持；未对价格、资源占用或推荐质量进行比较。

### 产品解决的问题

| 产品 | 已核实的主要能力 | 对 paperstream 的启发 |
| --- | --- | --- |
| Connected Papers | 从起始论文构建相似性图；共同引用与共同被引是计算依据，即使互不引用也可能相近。另有前期/后续工作视图、多起点与收藏。[算法](https://www.connectedpapers.com/about)、[功能列表](https://www.connectedpapers.com/pricing) | 以一篇论文为起点寻找阅读候选。相似性不能直接当作“改进了某个方法”的依据。 |
| ResearchRabbit | 沿参考文献与被引文献扩展，图中连线表示引用；收藏、阅读清单、笔记与搜索过程保存；RR+ 提供新论文提醒。[当前指南](https://learn.researchrabbit.ai/en/articles/12439939-how-to-get-started-with-researchrabbit) | 候选论文与已经整理过的论文分开，保留发现过程；先收集再完善 takeaway 与 relation。 |
| Litmaps | 引用图、时间布局，以及内容相似性/共同引用等布局；可拖动已保存节点、加标注、编辑论文及引用关系，并监控新文献。[地图与标注](https://docs.litmaps.com/en/articles/9181490-use-and-edit-litmaps-visualization)、[编辑关系](https://docs.litmaps.com/en/articles/9421889-edit-articles-and-manage-paper-versions-in-litmaps)、[Monitor](https://docs.litmaps.com/en/articles/9126249-monitor-get-alerts-for-important-research) | 按年份和主题观察同一批论文。它确实支持人工维护，不能概括为只能自动绘图；逐边自由语义标签本轮未核实。 |
| Inciteful | 从种子论文建立引用邻域，推荐相关或网络中重要的论文；两篇论文间找引用路径，按年份、关键词、距离筛选。[官方入门](https://github.com/inciteful-xyz/inciteful-academic-docs/blob/master/quick-start.md)、[进阶功能](https://github.com/inciteful-xyz/inciteful-academic-docs/blob/master/power-users.md) | 从现有图中提取某个节点附近的关系，或查询两节点之间的路径。路径只表示图中可达，不自动证明思想继承。 |
| Zotero | 按 DOI/arXiv 等标识符录入，管理标签与笔记，发现和合并疑似重复条目；Related Items 可人工关联条目。[录入](https://www.zotero.org/support/adding_items_to_zotero#add_item_by_identifier)、[去重](https://www.zotero.org/support/duplicate_detection)、[关系](https://www.zotero.org/support/related) | 保存论文外部标识，减少重复录入；关联已有笔记与文献库。Related Items 的关联是对称的，不能直接等同于我们的有向自由文字关系。 |
| Obsidian | Graph 显示笔记内部链接，支持过滤与局部图；Canvas 可放笔记、文字和 PDF，连接可带标签、颜色、方向。[Graph](https://obsidian.md/help/plugins/graph)、[Canvas](https://obsidian.md/help/plugins/canvas) | 局部浏览、主题视图与长笔记链接。Canvas 已能手工表达语义关系；不要把它与自动笔记链接图混为一谈。 |
| Heptabase | 可复用卡片、白板分区、PDF 高亮进入白板；已有官方 CLI 与 MCP，能编辑内容、组织白板及带标签的连接。[界面与阅读](https://wiki.heptabase.com/user-interface-logic)、[CLI](https://support.heptabase.com/en/articles/14715462-heptabase-cli)、[MCP](https://support.heptabase.com/en/articles/17060792-heptabase-mcp-tool-reference) | 一篇论文参与多个主题视图、证据与关系相邻、agent 通过明确操作维护。CLI 依赖桌面应用；部分 MCP 操作需要应用打开。 |
| Scite | 展示引用发生时的文本与位置，并将引用陈述分类为支持、对照/质疑、提及；另有文献集合与更新追踪。[功能](https://scite.ai/features)、[使用解释](https://scite.ai/blog/how-to-use-ai-for-literature-review) | 关系应能回到具体依据。分类针对引用陈述，不能直接当作整篇论文的正确性结论。 |

Inciteful 的旧入口当前跳转到 [Inciteful Academic](https://incitefulmed.com/academic/)，其官方文档仓库仍沿用 inciteful-xyz 名称。Connected Papers 的部分页面需要 JavaScript，本次亦使用搜索索引中的官方页面内容核对。

### 图中连线与数据自主性

需要分开理解三种信息：论文之间的相似性、实际发生的引用、读者整理的研究关系。paperstream 当前 `relation` 主要保存第三种；“A 与 B 很相近”“A 引用了 B”都不能单独证明“B 改进了 A 的某个机制”。自动发现结果可以作为候选，关系解释需要结合原文。

文献列表导出和完整关系图迁移也要分开：

- ResearchRabbit 官方确认可导出 BibTeX、RIS、CSV；Litmaps 也提供这些书目导出，Inciteful 支持 BibTeX。上述声明不能保证把私人笔记、逐边说明、布局完整迁移。[ResearchRabbit 导出](https://learn.researchrabbit.ai/en/articles/13192798-how-to-share-papers-and-collections)、[Litmaps 导出](https://docs.litmaps.com/en/articles/9092828-export-articles-from-litmaps)、[Inciteful 导入导出](https://github.com/inciteful-xyz/inciteful-academic-docs/blob/master/power-users.md)
- Obsidian 笔记保存在本地 Markdown，Canvas 使用开放 JSON Canvas 格式；引用笔记和附件时，需要一并携带这些文件。[本地存储](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data)、[Canvas](https://obsidian.md/help/plugins/canvas)
- Heptabase 支持 Markdown 导出，完整导出还含 `All-Data.json` 备份；官方明确区分跨应用 Markdown 导入与 Heptabase 备份恢复，并提示外部应用未必保留同样的白板关系、布局和元数据。本次未测试完整往返迁移。[导出与备份](https://support.heptabase.com/en/articles/10364279-business-sustainability-and-data-portability)
- Zotero 自身也明确提醒通用格式导出不等同于完整备份，部分字段或链接可能无法随再导入恢复。[导出边界](https://www.zotero.org/support/kb/exporting)

由此得到的定位判断：paperstream 继续聚焦“可独立维护的 Mermaid 论文关系文档 + 小型操作 API”。带标签的边、手工白板、agent 接口已有成熟产品实践；本项目的组合选择是直接持有图文档、人工语义关系、低运行依赖。不要以竞品没有这些基础功能作为理由。

### 建议优先级（未实现）

1. **关系依据与方向说明。** 保留自由文字 relation，优先允许边附带可选 `evidence`：来源论文、章节/页码或笔记位置，另可记录“待核对/已核对”。图级说明写明研究问题与箭头含义。自由关系分类可等需要过滤时再加，避免一开始强迫所有研究关系套固定类别。借鉴 Scite 的上下文和 Heptabase 的材料整理；自动分类只是线索。
2. **局部图、搜索和过滤。** 围绕论文查看直接邻居或再延伸一层；按年份、文字、主题筛选；必要时查询连接两篇论文的路径。先从现有图生成派生视图，保留主文件与稳定 ID；过滤隐藏不等于删除。现有 Mermaid 预览器不会因为增加字段就自动获得交互按钮，需由 API 或预览集成实现。借鉴 Obsidian、Inciteful、Litmaps。
3. **连接长笔记与阅读材料。** 图中保留短 takeaway，新增可选笔记路径指向独立 Markdown，详细推导、实验比较和批注写在笔记里。相对路径便于一起搬走。资料仍由用户保管，但“图主文件自足”与“笔记附件一同携带”要明确区分。借鉴 Obsidian、Heptabase、Zotero。
4. **论文身份、去重与导入。** 增加可选 DOI/arXiv 标识，先查重提示，再提供保持连线与笔记的合并操作；预印本与正式发表版本不要仅凭相似标题自动合并。可随后接 BibTeX/RIS 或 Zotero 导入，人工核对后补 takeaway/relation。外部标识不能取代现有固定节点 ID。借鉴 Zotero 与 Litmaps 的版本维护。
5. **候选区、阅读状态和主题标签。** 区分刚发现、待读、已整理；主题标签用于过滤，同一论文可出现于多个视图而无需复制内容。候选可以先存独立清单，避免为了入图编造尚未形成的 takeaway。借鉴 ResearchRabbit 的阅读清单、Litmaps 的候选显示，以及 Zotero 的[标签与保存搜索](https://www.zotero.org/support/collections_and_tags)。
6. **后续再接自动发现与更新监控。** 从选定论文找参考文献、被引论文和相似工作，将新结果交给候选区。这会引入外部服务、覆盖范围与同步问题，优先级低于把已收录的图维护好；可作为 DSH/其他外部工具的可选能力。

已有 API 的维护便利性也有两项明确待补：清除误填的可选字段（当前 `None` 表示不修改），以及查看待保存差异与撤销/恢复已保存修改。内存编辑后统一保存、冲突检测已经存在，不应重复描述为待实现。长笔记、证据、局部图等是本次建议，代码和图格式本轮均未修改。

第一轮若实施，建议控制在“笔记链接、关系依据、局部图”三个可独立验收的功能；身份去重在开始批量导入前补齐。这样直接服务已有论文的长期整理，无需先建设完整文献搜索平台。

## Obsidian Canvas 的公开实现机制（前期调研）

用户进一步关注 Canvas 的实现。本节保留当时的格式调研；调研时尚未修改 Mermaid 方案或实现 Canvas 适配器，当前实现见文首。

Canvas 是 Obsidian 的内置白板功能，保存为本地 `.canvas` 文件。其公开数据格式 JSON Canvas 是 JSON 纯文本；格式可由其他工具自由实现，不等同于 Obsidian 白板编辑器内部代码也已公开。[Canvas 官方说明](https://obsidian.md/help/plugins/canvas)、[JSON Canvas 项目](https://jsoncanvas.org/)

从公开格式可拆成三部分：

- 数据：顶层 `nodes` 与 `edges`；节点记录固定 ID、类型、位置 `x/y`、大小 `width/height`。边记录起点/终点 ID，可指定卡片连接侧、箭头、颜色及 `label`。节点数组顺序还表示叠放顺序。[格式规范](https://jsoncanvas.org/spec/1.0/)
- 内容：`text` 节点将 Markdown 文本嵌在画布内；`file` 节点引用独立笔记或附件，可指定标题/内容块；`link` 节点保存网页 URL；`group` 节点提供视觉分组。纯文字画布可以是一份文件，引用笔记、PDF 或背景图时需一并保存依赖文件；网页 URL 不是完整网页副本。
- 交互：编辑器读取数据，提供拖动、缩放、吸附、调整卡片大小、连线和标签编辑。把“拖动对应位置数据变化、编辑边文字对应 label 变化”作为数据模型解释是合理的，但本轮未核实其具体前端框架、渲染引擎或内部布局算法。功能名称 Canvas 不能证明使用了 HTML canvas 元素。

Canvas 和 Graph view 各有用途：前者保存用户摆放的对象和连接，后者展示笔记内部链接网络。[Graph view](https://obsidian.md/help/plugins/graph)

对 paperstream 的映射判断：边的 `label` 可直接对应 relation；节点的 name、alias、takeaway、url、year 并非 JSON Canvas 1.0 定义的原生业务属性。若以后采用“论文 Markdown 笔记 + 画布引用”，可将这些字段保存在笔记的 YAML Properties 中，Canvas 保存位置与连线，长笔记保存在正文。这只是可选设计；自定义 alias 不会因为写入字段就自动成为卡片标题，具体显示仍需通过笔记内容或适配处理。[Properties](https://obsidian.md/help/properties)

纯文本文件允许独立程序读写，因此 agent 也可以经 API 维护 JSON Canvas；当时的 paperstream API 仅支持约定的 Mermaid，不能直接拿来编辑 `.canvas`。适配时还要处理并发保存、保留人工坐标、文件引用和多画布复用。直接往 JSON 塞入自定义字段后由 Obsidian 编辑保存是否仍完整保留，需要专门验证，不能视为既定兼容保证。

与当前 Mermaid 相比，Canvas 原生保存手工布局并提供拖拽界面；当前 Mermaid 方案主要保存节点关系，由预览器自动布局。两者都可以是本地纯文本，只是面向的编辑体验不同。

## 改用 Canvas 主格式的讨论（历史，现已批准）

用户当时要求先讨论是否放弃 mmd、采用 canvas，并关注自动化 API 的难度。以下保留该阶段的判断；当前批准范围及实现状态见文首。

建议方向：考虑到用户重视手动编辑、拖动和长期整理，可将 Canvas 作为下一阶段主格式。JSON Canvas 保留本地纯文本和公开结构，同时由 Obsidian 提供可视编辑器。它对鼠标维护更方便；直接阅读源码时 Mermaid 通常更紧凑，Canvas 也需要维护坐标和尺寸，不能笼统称其在所有方面都更简单。[规范](https://jsoncanvas.org/spec/1.0/)、[编辑器能力](https://obsidian.md/help/plugins/canvas)

API 的基础读写比现有 Mermaid 解析直接，但业务字段仍需要约定：relation 可以使用标准 edge.label，name、alias、takeaway、url、year 可先保存在 text 卡片的固定 Markdown 模板中，每个值只保存一次。JSON 解析简单不等于这些业务字段已成为 Canvas 原生属性。不要以未知字段经 Obsidian 保存一定保留为基础设计唯一数据存储。

建议第一版优先考虑单个 `.canvas` 与内嵌文字卡片，适合当前关系图和简短要点的需求；若长篇笔记与同一论文跨图复用成为核心需求，再选择“每篇论文一个 `.md` + `.canvas` 引用”。后一方案可使用笔记 Properties，但需要处理引用路径、缺失/重命名、论文与画布卡片身份，以及跨文件一致性，不能直接套用单文件原子保存。文字卡片转为独立笔记是 Obsidian 已有功能，但业务字段映射仍需由项目约定。

可复用的是语义层增删改查、校验思想、连线删除约束、内存修改后保存，以及快照检查、排他锁和原子替换的单文件保存机制。需要替换 Mermaid 解析、转义和源码区间维护；现有代码不能直接通过更换扩展名使用。新增的 Canvas 维护约定应包括：

- 正文或关系修改保留位置、尺寸、颜色、分组和无关卡片；节点数组顺序关系到叠放顺序，不能随意排序。
- 新卡片提供简单默认位置；全图重新布局作为显式操作，不随内容修改自动触发。
- 读写保留完整 JSON 中未修改的数据和未知字段，不把用户手工添加的备注卡片当成无效论文清除。
- 保留冲突检测，但不宣称外部 Obsidian 编辑器遵守 API 锁，也不宣称支持无冲突实时共同编辑。

若决定迁移，建议只维护一种可编辑主格式：Canvas 为主，Mermaid 可保留为旧档案或以后按需单向导出。避免双向同步两份可编辑主文件。实施前应做一次真实往返验证：API 生成小图，Obsidian 修改文字/位置/连线，再由 API 更新并重新打开，核对字段、ID、布局与其他卡片完整性。此验证尚未执行，当前 Mermaid 示例和 API 均保留。

## 不依赖 Obsidian 的 DSH 展示与现成 API 调研

用户明确不希望依赖 Obsidian，希望在 DSH 界面显示或操作画布，并优先使用已有 API，减少自研与打磨。以下保留实施前的官方资料核验；当前实现状态见文首。环境中未确认可用的 DSH 安装；接口依据上游 master，实际使用需匹配宿主版本。

### DSH 已有的界面入口

官方 `ui-layout` 支持根级 `main` 面板与 `ctx.layout.selectPanel(id)`；内置插件管理页面实际注册 `main` 组件和 `sidebar.panellist` 入口，可以参照添加 Paperstream 面板。[布局接口](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/README.md)、[内置实现](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/src/client/index.ts)

当前上游客户端使用 React。Host 管理持久化和业务状态，Client 通过 Remote 调用访问 Host；不能在浏览器面板中直接运行现有 Python 模块。Web 和桌面传输有宿主适配，不宜把插件写死为特定 localhost 端口。[前端结构](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/README.md)、[Host/Client 边界](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.md)、[通信](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/connection/README.md)

这些证据支持 Web/桌面界面内的画布面板，不代表纯终端界面可提供相同的拖拽白板。`.canvas` 是文件格式，去掉 Obsidian 后，仍需要选择一个显示或编辑组件；前文“利用现成 Obsidian 编辑器”的成本优势需相应重新评估。

### 现成工具的能力和边界

| 工具 | 已核实能力 | 对本项目的边界 |
| --- | --- | --- |
| React Flow | 现成拖动、平移、缩放、连接、自定义节点；`getNodes`、`addNodes`、`updateNodeData`、`addEdges`、`updateEdge`、`deleteElements` 等 API；MIT 核心库不要求 Pro 订阅。[API](https://reactflow.dev/api-reference/types/react-flow-instance)、[许可与 Pro](https://reactflow.dev/pro) | 适合 DSH 的 React 面板，但它是组件库。论文卡片编辑入口、持久化及 `.canvas` 字段转换仍需完成。`toObject()` 输出自己的图数据，并非 JSON Canvas；实例 API 也不是独立于界面的 Python 文件操作库。[保存示例](https://reactflow.dev/examples/interaction/save-and-restore)、[实例使用](https://reactflow.dev/api-reference/hooks/use-react-flow) |
| JSON Canvas Viewer | 原生读取 `.canvas`，支持缩放、平移、小地图，提供 `@json-canvas-viewer/react` 适配，MIT。[项目](https://github.com/hesprs/json-canvas-viewer) | 适合以较少开发实现 DSH 内看图；定位为查看器，不能算完成用户的手工编辑需求。项目宣称的完整格式支持和性能未在本地验证。 |
| PyJSONCanvas | Python/MIT；`Canvas.from_json`、`to_json`、`export`，节点/边新增、查询、删除及校验；修改通过对象属性完成，删除节点会级联删边。[项目](https://github.com/CheeksTheGeek/PyJSONCanvas)、[实现](https://raw.githubusercontent.com/CheeksTheGeek/PyJSONCanvas/main/pyjsoncanvas/jsoncanvas.py) | 属于文件操作库，无编辑界面；PyPI 最新发布 1.0.2（2024-04-12），本次未见完善测试套件证据。源码固定字段序列化，顶层额外字段会丢失，额外节点字段可能报错或被过滤，不能承诺任意扩展数据无损往返。[发布记录](https://pypi.org/project/PyJSONCanvas/)、[模型](https://raw.githubusercontent.com/CheeksTheGeek/PyJSONCanvas/main/pyjsoncanvas/models.py) |
| @trbn/jsoncanvas | TypeScript/MIT；提供 JSONCanvas、addNode、addEdge、removeNode、toString 等接口，明确不包含渲染引擎。[项目](https://github.com/t128n/jsoncanvas) | 仓库于 2026-02-15 归档；虽有测试配置，当前不建议作为需要持续维护的首选依赖。 |
| tldraw | 接近可整体嵌入的白板编辑器，Editor API 支持图形增删改、选择、排列、历史等。[Editor](https://tldraw.dev/docs/editor) | 使用自己的记录与 snapshot，仍需转换为 `.canvas`。官方要求生产使用有效许可；商业项目需商业许可，非商业可申请 hobby 许可，不能按无条件 MIT 依赖使用。[持久化](https://tldraw.dev/docs/persistence)、[许可条件](https://tldraw.dev/community/license) |

[JSON Canvas 官方生态目录](https://jsoncanvas.org/docs/apps/)收录了多种语言库和查看器，收录不等于官方维护或质量保证。官方规范及 Obsidian 的 [`canvas.d.ts`](https://github.com/obsidianmd/obsidian-api/blob/master/canvas.d.ts) 提供格式与类型，并不是完整的读写、编辑和保存 SDK。另查到 `react-jsoncanvas`，但其 README 明确当前偏展示示例，作为依赖仍实验性且可能构建失败，故不将它作为成熟编辑 SDK 推荐。[项目自述](https://github.com/Digital-Tvilling/react-jsoncanvas)

### 选型建议（实施前记录）

优先复用现成库，停止把“自行设计完整 Canvas 编辑 API”作为默认路线。若保持手工编辑目标，倾向以 React Flow 提供 DSH 画布交互，项目负责论文字段约定、JSON Canvas 格式适配、DSH 工具连接以及可靠保存。通用 SDK 不会自带 paperstream 的论文业务含义；UI SDK 也不会自动变成 agent 可调用的后台服务。

如果当前只需“agent 改文件、界面看结果”，可以先评估文件库加 JSON Canvas Viewer；这只是展示阶段，完整手工编辑仍待后续组件接入。原生 `.canvas` 文件库需要先验证往返保真与删除行为，尤其不能让库默认级联删除绕过现有用户约定。若把几乎不开发编辑器作为最高优先级，也可另讨论 tldraw 现成编辑器及其自有格式、许可，但不在本轮代用户更换格式。

独立保存的 `.canvas` 仍可作为资料来源，DSH 只是其中一个操作界面。难度判断：只读展示较小；基本编辑与可靠保存为中等规模集成；完整复刻 Obsidian 的附件、笔记和白板体验明显更大。以上是依据接口能力作出的工程判断，未实测接入或作工时承诺。

关于“React.js/React Flow 是否重”：React 是界面库，React Flow 是基于它的图编辑组件，两者均需与完整桌面应用的运行开销区分。当前 DSH 上游 ui-renderer 已使用 React/React DOM；官方共享模块机制允许同页插件复用 React，要求插件构建时将相应导入保留为 external，并适配宿主提供的版本。React Flow 将 React/React DOM 声明为 peer dependencies，适合这种集成方式，无需额外桌面运行时；实际插件构建仍须验证依赖复用。[DSH 共享模块](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/web/README.md#the-shared-module-table)、[React Flow 依赖](https://github.com/xyflow/xyflow/blob/main/packages/react/package.json)

运行开销取决于显示的节点/连线数量、卡片复杂度以及更新方式；官方性能文档特别指出拖动触发的无效重绘、过多节点和复杂样式的影响。[React Flow 性能建议](https://reactflow.dev/learn/advanced-use/performance) 对本项目可先采用简短文字卡片、按需显示详细内容、减少动画，并在面板不用时停止不必要的订阅或渲染。开发端会增加 JavaScript/TypeScript 的依赖与构建流程，但开发依赖目录体积不能当作插件下载大小或运行内存。尚未打包或测量内存、启动时间、拖动性能，不提供未经测量的 MB 数字或容量上限。

## ChatGPT、Codex 与 Claude 桌面端移植判断（2026-11-06）

本节只记录官方接口调研与工程判断，未实施移植。应分别评估 agent 调用文件 API、在应用内显示现有网页、以及注册原生插件界面。共同使用 React 并不意味着 DSH 的槽位注册、共享依赖或文件选择器可以原样搬到其他宿主。

跨平台架构建议：保留 React / React Flow，进一步分离宿主服务，不因 DSH 使用 React 而更换界面框架。React 是通用网页界面库，可接入采用其他技术的现有页面；宿主若提供合适的网页容器与扩展入口，也可以承载独立打包的 React 界面。DSH 已有 React 只是同页集成时复用依赖的便利条件，并非 Paperstream 必须依赖 DSH 的理由。[React 官方集成说明](https://react.dev/learn/add-react-to-an-existing-project)

建议维持以下四个边界，不要求立即拆成多个发布包：

| 部分 | 职责与依赖边界 |
| --- | --- |
| 文档约定 | 独立 `.canvas` 文件、稳定 ID、论文与关系字段；不保存宿主专属运行状态。 |
| 数据操作 | 现有 Python API / CLI 与纯 TypeScript Canvas 操作；增删改、校验和未知字段保留不依赖 DSH 或 React。继续以往返测试核对两种实现的语义一致性。 |
| 可视编辑器 | React / React Flow 负责卡片、连线和交互；接收文档并报告修改，不自行决定文件位置或导入 DSH 接口。 |
| 平台接入 | 独立网页、DSH、MCP Apps 或其他宿主分别处理入口、打开/保存、草稿、外部链接、文档更新通知与构建包装。 |

当前代码已经部分满足这些边界：`web/src/canvas.ts` 与 Python API 独立，DSH 注册和专用构建集中在 `dsh/`，独立网页和 DSH 挂载同一个 `PaperstreamEditor`。尚需调整的是 Editor 将文件选择、保存、sessionStorage 草稿和界面组合在一起，目前宿主只能传入 `draftKey`。移植前宜增加可传入文档、修改回调和只读状态的接口，将浏览器文件操作留在浏览器接入层。隔离 iframe 中须按该宿主要求打包 React，不能沿用 DSH 的共享模块假设。保存接口还应保留冲突检测，并让界面能重新加载 agent 修改后的文档；搬迁入口本身不能保证多写入者同步。

MCP 工具与 MCP Apps 是可选接入方式，不应成为独立文件 API 或编辑器的强制运行依赖。MCP Apps 使用 HTML、JavaScript 和隔离网页容器，官方提供包括 React 在内的多框架示例；普通 MCP 工具支持不等于交互界面支持。应按实际能力启用界面和保存功能，不能嵌入时仍可通过 API 操作文件或使用独立网页。跨平台目标是复用文档、业务操作和尽可能多的界面代码，各宿主的文件权限、界面尺寸和交互入口仍须验证；本轮只记录建议，未实施上述拆分。[MCP Apps 官方说明](https://modelcontextprotocol.io/extensions/apps/overview)

| 目标 | 官方可确认入口 | 判断 |
| --- | --- | --- |
| agent 自动维护文件 | Claude Code 可调用本地命令或 stdio MCP；有本地执行与文件权限的 ChatGPT/Codex 会话也可运行项目 CLI | 接入相对简单；将 Python API 包装为 MCP 工具可进一步减少对命令行提示的依赖。仍需安装运行环境与明确文件位置。 |
| Codex 桌面会话的 Browser | OpenAI 官方文档记录桌面中的 Codex 可操作内置浏览器，浏览器可打开本地服务提供的页面 | 可先承载同一份 React 编辑器，再验证文件保存与 agent 修改后的刷新；该 Browser 不提供于 Codex CLI 或 IDE 扩展，不能由此推断所有 Codex 客户端都支持画布面板。 |
| Claude Code 桌面 Code 标签页 | Browser 面板可预览并手工操作本地开发服务器提供的网页 | 先复用独立编辑器是较短路径；这是网页承载，不等同于已安装专属画布插件。SSH 会话的 Browser 自动预览有官方限制，不能照搬本地会话结论。 |
| Claude Desktop 聊天 | 官方交互连接器支持聊天内嵌与全屏 MCP Apps | 画布可复用，需 MCP Apps UI 接口和工具服务，文件持久化要重新接入；不能把 Code 的 MCP 工具支持视为其已保证渲染 MCP Apps。 |
| ChatGPT 桌面插件 | MCP Apps UI，以及侧栏应用、会话面板、按扩展名打开文件的编辑器扩展 | 可把 `.canvas` 注册为文件编辑入口；属中等规模宿主适配，实际账户、版本和文件接口还需实测。 |

官方依据：[ChatGPT MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui)、[ChatGPT 插件扩展与文件编辑器](https://developers.openai.com/plugins/build/extensions)、[ChatGPT 本地执行能力](https://learn.chatgpt.com/docs/use-chatgpt)、[Claude Code 桌面预览](https://code.claude.com/docs/en/desktop#preview-your-app)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Claude 交互连接器](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)。

补充 Codex 的明确边界：当前官方 [Browser 文档](https://learn.chatgpt.com/docs/browser)将相关能力描述为 ChatGPT 桌面应用中的 Codex 使用体验，并给出启动本地服务、在应用内打开页面的步骤；不将这一能力泛化为任意版本的独立客户端或原生插件插槽。[Codex 官方实践](https://learn.chatgpt.com/docs/learn/best-practices#use-mcps-for-external-context)确认可接入 STDIO 和 Streamable HTTP MCP 工具。因此可以保留 React 编辑器并单独接入工具 API；终端使用时，画布可由外部浏览器显示。网页能显示不代表项目保存、同步和安装流程已经完成联调。

用户进一步明确希望点开 `.canvas` 就在右侧文件面板显示，避免额外打开网页。OpenAI 的 [File viewers and editors](https://developers.openai.com/plugins/build/extensions#file-viewers-and-editors)明确提供按扩展名进入会话侧面板的自定义查看器/编辑器，并向组件传入文件资源 URI；可据此开发 `extensions: ["canvas"]` 的入口，接入现有画布及宿主读写、更新通知。这是需要安装和联调的文件处理扩展，不是宿主已经内置 JSON Canvas 渲染。官方[插件说明](https://learn.chatgpt.com/docs/plugins)包含 ChatGPT 桌面中的 Codex，但文件扩展接口文档以 ChatGPT 为目标，不能由插件通用支持推断用户任意 Codex 版本都已开放同一个文件面板；须在目标客户端核验。普通[文件预览文档](https://learn.chatgpt.com/docs/artifacts-viewer)也未承诺原生识别 JSON Canvas。

Claude Code 的[文件面板](https://code.claude.com/docs/en/desktop#open-and-edit-files)可打开和编辑本地项目文件，但未声明原生 JSON Canvas 图形预览。当前 [Mods](https://code.claude.com/docs/en/plugins/mods/overview)可在 CLI、桌面 Code 标签页和 VS Code 增加交互面板；[界面接口](https://code.claude.com/docs/en/plugins/mods/interface)主要是宿主绘制的 Box、Text、Button、Pane 等元素描述树，不能因为支持 JSX 就将其当作 React DOM。它另有 Svg 与 Client 元素，本轮未确认 Client 是否能承载 React Flow。未找到按文件扩展名注册查看器、接管现有文件面板的公开接口，因此自定义 Pane、Browser 网页预览和原有文件预览栏须分别评估，不能宣称两家宿主已有等价接入能力。

运行开销应按实际机制判断：上述 MCP App 仍是隔离 iframe 中的网页界面，放入侧栏不会消除 React、图节点、连线和编辑状态的开销。生产构建可打包界面资源，避免把 Vite 开发服务器作为使用要求，也无需为此再包装一套独立桌面浏览器；但宿主隔离视图与 MCP 工具服务仍可能增加进程和内存。建议按需加载编辑器、关闭面板时释放交互资源，继续只显示文字卡片与连线、不自动嵌入 PDF 或原文网页。比较时用同一张图记录宿主、相关渲染进程及工具服务的总内存增量，不以位置在“侧栏”或“网页”推断更轻。只读场景可另评估静态预览以免运行完整编辑器，但不以静态图片替代用户要求的手工编辑。[UI 隔离与打包](https://developers.openai.com/plugins/build/chatgpt-ui)

ChatGPT 官方建议优先用开放 MCP Apps 协议实现可复用 UI，再加平台专用扩展；UI 通过隔离 iframe 与宿主通信，不能将现有浏览器文件句柄视为跨宿主通用能力。文件长期保存仍应落在明确的本地目录或文件服务，避免把聊天组件状态当作论文唯一存档。个人测试和公开分发也要区分：[本地插件测试与打包](https://developers.openai.com/plugins/build/plugins)支持本地来源；[本地 MCP 的公开提交](https://developers.openai.com/plugins/deploy/desktop-only)目前有批准伙伴限制，这不等于禁止个人本地测试。

建议顺序：先完成当前编辑器的完整构建与运行验证；按用户偏好，优先在实际 Codex 桌面客户端核验文件扩展入口，再适配文档读写和刷新。Claude Code 先验证自定义文件入口是否可用，缺少对应能力时再选 Browser 或另做 Mods 面板；独立网页继续作为通用入口。MCP 工具与 MCP Apps UI 按具体接入需要封装。此顺序是基于公开接口和现有源码的判断，未测移植工时、性能或各桌面端文件保存能力。

## 后续验证顺序

1. 在可访问 npm 的环境安装 web 依赖，保留 lock 文件，执行完整 TypeScript 检查及独立页面、DSH 插件构建。
2. 实际打开 ResNet Canvas 样例，验证拖动、缩放、键盘选择、详情编辑、关系线、局部图与撤销；保存后以 Python 再读核对。
3. 同时覆盖浏览器文件句柄与下载回退，验证外部修改冲突、重新读取、切换 DSH 面板后的草稿恢复；在 Web 和 Desktop 分别验收。
4. 在真实数据规模下测量响应与内存，再决定是否需要搜索、布局或长笔记/附件适配；不提前承诺节点容量。

当前六个业务字段已实现，先在实际论文整理中使用，再决定是否需要来源证据、阅读状态等扩展。

## 选型记录

此前比较了 DOT、Mermaid、draw.io 和 JSON Canvas，曾选择 Mermaid 并实现其 API。用户随后确认转向 JSON Canvas 与 React Flow；旧选择理由保留如下。

- DOT：文本紧凑、可保存字符串属性，显示自定义字段需要标签映射。
- draw.io：已有可视编辑和自定义属性，但 XML 更繁杂。旧 [draw.io 样例](../../examples/paperstream.drawio) 只保留为选型记录，不作为当前主文档。
- JSON Canvas：已有节点、边与坐标，三个语义字段仍需约定与编辑器兼容验证。

运行负担需区分文档与工具：Mermaid 文本很小，在已有编辑器中预览方便；其官方命令行导出涉及 Node.js 与 Puppeteer 驱动的浏览器。此次选择依据用户偏好的文本维护方式，没有进行统一内存或性能测试。[Mermaid 介绍](https://mermaid.js.org/intro/)、[Mermaid CLI](https://github.com/mermaid-js/mermaid-cli)

此前核验的 draw.io Desktop 32.6.10 Windows 安装包为 137 MB，四节点四条边旧样例为 4257 字节；这些数值分别是下载包与单个文档大小，不代表运行内存。[发布文件列表](https://github.com/jgraph/drawio-desktop/releases/expanded_assets/v32.6.10)
