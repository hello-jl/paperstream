# paperstream

用独立的 `.canvas` 纯文本文件管理论文关系。React Flow 提供拖动与编辑界面；Python API 和 CLI 让 agent 维护同一格式。无需 Obsidian。新工作以 Canvas 为主，旧 Mermaid API 和示例作为兼容入口保留，不做双向同步。

**当前状态：** Canvas 文件 API、React Flow 编辑器和 DSH 面板插件已实现。自动测试、完整前端与插件构建通过；2026-11-06 已在 Chrome / DSH Web 0.2.2-rc.1 手测就地文字编辑、详情浮层、双向箭头、自动高度与粗细设置，以及增删改、连线、撤销、文件保存/下载和冲突保护。Desktop 尚未验证，详细范围与已知限制见 [DSH 说明](dsh/README.md)。

## 打开图形编辑器

需要 Node.js 22.18 或更新版本，在项目根目录执行：

```sh
npm --prefix web ci
npm --prefix web run dev
```

打开终端显示的本机地址，再选择 [CNN 演进图](examples/cnn-evolution.canvas)（LeNet-5、AlexNet、VGG、ResNet 四篇）或 [ResNet 关系图](examples/resnet.canvas)。`web/package-lock.json` 已生成，使用 `npm --prefix web ci` 安装锁定依赖。

- 卡片显示 `alias`、简短 `takeaway` 和年份。点击卡片右上角齿轮，或右键卡片/关系，在附近的详情浮层编辑完整 `name`、原文 `url` 等信息；不再占用固定右栏。
- 双击简称、要点或关系说明可直接编辑。简称和关系按 Enter 应用，多行要点按 Ctrl/Cmd+Enter 应用，Esc 取消；应用后仍需保存文件。
- 论文卡片默认随内容自动增高或收缩，文字换行。年份固定在卡片内部右下角并预留空间，手动留白时仍贴近底部；没有年份则不预留年份区。手动调整卡片大小会切到“手动保留高度”，可在详情中切回“自动适应内容”。
- 论文卡片边框和关系线粗细可在详情中设置，范围为 0.5–8 px，默认分别为 1 px 和 1.8 px。
- 拖动圆点连接卡片，填写边上的 `relation`；关系可设为正向、反向、双向或无箭头。拖动卡片或调整大小会更新布局。
- 关系说明支持换行并自动避开可见卡片和其他关系说明；双击文字直接编辑，右键打开详情。适应视图同时包含卡片与关系说明。
- “只看附近”显示选中卡片及直接相连的卡片，保存仍包含全图；“显示全图”恢复视图。
- 编辑详情后先点击“应用更改”，再保存文件。支持撤销、重做与显式删除确认。
- 支持文件句柄的浏览器可保存到原文件，保存前检查文件是否被其他程序修改；其他浏览器使用“下载副本”。Python/agent 更新文件后点击“重新读取”，或重新打开。
- 本标签页的临时草稿用于恢复未保存内容，不能替代文件。恢复草稿不恢复文件写入权限。

当前测试机的 Chrome 在 HTTP 页面中未将 Esc 送达编辑器，取消请使用输入框旁的“×”；该环境中的 Esc 取消未计为手测通过。

卡片可打开 HTTP(S) 原文页面或链接；不会给每张卡片嵌入 PDF 或加载网页。已有普通备注、文件卡片、链接、分组及未知字段会保留。第一版只提供基本卡片展示，文件卡片显示路径，不解析本地附件或渲染完整 Markdown/Obsidian 白板样式；分组框不自动带动框内卡片移动。

## Canvas 的 Python API 与 CLI

需要 Python 3.10 或更新版本，仅使用标准库；无需安装 React 或启动界面。

```python
from paperstream import CanvasGraph

with CanvasGraph.create("papers.canvas") as graph:
    # 示例文字，不是真实论文资料。
    first = graph.add_node(alias="基础工作", takeaway="记录自己的核心认识。",
                           name="An Example Original Paper Title", x=0, y=0)
    second = graph.add_node(alias="后续工作", takeaway="记录与前作的差异。", x=480, y=0)
    graph.add_edge(first.id, second.id, relation="扩展研究问题")

with CanvasGraph.load("papers.canvas") as graph:
    graph.update_node(first.id, takeaway="修订核心认识；位置和连接保持不变。")
    graph.move_node(second.id, 480, 160)
    graph.clear_node_fields(first.id, ["year"])  # 清空可选字段；None 在 update_node 中表示不修改
```

