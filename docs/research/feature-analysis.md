# 本轮需求分析与研究样例

核对日期：2026-11-07。此文件记录需求取舍与研究来源；界面完成情况和实际测试范围由现有 [机制文档](../mechanisms/paperstream-design.md) 记录。本次即时编辑、手工关系布局、IndexedDB 恢复和演示分页已完成实现与对应模块检查，主要交互已在真实 DSH 验证；Astra 另复核并修复恢复保护、布局和导出问题，具体范围见机制文档。导出的 PPTX 尚未在 PowerPoint 中实际打开。本轮全局设置落盘/重载、三种路径、文本页详情入口、智能竖排及标签跟随已在真实 DSH 验证。

## 逐项分析

| 需求 | 实现方向与需要保留的边界 |
| --- | --- |
| 竖着排 | 使用 ELK Layered 联合排列节点、正交线路和在线标签，支持循环、平行边和自环；减少交叉但不承诺任意图完全无交叉。显式智能竖排可撤销，会替换人工位置与折点；之后保持手动布局。端点移动时更新受影响的自动路线，人工路径保留。 |
| 顶部简约 | 标题保留 Paperstream 和文件名；低频文件操作收进菜单。顶部右侧齿轮统一承载全局主题和连线路径；卡片文档图标仅打开该对象的内容详情。保留可访问名称与键盘焦点。 |
| 多文件 tabs | 每页保持自己的文档、文件关联、撤销和输入状态；切页不等于丢弃。标签顺序、活动页、草稿和可结构化克隆的文件句柄持久化到 IndexedDB；重启只查询权限，需要时由用户点击重新授权。文件恢复核对关联代次和保存基线，保存继续拒绝外改覆盖；撤销历史仅保留在当前会话。关闭有修改的页签提供保护，恢复记录不替代正式文件。 |
| 滚轮 | 未选中时普通滚轮缩放，拖动画布空白处平移；选中对象后普通滚轮调该对象线重，Ctrl/Command + 滚轮始终缩放。输入框、浮层滚动不触发线重。节点与边保持独立，滚轮的一次连续操作应合并撤销。 |
| 底部 statusbar | 搜索/定位、局部视图、对象计数和保存状态移到底部，画布仍占主要空间。窄窗口下需要折行或精简。 |
| 导出图片 | 整图 SVG 和 PNG，包含画面外对象、关系、年份和 fig；导出不能仅截图当前视口。远程图片需先解决跨域和资源可达性。 |
| 卡片 fig | 图片随文档保存；默认占卡片内容宽度，鼠标可调宽度，保持比例。导入限制格式和大小，避免将临时 blob URL 当成永久资源。鼠标拖动至 53% 宽度后已在真实 DSH 保存并回读核对。新导入的图片不再自动填入文件名图注；旧文件名形图注仅在界面和导出中隐藏，存储值保留，自定义图注继续显示。 |
| insert 插页 | 用户已澄清为 insert 插页；保留有标题、正文和 fig 的 `page` 卡片，并实现独立的 `paperstreamPresentation.pages` 页面集合。每页引用已有卡片 ID，可重命名、选成员、排序和放映；删页不删卡片，同一卡片可用于多页。新插页同时建页，旧插页可补入页面集合，无配置时按整图一页展示和导出。 |
| paper / note | 保留“论文”作为类型信息，但减弱视觉存在感；新增普通 note。共享 relation 显示为轻量文本标签，底层仍使用标准 text 节点，不作为普通论文卡片呈现。扩展放在 `paperstreamCard.kind`，不复制论文字段。 |
| 空 relation | Canvas 边允许空字符串；只画线且仍可选中修改。允许清空现有说明，两端元数据和未知属性保持。旧 Mermaid 约定单独保留，不把新 Canvas 行为冒充为 Mermaid 已支持。 |
| 多线共用 relation | 采用一个可连接的标准 text 节点，`paperstreamCard.kind = relation`；多条无标签边连接同一节点。共享的是同一个可连接的文本标签，不是普通卡片，也不能复制多份 label 后声称同步。 |
| 手工添加与布局 | 双击空白处创建卡片，连接点拖到目标后直接创建线；新增时提供轻量的原位入口。关系文字可拖到手工位置，选中路径后可加、拖、删折点；松手才提交一次，取消手势不改文档。`paperstreamStyle.labelPosition` 与 `waypoints` 保存几何信息，可重置回自动布局；图片和 PPTX 导出尊重同一布局。完整元数据仍由就地详情承载。 |
| 即时编辑 | 原位和详情字段每次有效修改立即进入文档，取消“应用更改”。移除“×”取消输入；单行 Enter、多行 Ctrl/Cmd+Enter、失焦和收到 Esc 时只结束编辑，不回滚已生效内容；同一字段小于 1100 ms 的连续输入合并撤销。无效格式保留输入和提示，不写非法文档；空 alias、takeaway 和 relation 合法。写入文件仍需显式保存和外改检查。实际 Chrome HTTP 环境曾拦截 Esc，此键未计为 DSH 手测通过，可使用失焦或 Enter 组合结束编辑。 |
| 全局外观设置 | 顶部右侧齿轮提供苔绿/纸白/夜间主题及直角/圆角/曲线路径，默认苔绿与圆角，各画布共用，不写入图文件。DSH Web 通过宿主认证路由保存 `theme`、`connectionStyle` 到 `DSH_HOME/paperstream/preferences.json`，保留未知字段并兼容旧主题请求；独立浏览器使用同源持久存储。宿主同步失败时保留回退、显示“设置未同步”并提供重试。设置面板、路径切换和偏好落盘/重载已在 DSH Web 实测；Desktop 的持久化通道仍需验证。 |
| 箭头性质 | 保留正向/反向/双向/无箭头，并支持线型等视觉设置。箭头类型表达用户选择的关系语义，不能自动当作引用证据。 |
| takeaway 分点 | 将 `- ` 开头的行渲染为列表，存储仍是原始文本。使用 React 文本节点，避免执行用户内容中的 HTML。 |
| DeepH 宣传 | 用真实的领域阅读图演示：理论基础→计算对象→学习方法→对称性。先制作可审阅演示材料，发布渠道和内容由用户确定。 |
| 量子力学经典论文 | 提供六篇原始论文的图，保留原题、正式发表年和原始出版页；概念阅读线索与实际引用关系明确区分。 |
| PPT 联系 | 已实现按页面集合顺序生成多页 PPTX，卡片文本、框和连接线保留为可编辑对象，fig 作为媒体资源；无分页时保持整图一页。页面面板可直接放映，整图 SVG/PNG 继续作为图片出口。PPTX 当前仅做包结构及内容测试，字体、fig 和编辑兼容性尚未在 PowerPoint 实开验证；不包含 PPT 导入或双向同步。 |
| 继承关系权重 | 当前关系详情保存 `paperstreamStyle.weight`，取值 1–5，表示用户人工权重；它独立于连线 `strokeWidth` 和论文节点边框。不能从年代、引用数或线宽反推因果强度；新增 `paperstreamRelation.type` 与多行 `evidence` 记录关系类别和可核对依据；权重可留空表示未评估，可显式一次性映射当前边线宽，之后继续独立。当前不自动计算引用或因果强度。 |
| 一点打开原文 | 卡片直接提供原文入口，保持 HTTP(S) 校验。DSH 本地连接通过认证的 `/paperstream/open-url` 调用宿主系统默认浏览器：macOS 为 `open`，Linux 为 `xdg-open`，URL 作为独立参数传递；远程连接拒绝该本机操作，Windows 暂明确返回不支持。另保留普通浏览器链接，不能把新标签页描述为系统默认浏览器已打开。 |

