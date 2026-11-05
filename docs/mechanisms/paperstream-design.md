# paperstream 论文关系图设计

更新日期：2026-11-05。已确认选用 Mermaid；已实现独立 Python API 与 CLI，尚未接入 DSH 插件。

## 已确认需求与选型

用户明确选择 Mermaid，主要考虑纯文本、易修改和轻量维护。以独立的 `.mmd` 文件保存关系图，文件由用户自主保管；文本编辑器、DSH、模型 API 配合的脚本均可维护同一份文档。

用户进一步要求 agent 统一通过 API 编辑图。当前选择 Python 标准库实现，避免引入额外运行依赖；人工仍可直接编辑原生文本。[使用说明](../../README.md)、[agent 规则](../../AGENTS.md)。

节点包含 `name`、`alias` 和 `takeaway`，边包含 `relation`。用户明确 `name` 表示论文完整原始标题；`alias` 为自定义简称。图允许分支、汇合和交叉关联。优先采用 Mermaid 原生语法。

参考视频：https://www.bilibili.com/video/BV1nA41157y4/ 。已查看用户截图中的方法演进图；视频页面返回 HTTP 412，未观看视频，不将截图理解表述成视频全文结论。

## 最小文档约定

[paperstream.mmd](../../examples/paperstream.mmd) 是当前样例。内容为虚构方法与关系，四个节点、四条边，展示分支和汇合。

| 内容 | 保存位置与含义 |
| --- | --- |
| 节点 ID | Mermaid 节点标识符，保持稳定 |
| name | 完整原始标题，独立存于关联节点 ID 的 `%% paperstream: name` 注释中；可暂缺，不从简称推断 |
| alias | 节点 Markdown 标签的第一行；样例以粗体显示，粗体标记不属于字段值 |
| takeaway | 同一标签第一行之后的全部文本，可多行且非空 |
| 边 ID | Mermaid 原生边标识符，保持稳定 |
| relation | 边的文字标签，非空单行自由文本，不强制分类 |

命名规则：`paper_` 后加固定编号标识节点，例如 `paper_001`；`relation_` 后加固定编号标识边，例如 `relation_001`。新增时使用未用编号，增删不重排，删除后不复用，修改 alias 不修改 ID。

这些字段是 paperstream 的解释约定，不是 Mermaid 内置的任意属性系统。每个字段只保存一次：简称、要点与关系保存在标签，原题保存在同一 `.mmd` 的注释。修改原题不改变简称、节点 ID 或连线；相同原题也不意味着两个节点必须合并。

标题注释形式为 `%% paperstream: name paper_001 "完整原始标题"`，通常放在节点声明前，归属以节点 ID 为准。引号内遵循标准 JSON 字符串规则，保留原语言、大小写、标点及 Unicode；双引号与反斜杠按 JSON 转义。API 插入缺失标题记录，或只替换已有记录的字符串区间。重复标题记录、悬空引用和非法 JSON 报错；删除节点时删除它的标题记录。

原题不放入图面标签，以免长标题挤占关系图空间。这是当前显示选择；Mermaid 本身不会将注释解析为标题或悬浮提示。`.mmd` 保留完整信息，导出的图片不会自动包含原题。标题暂缺时读取为 Python `None` / JSON `null`，保持旧文件兼容，不用 alias 回填；调用 `update_node(name=None)` 不修改标题。目前没有单独清除标题的 API。