```sh
python3 -m paperstream show examples/resnet.canvas
python3 -m paperstream validate examples/resnet.canvas
python3 -m paperstream update-node examples/resnet.canvas paper_001 --alias 'ResNet'
# 单向转换成新文件；目标存在时拒绝覆盖，原 .mmd 保持不变。
python3 -m paperstream export-canvas examples/resnet.mmd my-papers.canvas
```

CLI 根据 `.canvas` 后缀选择新 API；原增删改命令继续适用，额外提供 `move-node`、`resize-node`、`clear-node-fields` 和 `show --raw`。新 Canvas 自动 ID 为随机 UUID 的 32 位十六进制表示；迁移时保留旧 ID。agent 应使用操作返回的 ID。

论文信息保存在标准 `text` 节点的 Markdown JSON 代码块中：`paperstream: 1` 是模板版本，其他键是 `name/alias/takeaway/url/year`。每个字段只保存一份，边使用标准 `label`。其他 Canvas 编辑器可以显示代码块，但不会自动提供本项目的论文表单。JSON 格式化可能改变，未修改数据保持；不承诺保留原 JSON 缩进。

Python 保存使用快照检查、协作锁和原子替换；浏览器保存使用文件快照检查与浏览器写入流。二者没有共同事务锁，与手工编辑器并发时仍有最终检查到提交之间的竞态，不应同时编辑同一文件。遇到冲突先保留副本，再读取最新内容核对。

## DSH 面板

[dsh/README.md](dsh/README.md) 包含构建、安装与宿主版本要求。插件复用 DSH 的 React，在主面板和左侧导航提供入口。它使用浏览器选择的文件；远程 DSH Host 的工作区文件不会自动出现在本机选择器中。当前没有 Host 文件 RPC 或模型工具注册；agent 仍调用上述 API/CLI。

本次开发机的 DSH 与配置位于项目 `.local/`，已有环境可在根目录执行 `sh .local/start-dsh.sh`，再打开终端输出的本机地址。该临时脚本和运行环境不提交 Git；其他机器按 DSH 说明安装。

## Canvas 验证

```sh
python3 -m unittest discover -s tests -v
node --experimental-strip-types web/src/canvas.test.ts
node --experimental-strip-types web/src/files.test.ts
node --experimental-strip-types web/src/edge-label-layout.test.ts
python3 web/scripts/check_python_roundtrip.py
node dsh/test/register.test.mjs
npm --prefix web run build
npm --prefix web run build:dsh
```

设计、格式选择与验证边界统一记录在 [设计文档](docs/mechanisms/paperstream-design.md)。

## 旧 Mermaid 入口

以下说明适用于保留的 `.mmd` 文件，运行时同样只需要 Python 标准库。

## Python API

```python
from paperstream import Graph

# 创建新文件；目标已存在时会报错，不会覆盖。
with Graph.create("papers.mmd") as graph:
    # 以下标题与内容均为虚构示例。
    base = graph.add_node(
        name="A Foundational Method for the Example Task",
        alias="基础方法", takeaway="提出研究路线的出发点。",
        url="https://example.org/papers/foundational-method", year=2020,
    )
    improved = graph.add_node(
        name="A Lower-Cost Method for the Example Task",
        alias="后续改进", takeaway="降低计算成本。",
        url="https://example.org/papers/lower-cost-method", year=2021,
    )
    relation = graph.add_edge(base.id, improved.id, relation="简化计算步骤")

# 读取现有文档，按固定 ID 修改一个字段。
with Graph.load("papers.mmd") as graph:
    graph.update_node(improved.id, takeaway="降低成本，并保留主要效果。")
    graph.update_edge(relation.id, relation="精简计算，同时保留主要效果")
```