## DeepH 领域为何适合示范

DeepH 团队的[官方文档](https://docs.deeph-pack.com/deeph-pack/en/latest/)将项目定位于学习电子结构和哈密顿量的神经网络方法，并引用 2022 年原始方法论文。这里选用 DFT 的两篇基础论文与 DeepH、DeepH-E3，组成四篇阅读路线；这不是该项目截至今日全部版本的清单。

- [Inhomogeneous Electron Gas（1964）](https://journals.aps.org/pr/abstract/10.1103/PhysRev.136.B864)：以基态密度组织多体问题的理论基础。
- [Self-Consistent Equations Including Exchange and Correlation Effects（1965）](https://journals.aps.org/pr/abstract/10.1103/PhysRev.140.A1133)：建立含交换关联效应的自洽计算框架。
- [Deep-learning density functional theory Hamiltonian for efficient ab initio electronic-structure calculation（2022）](https://www.nature.com/articles/s43588-022-00265-6)：学习结构与局域 DFT 哈密顿量之间的关系；原题和年份也与官方文档交叉核对。
- [General framework for E(3)-equivariant neural network representation of density functional theory Hamiltonian（2023）](https://www.nature.com/articles/s41467-023-38468-8)：显式纳入等变要求，适合与原 DeepH 的坐标处理方式作方法对照。

这类领域同时包含理论基础、模型设计和物理约束，因此适合用 paper、note、共享关系和 fig 分开记录。这个适配判断是基于上述资料的产品推断，并非 DeepH 团队对 Paperstream 的认可或合作声明。

可审阅的演示文案：

> 读 DeepH 时，怎样同时记住 DFT 基础、学习的哈密顿量以及网络的对称性？Paperstream 把原文入口、自己的要点和方法联系放在一张可编辑图上。沿竖向阅读路线理解背景，用 note 留下疑问，再把关键 fig 放在对应卡片旁。整理完成后，把图带进组会展示。

建议以四篇图加一次手工编辑的短演示开始：点开原文、补一条要点、拖出关系、插入自己的示意图、导出组会材料。尚未对外发布，也没有发给 DeepH 项目人员。

## 量子力学经典论文

已通过 `CanvasGraph` 创建 [quantum-foundations.canvas](../../examples/quantum-foundations.canvas)，包含以下六篇。年份均为原始正式发表年，未用现代重印、翻译或网页更新时间替代。

| 论文 | 年份 | 阅读关注点 |
| --- | --- | --- |
| [Heisenberg: Über quantentheoretische Umdeutung kinematischer und mechanischer Beziehungen.](https://link.springer.com/article/10.1007/BF01328377) | 1925 | 从可观测跃迁量出发建立量子描述。 |
| [Schrödinger: Quantisierung als Eigenwertproblem](https://onlinelibrary.wiley.com/doi/10.1002/andp.19263840404) | 1926 | 此处明确为第一篇，361–376 页；本征值问题与能级。 |
| [Born: Zur Quantenmechanik der Stoßvorgänge](https://link.springer.com/article/10.1007/BF01397477) | 1926 | 从散射过程理解量子态与跃迁。 |
| [Dirac: The Quantum Theory of the Electron](https://royalsocietypublishing.org/doi/10.1098/rspa.1928.0023) | 1928 | 电子的相对论性方程；原出版页本次抓取受限，已与[莱顿大学保存的原出版 PDF](https://wwwhome.lorentz.leidenuniv.nl/~boyarsky/media/Proc.R.Soc.Lond.-1928-Dirac-610-24.pdf)交叉核对。 |
| [Einstein–Podolsky–Rosen: Can Quantum-Mechanical Description of Physical Reality Be Considered Complete?](https://journals.aps.org/pr/abstract/10.1103/PhysRev.47.777) | 1935 | 将实在性判据与描述完备性的论证分开。 |
| [Bell: On the Einstein Podolsky Rosen paradox](https://journals.aps.org/ppf/abstract/10.1103/PhysicsPhysiqueFizika.1.195) | 1964 | EPR 问题、局域性和理论约束之间的联系。 |

图中“方法对照”“阅读线索”和“问题联系”是整理者提供的概念组织。它们不表示完整引用图；没有编造引用次数、论文重要性分数或定量继承权重。[deeph-reading.canvas](../../examples/deeph-reading.canvas)遵循同一原则。