官方依据：[Mermaid 注释](https://mermaid.js.org/syntax/flowchart.html#comments) 采用独立行的 `%%`，渲染时忽略其内容。名称记录是项目格式约定，普通文本编辑器仍可阅读和修改。

有一个实际语法边界：Mermaid 的[预处理源码](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/preprocess.ts) 先处理配置指令，后清除普通注释；[指令正则](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/diagram-api/regexes.ts) 可识别注释内部的 `%%{…}%%`。因此 API 在 JSON 编码后将百分号写为 `\u0025`，并拒绝手写标题 JSON 源码中的原始 `%%{`。解码后的字段仍保留原始百分号，不限制标题语义。已针对该特殊标题添加往返与拒绝测试；这不等于完整 Mermaid 渲染验证。

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
- 所有操作先在内存构造候选文本，通过约定校验后才替换当前内存状态。字段更新只替换对应源码区间，保留未改字段、注释、其他声明和原有换行。
- name 提供时限定非空单行，使用 JSON 字符串编码。alias 与 relation 限定非空单行，takeaway 可多行；标签中的引号、反引号、Markdown 特殊字符、百分号及实体起始字符使用 Mermaid 十进制实体编码，读取时只解码一轮，避免字面量 `#quot;` 被二次解释。
- 删除节点若仍有关系会拒绝；显式 `cascade=True` 才连同关系一起删除。删除后的 `%% paperstream: retired ID` 注释保存编号历史，防止重载后复用。
- `save` 校验文档并获取同目录排他锁，核对磁盘快照，将候选内容写到临时文件，再核对一次。更新用原子替换；新建用不会覆盖已有目标的硬链接提交。失败时保留旧文件，正常完成后清理临时文件与锁。
- API 写入者共享锁；对不遵守该锁的手工编辑器，快照检查只能尽力检测，最终检查与替换之间仍有竞态。当前不提供实时多人协作。
- `with Graph.load(...)` 或 `with Graph.create(...)` 正常退出时保存；代码块抛出异常时不保存。CLI 成功与错误输出 JSON，便于 agent 处理。

该解析器支持约定的 flowchart、注释、Markdown 多行节点和带 ID 的箭头连线，暂不支持 YAML 前置配置、样式、分组、配置指令或任意 Mermaid 语法。遇到这些内容会明确报错，保留源文件；后续扩展需增加对应解析与测试。

自动化图编辑规则写入 AGENTS.md。这是 agent 工作约定；真正阻止有文件写权限的程序绕过 API，需要宿主权限约束，当前项目不声称已经实现该隔离。

实现使用 Python 3.10+ 标准库，没有第三方运行依赖。测试覆盖增删改查、原题与简称分离、旧格式兼容、标题元数据有效性、字段级文本保留、CRLF、多行与特殊字符、ID 不复用、非法操作不改变图、外部冲突、协作锁及写入失败保护。当前环境没有 Mermaid 包，npm 网络访问被限制，尚未完成 Mermaid 原生解析或渲染验证；`validate` 是项目文档约定的校验。

## 后续验证顺序

1. 在实际使用的 Mermaid 预览器打开样例，确认多行标签、中文、边 ID 和分支汇合。
2. 修改一次 name、alias、takeaway 和 relation，检查字段独立性、文字变化及连接保持。
3. 根据实际文献维护需要扩展样式或分组支持，并补充对应测试。
4. 将已有 API/CLI 接入 DSH 或模型 API，保留直接手工编辑途径。

下一步若实际文献整理需要，可考虑可选 `url`（论文原始页面）与 `year`（发表年份），用于找回原文与理解先后顺序。本次只实现用户提出的 name，不增加其他字段。

## 选型记录

此前比较了 DOT、Mermaid、draw.io 和 JSON Canvas。用户最终选择 Mermaid，后续以此推进。

- DOT：文本紧凑、可保存字符串属性，显示自定义字段需要标签映射。
- draw.io：已有可视编辑和自定义属性，但 XML 更繁杂。旧 [draw.io 样例](../../examples/paperstream.drawio) 只保留为选型记录，不作为当前主文档。
- JSON Canvas：已有节点、边与坐标，三个语义字段仍需约定与编辑器兼容验证。

运行负担需区分文档与工具：Mermaid 文本很小，在已有编辑器中预览方便；其官方命令行导出涉及 Node.js 与 Puppeteer 驱动的浏览器。此次选择依据用户偏好的文本维护方式，没有进行统一内存或性能测试。[Mermaid 介绍](https://mermaid.js.org/intro/)、[Mermaid CLI](https://github.com/mermaid-js/mermaid-cli)

此前核验的 draw.io Desktop 32.6.10 Windows 安装包为 137 MB，四节点四条边旧样例为 4257 字节；这些数值分别是下载包与单个文档大小，不代表运行内存。[发布文件列表](https://github.com/jgraph/drawio-desktop/releases/expanded_assets/v32.6.10)