`with` 正常结束才保存；代码块抛出异常时不保存。也可显式使用 `graph = Graph.load(path)`、多次编辑，最后调用 `graph.save()`。保存前的修改只在内存里。

| 操作 | 方法 |
| --- | --- |
| 读取全部节点、边 | `graph.nodes()`、`graph.edges()` |
| 添加论文 | `graph.add_node(alias, takeaway, node_id=None, name=None, url=None, year=None)`；后三项用关键字传入 |
| 修改论文 | `graph.update_node(node_id, alias=None, takeaway=None, name=None, url=None, year=None)`；修改字段用关键字传入 |
| 删除论文 | `graph.remove_node(node_id, cascade=False)` |
| 添加关系 | `graph.add_edge(source, target, relation, edge_id=None)` |
| 修改关系 | `graph.update_edge(edge_id, source=None, target=None, relation=None)` |
| 删除关系 | `graph.remove_edge(edge_id)` |
| 检查或取得当前源码 | `graph.validate()`、`graph.to_mermaid()` |
| 保存 | `graph.save()` |

新增操作返回不可变的 `Node` 或 `Edge`，其中 `id` 用于后续修改。自动编号采用 `paper_001`、`relation_001`：前缀表示节点或边，数字表示固定编号；增删不重排，删除后不复用。也可以显式指定合法且未用过的 ID。

有连线的节点默认不能删除。`cascade=True` 会同时删除相连的边，只有确实要删除这些关系时才使用。

## 给 agent 的命令行入口

```sh
python3 -m paperstream show examples/paperstream.mmd
python3 -m paperstream validate examples/paperstream.mmd
python3 -m paperstream init papers.mmd
python3 -m paperstream add-node papers.mmd --alias '基础方法' --takeaway '提出研究路线的出发点。'
python3 -m paperstream add-node papers.mmd --alias '后续改进' --takeaway '降低计算成本。'
python3 -m paperstream add-edge papers.mmd paper_001 paper_002 --relation '简化计算步骤'
python3 -m paperstream update-node papers.mmd paper_002 --takeaway '降低成本，并保留主要效果。'
python3 -m paperstream update-node papers.mmd paper_001 --name 'A Foundational Method for the Example Task'
python3 -m paperstream update-node papers.mmd paper_001 --url 'https://example.org/papers/foundational-method' --year 2020
```

创建命令与前面的 Python 示例分别用于一个新文件；若已创建 `papers.mmd`，直接读取或修改即可。上述标题、年份及 example.org 链接仅用于演示，不是真实论文资料。`add-node` 同样接受 `--name`、`--url` 和 `--year`，也可只更新其中一个字段。命令的参数说明见 `python3 -m paperstream --help`。

成功结果在 stdout 输出 JSON；失败在 stderr 输出 JSON。业务错误退出码为 1，命令用法错误为 2。agent 应使用返回的 ID，不能假定自己新增的节点必然是某个编号。多行 takeaway 优先通过 Python API 传入。

## 文档约定与边界

- 主文件是 UTF-8 `.mmd`，独立于 DSH。`name` 是论文完整原始标题，保留原语言、大小写与标点；`alias` 是自定义简称；`takeaway` 是自己的核心认识；`url` 是原文页面；`year` 是所记录版本的年份；`relation` 是论文间的关系。字段语义是项目约定，不是 Mermaid 内置属性。
- 节点 Markdown 标签首行表示 `alias`，后续行表示 `takeaway`；边标签表示 `relation`。`name`、`url`、`year` 单独存于同文件注释，不占用图面显示空间。例如下面这个虚构节点：

