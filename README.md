# paperstream

用独立的 Mermaid 文档维护论文关系，通过 Python API 或命令行编辑。需要 Python 3.10 或更新版本，运行时仅使用标准库；以下命令在本项目根目录执行。

## Python API

```python
from paperstream import Graph

# 创建新文件；目标已存在时会报错，不会覆盖。
with Graph.create("papers.mmd") as graph:
    # 以下标题与内容均为虚构示例。
    base = graph.add_node(
        name="A Foundational Method for the Example Task",
        alias="基础方法", takeaway="提出研究路线的出发点。",
    )
    improved = graph.add_node(
        name="A Lower-Cost Method for the Example Task",
        alias="后续改进", takeaway="降低计算成本。",
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
| 添加论文 | `graph.add_node(alias, takeaway, node_id=None, name=None)`；`name` 用关键字传入 |
| 修改论文 | `graph.update_node(node_id, alias=None, takeaway=None, name=None)`；修改字段用关键字传入 |
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
```

创建命令与前面的 Python 示例分别用于一个新文件；若已创建 `papers.mmd`，直接读取或修改即可。命令的参数说明见 `python3 -m paperstream --help`。

成功结果在 stdout 输出 JSON；失败在 stderr 输出 JSON。业务错误退出码为 1，命令用法错误为 2。agent 应使用返回的 ID，不能假定自己新增的节点必然是某个编号。多行 takeaway 优先通过 Python API 传入。

## 文档约定与边界

- 主文件是 UTF-8 `.mmd`，独立于 DSH。`name` 是论文完整原始标题，保留原语言、大小写与标点；`alias` 是自定义简称；`takeaway` 是自己的核心认识；`relation` 是论文间的关系。字段语义是项目约定，不是 Mermaid 内置属性。
- 节点 Markdown 标签首行表示 `alias`，后续行表示 `takeaway`；边标签表示 `relation`。`name` 单独存于同文件注释，不占用图面显示空间。例如下面这个虚构节点：

````text
flowchart TD
    %% paperstream: name paper_001 "A Foundational Method for the Example Task"
    paper_001["`**基础方法**
提出研究路线的出发点。`"]
````

- `name` 注释按节点 ID 关联，建议放在节点定义前。标题使用标准 JSON 字符串：双引号写成 `\"`，反斜杠写成 `\\`；API 还将百分号写成 `\u0025`，避免被 Mermaid 当作配置指令，读取仍返回原始标题。手写标题不得包含未转义的 `%%{`。每个节点最多一条标题记录，不允许引用不存在的节点。
- `name` 提供时必须是非空单行文本。为兼容旧文件，允许暂缺，读取为 Python `None` / JSON `null`，不会根据简称猜测或补造原题。修改方法中 `name=None` 表示不修改；目前没有单独清除标题的 API。
- `alias` 与 `relation` 是非空单行文本，`takeaway` 是非空文本，可多行。API 自动处理引号、反引号、百分号及 Mermaid 实体字符；返回的字段是解码后的原文。
- 第一版支持 `flowchart TD/TB/LR/RL/BT`、注释、约定的多行节点和带 ID 的箭头连线。节点只能声明一次；边端点必须存在。前置 YAML、配置指令、样式、分组及其他 Mermaid 写法暂时报错，不会被忽略或删除。
- 更新只替换指定字段的源码；未改字段、其他节点、注释和换行保持原样。新节点使用粗体 alias；已有的普通或粗体 alias 均可读取。
- 删除后保留 `%% paperstream: retired ...` 注释记录已使用的 ID。这些注释不参与绘图，请保留以避免复用编号。
- 保存前检查文件是否与读取时一致，通过同目录临时文件提交；API 写入者使用临时锁互斥。若收到 `ConflictError`，重新读取并检查最新内容后再修改。
- 手工编辑器不遵守 API 的写锁时，最后一次检查与替换之间仍可能有竞态；第一版不宣称支持无冲突实时协作。进程被强制终止后若留下锁文件，需先确认没有写入者，再移除错误中指出的锁文件。

[AGENTS.md](AGENTS.md) 规定 agent 通过 API/CLI 修改用户维护的图文档。用户仍可手工编辑。该规则是工作约定；若要从权限层面阻止 agent 绕过，宿主还需要限制其直接写文件的能力。

## 验证

```sh
python3 -m unittest discover -s tests -v
```

测试覆盖字段读写、原题与简称独立维护、旧格式兼容、特殊字符、局部源码保留、删除约束、编号不复用、外部修改冲突及保存失败保护。当前环境没有 Mermaid 渲染依赖，npm 网络访问受限，未做 Mermaid 原生解析或图形渲染验证；`validate` 检查的是上述文档约定。

当前没有安装 DSH 插件，也没有常驻 API 服务；Python 模块与 CLI 可由 agent 直接调用。架构与来源见 [设计记录](docs/mechanisms/paperstream-design.md)。