````text
flowchart TD
    %% paperstream: name paper_001 "A Foundational Method for the Example Task"
    %% paperstream: url paper_001 "https://example.org/papers/foundational-method"
    %% paperstream: year paper_001 2020
    paper_001["`**基础方法**
提出研究路线的出发点。`"]
````

- 元数据注释按节点 ID 关联，建议放在节点定义前。`name` 与 `url` 使用标准 JSON 字符串：双引号写成 `\"`，反斜杠写成 `\\`；API 还将百分号写成 `\u0025`，避免被 Mermaid 当作配置指令，读取仍返回原始文本，包括 URL 中的 `%20` 等编码。手写元数据不得包含未转义的 `%%{`。每个节点的每个字段最多一条记录，不允许引用不存在的节点。
- `name` 提供时必须是非空单行文本。`url` 必须是包含主机名的绝对 HTTP(S) 链接，不接受空白、控制字符、反斜杠或非法端口；只做基本语法检查，不联网验证可访问性。推荐填 DOI、arXiv 或出版社的论文页面。
- `year` 使用 JSON 整数，不加引号；接受 1 到 9999，不接受布尔值、浮点数或字符串。填写所链接版本的年份：正式会议/期刊页用发表年，预印本页可用首次公开年；同一张图尽量采用一致约定，不按 URL 或当前年份自动猜测。
- 三个元数据字段均可暂缺，读取为 Python `None` / JSON `null`，不从简称猜测或补造。修改方法中传 `None` 表示不修改；目前没有单独清除元数据字段的 API。旧 `.mmd` 无需迁移即可读取。
- `alias` 与 `relation` 是非空单行文本，`takeaway` 是非空文本，可多行。API 自动处理引号、反引号、百分号及 Mermaid 实体字符；返回的字段是解码后的原文。
- 第一版支持 `flowchart TD/TB/LR/RL/BT`、注释、约定的多行节点和带 ID 的箭头连线。节点只能声明一次；边端点必须存在。前置 YAML、配置指令、样式、分组及其他 Mermaid 写法暂时报错，不会被忽略或删除。
- 更新只替换指定字段的源码；未改字段、其他节点、注释和换行保持原样。新节点使用粗体 alias；已有的普通或粗体 alias 均可读取。
- 删除后保留 `%% paperstream: retired ...` 注释记录已使用的 ID。这些注释不参与绘图，请保留以避免复用编号。
- 保存前检查文件是否与读取时一致，通过同目录临时文件提交；API 写入者使用临时锁互斥。若收到 `ConflictError`，重新读取并检查最新内容后再修改。
- 手工编辑器不遵守 API 的写锁时，最后一次检查与替换之间仍可能有竞态；第一版不宣称支持无冲突实时协作。进程被强制终止后若留下锁文件，需先确认没有写入者，再移除错误中指出的锁文件。

[AGENTS.md](AGENTS.md) 规定 agent 通过 API/CLI 修改用户维护的图文档。用户仍可手工编辑。该规则是工作约定；若要从权限层面阻止 agent 绕过，宿主还需要限制其直接写文件的能力。

## 真实论文示例

[examples/resnet.mmd](examples/resnet.mmd) 包含 ResNet、DenseNet、ResNeXt 三篇论文，完整标题、链接和会议发表年份已从 CVF 官方资料核对。边表示基于原文整理的方法比较或扩展，不表示引用方向，也不表示全部思想直接继承。

```sh
python3 -m paperstream show examples/resnet.mmd
python3 -m paperstream validate examples/resnet.mmd
```

原文来源：[ResNet](https://openaccess.thecvf.com/content_cvpr_2016/html/He_Deep_Residual_Learning_CVPR_2016_paper.html)、[DenseNet](https://openaccess.thecvf.com/content_cvpr_2017/html/Huang_Densely_Connected_Convolutional_CVPR_2017_paper.html)、[ResNeXt](https://openaccess.thecvf.com/content_cvpr_2017/html/Xie_Aggregated_Residual_Transformations_CVPR_2017_paper.html)。原有 [examples/paperstream.mmd](examples/paperstream.mmd) 继续作为虚构的分支汇合示例，未给它补造真实链接或年份。

## 验证

```sh
python3 -m unittest discover -s tests -v
```

测试覆盖字段读写、标题/链接/年份独立维护、元数据类型与格式校验、旧格式兼容、特殊字符、局部源码保留、删除约束、编号不复用、外部修改冲突及保存失败保护。旧 Mermaid 入口仍未做 Mermaid 原生解析或图形渲染验证；`validate` 检查的是上述文档约定。

DSH 插件和 Canvas 新入口见本文开头；本地 DSH Web 已完成上述联调。插件没有额外的常驻文件 API 服务，Python 模块与 CLI 可由 agent 直接调用。
