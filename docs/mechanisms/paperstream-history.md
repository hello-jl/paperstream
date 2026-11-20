# Paperstream 历史选型、旧规范与验收档案

> [!NOTE]
> 本文档归档 Paperstream 早期调研、已退居历史档案的 Mermaid 规范以及各阶段逐轮开发验收记录。
> 当前有效的模块架构、JSON Canvas 格式约定、Agent 自部署流程与宿主适配边界请查看 [当前架构与设计文档](paperstream-design.md)。

## 深度学习脉络图重构：三脉汇流与曲线韵律（2026-11-21）

为消除原先 `examples/deep-learning-history.canvas` 4×4 等距方格与折返折线的生硬观感，经 `paperstream.CanvasGraph` 将该示例重构为 100% 连通、零交叉的三脉汇流长卷（15 张卡片 · 15 条曲线边）：保留 `Backprop (1986)`、`LeNet (1989)`、`AlexNet (2012)`、`ResNet (2015)`、`LSTM (1997)`、`Seq2Seq (2014)`、`Transformer (2017)`、`GPT-3 (2020)`、`DDPM (2020)`、`InstructGPT (2022)` 10 篇核心文献与 6 份 CC 肖像／3 张 MIT 自绘原理图，用 `VAE (2013)`、`ViT (2020)`、`LDM (2022)` 三篇桥梁工作替代原本孤立无连线的 4 个支线节点，形成“反向传播起点 → 视觉表征（苔绿）／序列与大模型（青蓝）／深度概率生成（灰蓝） → 汇流并分光于 Transformer”的单向曲线韵律图。

调整 `scripts/history_portraits.py`（在 `deep-learning` 家族仅保留 3:4 肖像取景、不回写旧网格坐标与折点，`computing` 家族保持原样不变）、`scripts/create-deep-learning-history.py`（全量更新节点、边证据 `paperstreamRelation.evidence` 与筛选 `portraitRights`），以及 `scripts/export-canvas-images.mjs`（支持 `PAPERSTREAM_EXPORT_STYLE=curved`）。通过 `CanvasGraph.load` 写回 `examples/deep-learning-history.canvas`，与 `create-deep-learning-history.py` 全新生成及 `create-computing-ai-history.py` 复现比对完全一致；调用 Paperstream `exportGraphSvg(..., { connectionStyle: 'curved', padding: 36 })` 导出 `3120×1317` SVG 并以 Inkscape 栅格化为 `3000 px` 宽 [deep-learning-history.png](../assets/deep-learning-history.png)，视觉复核通过后同步 `README.md`、`README.en.md` 与 [深度学习来源表](../research/deep-learning-history-sources.md)。

## 标准 MCP Apps：对话内画布与语义工具（2026-11-17）

新增独立 `mcp/` 适配器，保留 Codex 文件面板与 Claude Code Skill／本地网页两条原有接入。标准服务器通过 stdio 运行，使用 MCP SDK 与 ext-apps 注册 `ui://paperstream/standard-canvas-v1`；界面复用嵌入编辑器和 ResourceSession，通过 `app.callServerTool` 读写，不要求 Shell、HTTP 编辑器或 `openai/resource`。前端也不依赖账户受限的 `app.registerTool`。Claude 官方已提供 Desktop 本地 stdio MCP Apps 示例，不能由旧插件缺少 MCP Server 推断普通 Desktop 对话完全不支持画布；安装方式与账户边界见 [MCP 接入指南](../../mcp/README.md)。

模型可调用 `paperstream_list_canvases`、`paperstream_open_canvas`、`paperstream_read_graph`、`paperstream_apply_changes`；完整 JSON 的 `paperstream_read_canvas`／`paperstream_write_canvas` 仅向 app 暴露。读图保留原生节点、Note、论文正文、边、布局和未知字段，但省略图片源，不可据此重建整图。语义修改限定为七种定点操作，批次一次校验保存；不向模型开放删除、整图替换或任意路径。普通 Note 正文仍由画布手工编辑。

文件必须在启动时逐个通过 `--file` 明确选择，随后仅使用固定 fileId。服务器拒绝符号链接，检查父目录身份；Python 标准库 worker 重新加载完整 CanvasGraph，按读取时的 SHA-256 revision 写入，继续使用协作锁与原子保存。旧 revision、持锁、无效批次及只读写入均拒绝；冲突不自动重试或删除其他写入者的锁。UI 的未保存草稿不在磁盘工具视野中，交接前保存，外改后刷新；不承诺跨宿主实时刷新或自动合并。

构建产物 `mcp/dist/package/` 包含内联页面、打包服务器、Python 包和完整许可，运行时无 npm 依赖目录。以实际 bundle 输入更新第三方清单，保留全部 32 个依赖版本的许可原文。验收包含真实 stdio 握手、工具可见性与 UI 资源、语义事务、两次旧版本冲突、未知字段／图片／数组顺序保留，以及含空格目录、独立工作目录、无 node_modules 的便携包启动。

最终自动检查：Python 106、前端 217、标准 MCP 18、DSH 18、Codex 23、Claude Code 16 项，共 398 项通过；Web／DSH／Codex／Claude Code／标准 MCP 五端构建及 DSH 分发检查通过。分发检查核对许可字节一致性，未将构建成功计为实际宿主交互通过。

官方 AppBridge 本地参考宿主已实际验证卡片编辑保存、干净状态接收外改、保留草稿、连续两次冲突不覆盖磁盘及脏状态拒绝切图。慢读时的原生确认弹窗未完成手动验收，仍由已有 ResourceSession 自动回归覆盖。没有真实 Claude 账号，因此账户授权、Claude 内嵌显示及剪贴板未实测；参考宿主不作为 Claude 真机通过的证据。云端 claude.ai 也不能直接运行这份本地 stdio 配置，本轮没有实现远端 HTTP／OAuth 部署。

## 历史画布中的人物与原理（2026-11-17）

按用户要求，三份历史画布不再以 Dario 的照片代表 GPT-3 或 Claude。计算机总史与连续版在 `gpt3_2020`、`claude_2026`、`transformer_2017`、`alphafold3_2024` 使用上下文学习、通用 Agent 循环、单头自注意力和条件扩散去噪示意；深度学习图在 `dl_gpt3_2020`、`dl_transformer_2017` 使用同图，并为 `dl_resnet_2015` 补入残差相加示意。早期人物肖像继续保留。五图以可编辑 SVG 自绘，再渲染为 900×500 PNG 内嵌，保持自然横向比例；来源、简化边界与 MIT 归属见 `assets/history/principles/manifest.json` 及两份历史来源表。

先通过原生宿主保存当时未保存的草稿，再用 CanvasGraph 定点替换插图和相关说明、署名，保留所有节点 ID、坐标尺寸、边及未知字段，连续版用户调整过的 Mauchly 图片宽度 26% 保留。计算机两图各为 12 张照片加 4 张示意图；深度学习图为 11 张照片加 3 张示意图。两份生成器同步复用 `history_illustrations.py`，临时目录整图复现通过；重新生成公开 PNG/SVG 和混排海报并实际查看，静态海报不会被当作新的编辑器布局能力。

## 图片取景与卡片导出边界（2026-11-14）

审查历史图发现：旧版仅按 `widthPercent` 统一宽度，纵横比不同的照片仍有不同高度；全身照与横图的脸部大小差异更大。历史样例又使用固定高度，部分年份底距被挤占。前端会以自然内容撑开可视边框，离线导出却仍画原高度，短卡因此可能出现图、图注或年份在边框外的情况。

新增可选 `figure.frame`（宽高比、cover／contain、横纵位置、1–4 倍缩放）和 `align`；默认原图不裁切，不把未知的旧 `aspectRatio` 字段升格。UI 和 SVG 共用投影矩形、圆角裁剪与可逆取景，完整显示使用浅色衬底；居中图注占整卡宽度，尺寸手柄按整卡内宽计算，居中／靠右各自补偿拖动方向。详情提供原图、方形、3:4 肖像和完整方形，以及对齐、上下取景和缩放。原图与归属数据保留；普通宽度／图注编辑不覆盖未知取景字段。

导出内容内宽与顶部位置扣除真实边框粗细；普通短卡按内容最小高度撑开导出边框，年份贴住新边框内部右下角，连线端口及避让也使用该可视高度，不回写源文档或重排坐标。共享关系节点继续保留显式路径几何。缺尺寸的旧嵌入图读取真实图片头；JPEG 的 EXIF 5–8 方向交换宽高，TIFF 偏移／数量有界解析，已有解码尺寸不重复旋转。

验证：217 项前端与 93 项 Python 检查通过，Web／DSH／Codex／Claude 完整构建通过，DSH 注册 5 项通过。独立审查实际用带旋转标记的 JPEG 验证 HTML 与 SVG 同向。真实 Chrome＋DSH 0.2.2-rc.1 在 API 创建的独立历史图副本中验证：头像宽度由 30.68% 鼠标拖至 45%，原图／3:4 切换、取景滑块及保存成功；磁盘回读为 45%、3:4、zoom 2、positionY 49，原图字节、文字、归属及其余图片保留。未操作原有草稿，不把本轮局部交互扩大为全部宿主验收。

历史图新版：通过 CanvasGraph 读取并定点修改 `computing-ai-history.canvas`（18 卡／12 边）与 `deep-learning-history.canvas`（17 卡／8 边），保留原 ID、数组顺序、历史正文、关系标签和依据。29 张肖像统一为 108×144 的 3:4 框与整卡居中姓名，逐图取景；调整主题卡高、行距、说明卡位置及深度学习图的原有折点／标签位置。ResNet 仍保留缺肖像说明。Abbeel 使用同作品 960×709 缩略图，Christiano 使用同一截图 893×890 原档，源页与原许可不变；Sutskever 未裁原作没有更多人脸像素，保留原裁剪图及清晰度限制。源照片不作本地裁切，各 figure 分别保存源文件修改记录与 `displayChanges`，归属文档明确导出图包含展示裁剪。

两份生成器调用共享 `scripts/history_portraits.py`，临时目录生成与已保存图逐字段相等，重复输出拒绝覆盖；API 回读与原文档比对确认只有上述范围改变。导出检查全部图片、图注、正文和年份位于卡片内，29 个框等大，年份保持底距，八个完整关系文字框均不碰卡片。真实 DSH 回读发现旧标题卡少约 2 px，现留足标题高度，重载后保持已保存状态。PNG 为 3000×2867 和 3000×2953，SVG 内嵌原图，实际查看通过；完整来源见两份历史来源表。

另增加紧凑分享海报 `computing-ai-history-poster-v2`：四行横向卡片，左侧固定 112×149⅓ 肖像框，右侧标题与摘要，年份贴卡片右下角。`scripts/export-history-poster.mjs` 通过 `show --raw` 读取已保存的完整文档，沿用原照片、取景参数、正文、来源链接和可见署名；仅调整静态海报构图，不写回 Canvas，也不改变编辑器布局。复现命令见 [历史来源表](../research/computing-ai-history-sources.md#紧凑海报版2026-11-14)。SVG 为 2560×1820，PNG 为 3200×2275；16 张肖像、12 条时间顺序线及源文件字节保持核验通过，两人分别实际查看排版，无内容遮挡或裁切。

按用户进一步澄清，交付实际可编辑的 `examples/computing-ai-history-connected.canvas`，由 `scripts/create-connected-ai-history.py` 加载完整原图并通过 CanvasGraph 新建保存。仅修改标题阅读说明，追加 `time_row_1_to_2`、`time_row_2_to_3`、`time_row_3_to_4`，形成 16 个里程碑／15 条连续时间边；行间线从末卡底部穿过空隙接下一行首卡顶部，折点保存于 `paperstreamStyle.waypoints`。保留原 18 卡、12 边、照片、取景、归属与未知字段，原文件字节不变。实际在应用内浏览器的单文件桥打开，确认卡片／边数量、跨行路径、双击简称进入输入框并取消，以及详情中的图片宽度／对齐／取景控件。原生文件面板的打开请求返回 queued，未将其记为本轮原生渲染验证。头像仍在正文下方，随卡片移动但不支持卡内任意拖放；静态海报的左右排版不是现有运行时能力。

## 架构图：图形操作与 command（2026-11-14）

架构图改用面向使用者的图示：人工侧为箭头点击、抓手拖动、键盘输入和文本框中的 I 型光标；agent 侧为 DeepSeek、GPT、Claude 社区拟人的 Q 版大头头像。只在 agent 与文件之间的双向通道标记“command”，人工通道保留“打开／保存”；主标为“人用画布，AI 用命令”。这里指 Paperstream 的本地操作命令，宣传口径与 README 同步，技术指南、API 参考及现有 Python API／CLI 的实现不改名。头像是用户自有 agent 的示意，不表示内置模型选择器或提供模型账号。

中央独立 `research.canvas`、JSON Canvas 结构、内嵌图与迁移去向继续保留。图形与文字在可编辑 SVG 中维护，三头像由内置 imagegen 生成透明素材，并作为 data URL 内嵌，让单个 SVG 可独立分享。素材的完整提示词、生成记录与社区角色来源链见 `docs/assets/paperstream-agent-avatars-prompt.md`；角色设定仍不由项目 MIT 许可证重新授权。图中只表达已保存文件的读取与修改交接，切换操作前先保存，写回时检查版本。

按用户对头像风格的进一步要求，先检索并实际查看 ZipZipPipe 的“小 AI”归档静帧、ApprenTice 已发布的大头 Q 版派生图与社区“头顶不锈钢盆”梗图，再以这组现成设定作参考统一头像：圆脸、大头、极少领口，保留蓝发鳍耳、银白龙角、橙发日芒饰；肥鱼必须顶着倒扣的不锈钢小盆。作者初版“小 AI”与后来的二头身派生图分别记录，不称为唯一官方 Q 版。原参考仅保存在忽略的本地目录，不把下载图作为项目原创分发。

已实际查看最终架构图与透明头像；SVG 内嵌头像字节与源 PNG 一致，导出尺寸为 2560×1800，图中文字未残留 API 标签。84 个本地链接／锚点和代码围栏检查通过；四端分发目录的许可声明已同步，Claude 包重新构建，ZIP 完整且声明字节一致。本轮仅修改素材和文档，未改画布文件或运行时代码，不作为新一轮宿主交互验收。

## 宣传图的简化结构示意（2026-11-14）

用户要求将黑板 ENIAC → Backprop 的标签由“compute”改为“learn”、Backprop → AlexNet 由“learn”改为“deepen”，并改进 ResNet、Transformer 卡片内的示意。保留 v3 的人物、自然表情、课堂构图及其他文字，以内置 imagegen 局部编辑生成 v4，README 与第三方来源记录指向同名生成说明。

科学图示按原论文缩减：ResNet 展示两层主路、绕过它们的 identity 旁路和单一求和点；Transformer 明确标为 Encoder，展示 Self-Attn、Add & Norm、FFN、Add & Norm 及两个子层的残差路径。仅作为小尺寸宣传示意，不画成完整模型；省去 ResNet 的 BN／ReLU 和 Encoder 外的 decoder、embedding、Q/K/V 等细节。结构核对依据为 ResNet 原论文 Fig. 2／§3.1 与 Transformer 2017 会议版 Fig. 1／§3.1。历史画布的数据和技术关系不因宣传图标签调整而改写。

共三轮定点编辑：替换标签和结构图、澄清 Encoder 主干及两处旁路分叉、把外部“residual links”线与标签移至卡片下方绿底，避免压住卡片边缘。Transformer 卡片为可读性略增高，已实际查看模块顺序、箭头、词语、年份、人物和避让结果；最终图为 1672×941。README、v2–v4 记录的本地链接与标题锚点检查通过。同步第三方来源路径后，四端完整构建通过，各分发目录的 LICENSE／第三方许可字节一致，Claude ZIP 完整且声明一致。本轮仅更新宣传素材与文档，未更改画布或编辑器实现。

## README 的阅读叙事（2026-11-13）

按用户反馈重写首页：从论文之间的联系容易散落这一阅读体验切入，说明卡片如何留下认识、关系如何表达具体判断，再以已核对的 AlexNet／ResNet／Transformer 关系举例。补入从初读、精读、比较到回顾交流的实际过程，解释人手工组织与 agent 根据任务整理的交接方式，以及独立 JSON 文件带来的保存与迁移。保留真实界面截图、架构图、样例与 MIT 许可；不把编辑器宣传为自带模型或自动查证论文的产品。

将原首页中的细致操作、快捷键、图片边界、文件服务、API／CLI 示例、MCP 职责、宿主验收与开发命令合并到 `docs/guide.md`，首页通过相应锚点进入，避免用协议与测试记录打断理念介绍。README 与指南由独立 agent 审读，文件链接、标题锚点和代码围栏检查通过；未改运行时代码或宿主配置。

宣传图按新反馈从 v2 编辑为 v3：DeepSeek 面向课堂自然讲解，GPT 睁眼托腮、会意微笑，Claude 持书看向老师；让三人的视线与表情对应同一堂课，移除无缘由的夸张大笑。黑板同时补入 AlexNet → ResNet 的“train deeper”和 ResNet → Transformer 的“residual links”，后者经卡片下方 U 形连线指向 Transformer，避免暗示 ResNet 提出了注意力。已实际查看三人、视线、文字及连线；README 选用 v3，保留旧图与角色来源链，完整提示词见 `docs/assets/paperstream-classroom-promo-v3-prompt.md`。第三方角色设定仍不属于项目自有 MIT 授权范围。

## 历史关系的机制与依据（2026-11-13）

按用户要求细化深度学习样例：先由 `show --raw` 读取完整图，在同一个 CanvasGraph 实例中将 `dl_alexnet_to_resnet` 标签改为“残差学习，缓解退化”，新增 `dl_resnet_to_transformer`（`dl_resnet_2015` → `dl_transformer_2017`）“沿用残差连接”，再用 `set_document` 补入现有 `paperstreamRelation.evidence` 约定支持的长说明、类型与原文链接。前者概括视觉网络加深后的优化挑战，省略 VGG 等中间工作；后者依据 Transformer 2017 会议版 §3.1 明确引用 ResNet 的残差连接，表达组件复用。注意力路线继续由 Seq2Seq → Transformer 表达，未把 ResNet 归因为注意力的提出者。

一次校验与保存后重新加载，对比确认全部 17 张卡片、肖像、坐标尺寸、原边数组顺序、其余六条关系与根扩展完整保留；总关系由 7 条增为 8 条。新增路径放在行间空隙，沿用原布局。同步生成脚本与来源说明，临时目录再生成结果与现有样例整图相等，拒绝覆盖已有输出。Python 93 项检查通过；8 个完整标签框与 17 个卡片矩形无交集，导出 3000×2655 PNG 与自含 SVG 并实际查看。本次未修改编辑器实现或用户未保存的宿主草稿。

重看 PNG 时发现本地 resvg 2.6.2 不支持 `auto-start-reverse`，会把垂直箭头也画成朝右。仅在 `scripts/export-canvas-images.mjs` 栅格化前为本导出器的 `arrow-N` 标记生成兼容副本：终点使用 `auto`，起点克隆并绕连接点旋转 180°，允许标记超出原 viewBox，避免双向箭头被裁剪；未识别结构保持原样。四方向及双向最小实验实际查看通过，两份公开历史图均重导出：计算机图只有横向单箭头，PNG 字节未变；深度学习 PNG 的上下箭头已修正。原 SVG 与 Canvas 字节均未改，不影响浏览器原生导出或产品 UI。

本轮收尾：README、指南、两版插画记录与关系来源的 65 个本地链接／锚点及代码围栏通过检查。同步新插画来源声明后，Web、DSH、Codex、Claude 四端完整构建通过，8 项分发许可／便携包检查通过。未把静态图与打包检查记作新一轮真实宿主 UI 验收。

## MIT 许可与文件架构（2026-11-13）

维护者明确选择 MIT。根 `LICENSE` 使用标准完整文本，版权声明为 `2026 Paperstream contributors`；web、DSH、Codex、Claude 的 npm metadata 与已有锁文件、Claude 插件清单同步声明 MIT。各端构建将根 LICENSE 由可选资料改为必需输入，分发完整文本并核对字节，不以 package metadata 替代许可原文。第三方依赖、人物肖像、社区角色设定等继续保留各自归属和许可，不因项目选择 MIT 改变。

README 新增 [架构图 SVG](../assets/paperstream-architecture.svg) 与 [PNG](../assets/paperstream-architecture.png)：人通过 React Flow 可视编辑器手工操作，AI 通过 Python API／CLI 按稳定 ID 操作；两种入口分别读写同一份独立 `.canvas` JSON 文档，平台接入负责实际打开与保存。图文件可复制、备份、用 Git 管理或迁移到其他电脑／宿主，不依赖云端数据库。内嵌图片随图迁移，本地文件引用需一并携带；其他 JSON Canvas 工具不保证同样渲染论文表单、图片扩展。宿主偏好不属于图文件。架构图表达已保存文件的交接，不承诺共享 UI 草稿、实时共编或自动合并。

许可验证：四端完整构建通过；DSH 18 项检查与 verify-build、Codex／Claude 5 项打包回归通过；Web、DSH、Codex、Claude 的 LICENSE、第三方声明与许可原文字节一致；Claude ZIP 完整且许可证一致，DSH npm pack 清单包含 LICENSE。Claude 官方 CLI strict 清单验证成功，只有非阻塞的目录头像建议。本次只调整许可与文档，没有改变 UI 或图文件，未推送或发布。

架构图使用可编辑 SVG 源文件，并以已有本地 resvg 工具导出 2560×1800 PNG；已实际查看，核对双向读写箭头、文本边界和迁移说明。SVG/XML、可访问标题与描述、PNG 尺寸、README／机制／交互审查的本地文档链接检查通过；同步删除交互审查中“未选择许可证”的过期描述。

## 宣传与历史画布（2026-11-13）

新增两份可编辑样例：`examples/computing-ai-history.canvas` 为 1946–2026 的 16 个精选里程碑，加两张范围/来源说明卡；`examples/deep-learning-history.canvas` 从 Hinton 参与的 1986 年工作出发，含 14 个论文节点和三张说明卡。全部创建、后续修正与保存经过 CanvasGraph；复现脚本 `scripts/create-computing-ai-history.py`、`scripts/create-deep-learning-history.py` 拒绝覆盖已有文件。历史年份对应所链接版本，ResNet 明确区分 2015 预印本与 CVPR 2016；时间相邻不表示直接继承。当前模型只列已核实的官方发布例子，不承诺完整或最新排行榜。

肖像以 data URL 置入已知 figures 格式，来源、摄影者、许可链接和改动说明作为扩展字段随图保留；对应原图与 manifest 在 `assets/history/`。计算机图 16 次照片引用、深度学习图 13 次引用；ResNet 作者没有核实到可再分发头像，明确保留缺项，不借用不相关人物。两份 `docs/research/*history-sources.md` 记录逐项来源与肖像许可，导出图须与对应来源表一起分发；不能把这些照片当作项目代码许可证覆盖的素材。历史人物照片也不表示其为项目背书。

`exportGraphSvg` 是当前编辑器的原导出 API。新增 `scripts/export-canvas-images.mjs` 只读取已保存文档，调用同一 API 生成自含 SVG；可选从明确路径加载本地 resvg 2.6.2 转成 3000 px 宽 PNG，在分配前检查 3200 万像素预算。resvg 仅装于忽略的本地工具目录，不增加产品或 Python 运行时依赖。示例命令：

```sh
npm install --prefix .local/history-renderer --no-audit --no-fund @resvg/resvg-js@2.6.2
node --experimental-strip-types scripts/export-canvas-images.mjs examples/computing-ai-history.canvas docs/assets/computing-ai-history .local/history-renderer/package.json
node --experimental-strip-types scripts/export-canvas-images.mjs examples/deep-learning-history.canvas docs/assets/deep-learning-history .local/history-renderer/package.json
```

导出 SVG 分别含 16/13 张内嵌照片，PNG 为 3000×2673 / 3000×2655。逐项图片数据与 provenance 检查通过；两图全部关系标签对卡片矩形无交集，深度图中两条横向说明简写为“反传训练”“自回归”，长说明留于来源文档。已查看整图，Python 93 项回归通过。用户可直接在 Paperstream 中继续修改原 `.canvas`，导出不是单独维护的另一份图数据。

宣传图首稿为自行设计的三位角色，用户指出不符合已有社区形象，已停止用于 README。第二版先实际检索与查看参考图，再用内置 image_gen 生成新课堂构图：DeepSeek 蓝长发、鱼鳍耳、蓝白女仆与鲸尾；GPT 银白龙角/翅尾与白紫礼服；Claude 橙长发、日芒花饰、米白橙黑长裙和书本。角色设定追溯至 ZipZipPipe，DeepSeek 另保留上善无形的来源链。参考原图只在忽略目录供生成使用，没有复制到版本库。最终选择 `docs/assets/paperstream-classroom-promo-v2.png`，完整提示词、来源和第三方角色边界见同名 `-prompt.md`；不把社区角色写成 Paperstream 原创或公司官方形象。README 使用新插画作封面，并保留真实界面截图及历史样例入口。

## 开源前验收（2026-11-13）

当前发布准备以实际测试与可重复构建为依据，不把所有平台都标成完成。完整自动检查：Python 93、web 204、DSH 18、Codex 23、Claude 16 项，共 354 项；各端构建与类型检查、Python/TypeScript 往返通过。新增 DSH 许可包完整性与两端便携 Skill/CLI 回归；Claude 验收直接解压 ZIP 到含空格临时目录，再执行 CLI 和真实 HTTP 读写／409 冲突，检查 ID 与未知字段保留。

| 范围 | 本轮实际验收与边界 |
| --- | --- |
| Codex 原生文件面板 | 使用独立 `.local/chatgpt-acceptance-20261113.canvas` 副本，详情即时修改简称，撤销恢复干净原文、重做、通过宿主保存，Python API 从磁盘回读确认；干净状态外部 API 修改后自动刷新；有草稿时外改，连续两次保存均提示冲突且外部文件 SHA-256 不变，本地输入保留。撤销本次草稿后自动接收外部版本，结束为干净状态。未知扩展含 `1e-7` 在合法保存后保留。原既有另一面板与未保存排版未动。本轮补齐 Codex 会话原生链路，不扩展到所有 Chat/Work、平台或宿主版本。 |
| DSH Web | 在独立第三页签新增论文 A/B、Note、共享标签；原两份草稿保留。逐字输入 `a → abcdef → abcdefgh` 完整保留；空说明连线、正向改双向开放箭头、关系线 6 px 与论文边框 4 px 独立；PNG 剪贴板成功添加且无文件名，宽度 100→50%，实际鼠标拖到 34%，卡片随之收缩；两个论文分别连向一个共享标签，3 边；智能竖排、夜间／曲线及恢复苔绿／圆角、附近过滤后搜索 Note 恢复全图通过。选中时滚轮使 viewport scale 0.781→0.1，未改线重；菜单 PNG/SVG 返回已导出，本轮未重新解析下载文件，历史真机下载验证与自动导出回归仍保留。构建时宿主热卸载回到 Conversation，重新进入后本轮草稿完整恢复。 |
| 普通浏览器本地桥 | 从 examples 通过 CanvasGraph 创建独立副本 `.local/release-demo/papers.canvas`，实际智能竖排、保存，得到 README 截图 `docs/assets/paperstream.jpg`；图片内容只有公开论文资料。上一轮简称编辑、外改读取及重复冲突磁盘保护仍按原记录有效。 |
| Claude Code | 官方 CLI 严格清单校验、隔离本地安装通过，打包/运行与原始版本拒写通过。没有 Claude 账号，真实会话的技能发现／权限交互与桌面 Browser 内运行仍无法验收，不冒充通过。 |

本轮证据：`.local/release-native-saved-20261113.jpg`、`.local/release-native-conflict-20261113.jpg`、`.local/release-dsh-verified-20261113.jpg`；仅公开展示截图提交仓库。未解决的原生 ResizeObserver 循环告警保留诊断，未用静默拦截掩盖；未将局部成功推广为大图、其他系统、DSH Desktop 或全部输入法流程完成。

Agent 发布资料：完善仓库 AGENTS.md，新增可分发 `skills/paperstream/` 和 API reference；官方技能格式校验、真实 API 操作与独立 agent forward test 通过，完整对比保留原布局、Note、未知字段和数组顺序。Claude/Codex 包含技能与 Python 启动器；Codex UI 仍只需 Node，agent CLI 另需 Python，默认不允许把原生 HTML 用作 HTTP 界面。现有 MCP 只有 app-only UI resource／文件入口，没有通用语义编辑工具；首发继续用 API/CLI 作为本地 agent 改图内核，理由与未来 MCP 最小边界见 [交互审查](../research/agent-interaction-audit.md)。

发布许可：按实际 bundle 输入核对 26 个依赖版本，保留原始许可、ELK source notice 与 npm 漏带的上游归属。Web、DSH、Codex、Claude 产物都复制根第三方声明和完整 licenses；DSH prepack 检查字节一致，npm 包清单确认包含全部许可资料。项目现按维护者选择采用 MIT，完整许可与分发检查见本页“MIT 许可与文件架构”；未公开发布。

## 当前实现：Canvas、独立界面与 DSH 面板

用户确认：复用 DSH 已有 React，以 React Flow 提供拖动、缩放和连线；论文卡片显示 alias、takeaway 与可选 fig，完整原题 name、url、year 在就近详情浮层编辑；另有 Note 和共享关系标签。边可显示 relation，也可只保留连线；支持只看选中卡片附近的关系；原文点击打开，不为每张卡片嵌入 PDF 或加载原文网页。不依赖 Obsidian，保留文件独立与 agent 通过 API 操作的要求。

实现分为三部分，均可单独检查：[Python Canvas API](../../paperstream/canvas.py)、[React 编辑器](../../web/src/Editor.tsx)、[DSH 接入](../../dsh/README.md)。React Flow 负责通用交互；项目只做论文字段、公开 Canvas 格式的转换和文件保存。DSH 面板与独立编辑器复用同一个组件，不另起一套桌面运行时。当前已在官方 npm 包 DSH 0.2.2-rc.1 的 Web 宿主中运行，兼容范围仍严格限定该版本。

数据以一份 `.canvas` 为主。每个论文为标准 `type: "text"` 节点，text 是 Markdown 的 json 代码块，内容为 `{ "paperstream": 1, "name": null, "alias": "简称", "takeaway": "核心认识", "url": null, "year": null }`。其中 paperstream 的数值 1 表示本项目论文模板第一版；六个业务字段只保存一份，关键资料不依赖 JSON Canvas 未定义的私有节点字段。其他编辑器会显示这段代码块，不会自动提供本项目的紧凑论文卡片。边的 `label` 直接表示 relation，坐标与尺寸使用标准属性。依据：[JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/)。

Python `CanvasGraph` 提供 create/load、论文与关系增删改、move_node/resize_node、clear_node_fields、to_dict/to_json/set_document 及 save。标准库运行，无需 React 或浏览器。CLI 按 `.canvas` 后缀选择新 API；`export-canvas` 单向转换旧 `.mmd` 为新文件，保留 ID 与原档案，目标存在时拒绝覆盖。[ResNet Canvas 样例](../../examples/resnet.canvas) 已由 API 从真实论文旧样例转换，初始坐标也通过 API 修改。新 Canvas 自动 ID 使用随机 UUID 的 32 位十六进制表示，不按增删重排；旧编号不改变。

本轮工作台改造的逐项取舍、DeepH 演示文案与量子力学原始论文来源见 [需求分析与研究样例](../research/feature-analysis.md)。下面记录已接入代码的机制；本轮新增交互的真实 DSH 验证范围另列，不沿用上一轮的测试结果冒充全部新功能通过。

工作台与布局：顶部为 Paperstream、文件页签和简约操作入口，搜索、局部视图、卡片/边计数与保存状态位于底部 statusbar。每个页签拥有独立 Editor 和 React Flow provider，切页保留各自文件句柄、撤销和输入状态；关闭脏页签需要确认。页签清单、文档草稿和可恢复的文件关联保存在 IndexedDB，恢复不等于自动获得文件写入权限。

“智能竖排”使用 ELK Layered 联合计算节点位置、正交折点和在线标签，方向向下；测得的标签尺寸参与布局，尚未渲染的标签使用保守估计。算法处理环、平行边和自环，减少交叉并留出间距，不承诺任意图完全无交叉。显式执行会替换手工位置与折点，可以撤销；执行后保持手动布局，不因输入正文而突然重排整图。异步计算前复制文档，返回时检查组件是否仍挂载、文档是否仍是同一版本，避免覆盖新编辑；原 ID、数组顺序、卡片尺寸、语义与未知字段保留。节点位置四舍五入为 Canvas 要求的安全整数，边几何保留小数精度。

2026-11-13 标签避让性能：对已经可放置的路径种子计算评分上界，候选与锚点的距离超过该上界时提前剪枝；保留原排序和同分坐标优先级，极大有限坐标走原回退。拥挤 500 卡片/500 标签的本机 Node CPU 基准由约 663 ms 降至约 125 ms，6 个规模场景及 100 组固定种子布局逐坐标一致；这不是浏览器帧率或实际容量承诺。`node --experimental-strip-types web/scripts/benchmark-label-layout.ts` 可复测当前算法；传入旧模块文件路径可比较布局与耗时。新增拥挤负坐标、同分边界和极大坐标回归通过。

2026-11-13 共享标签跟随复查：端点逐像素往返移动时，分别取整每次相对位移会累计偏移；改为对新旧绝对质心取整后求差，负坐标、奇数尺寸、连续移动与一次移动结果一致。连续文字编辑在合并撤销步骤前也统一跟随标签与端点，标签增宽时清除受影响的旧 ELK 绝对折点，避免保留过期线路。15 项关系测试、前端与 DSH 构建通过；真实 DSH 验证共享标签连续增长到 280 px 后，线路仍连接其新边界。未把该局部验证当作所有复杂图布局通过。

ELK 生成的路径标记为 `paperstreamStyle.routeSource: "elk"`。端点移动、尺寸变化或改接时，仅清除受影响的自动折点与标签位置，让当前渲染重新计算；包括自动跟随的共享标签所连接的线路。手动编辑标签或折点后移除该来源标记，保留人工路径，不把样式调整误当作几何编辑。未知来源标记保持不动。拖动期间从 React Flow 临时坐标派生预览；松手写入一次可撤销修改。`nodeDragThreshold: 0` 让第一次指针移动即更新节点，修复短拖动只改变选择而未移动的问题。

选型依据：[ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)、[inline labels](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeLabels-inline.html)、[ELK JSON 格式](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html) 和 [elkjs](https://github.com/kieler/elkjs)。浏览器按需导入 elkjs 0.12.1；独立构建的引擎块约 1.47 MB（gzip 448 KB），目前使用进程内 worker shim。尚未做大图压力测试，也未宣称完全消除主线程计算开销。

滚轮与线重：按最新要求，画布滚轮始终围绕鼠标位置缩放，与节点或边的选择状态无关，不再用滚轮修改粗细；拖动画布空白处平移，输入框与详情浮层保留普通滚动。节点边框与关系线宽各有独立详情滑块及数值框，范围为 0.5–8 px，默认分别为 1 px 与 1.8 px。真实 DSH 已验证节点滑块 1→2 px 后继续滚轮缩放，边框保持 2 px，各关系线保持 1.8 px。后文选中对象后滚轮调线重、Alt 调线重等仅为旧版验证历史，不代表当前交互。

卡片种类与手工插入：新增入口提供论文、Note 和共享关系标签；历史 `paperstreamCard.kind: "page"` 卡片仍使用标准 text 的 `label` 与 `text`，按已有文本卡片编辑和保存。论文的业务字段仍只存原来的 fenced JSON，默认隐藏重复的“论文”字样。空白处双击打开就地插入入口；连接点拖到目标后直接创建无文字连线，也可先选起点再点目标。takeaway 中连续以 `- ` 开头的行显示为分点，原始文本仍原样保存，普通行和换行保留；渲染仅使用 React 文本节点，不执行 HTML。

Fig 保存与调整：`paperstreamCard.figures` 存放图片数组，每张包含稳定 ID、内嵌 data URL、caption、widthPercent 及原始像素尺寸。导入 PNG/JPEG/WebP，每张不超过 8 MB；在浏览器解码前读取格式头，限制 3200 万像素、单边 16384，解码后复核尺寸并释放 bitmap。该预算只用于新上传/粘贴，已有文档图片不静默改写；它是单图边界，不代表总内存上限。不把临时 blob URL 或外部图片 URL 写成永久资源。新图注默认为空，不显示上传文件名；历史图注若只有 PNG/JPEG/WebP 文件名，界面和导出隐藏该文本而不改写原数据，自定义文字图注保留。默认宽度 100%，保持比例；选中卡片后拖图片右下角调到 15–100%，松开时提交一次尺寸修改，双击手柄或点“铺满”恢复 100%。图片和说明都参与自然高度测量。图注逐字即时更新；宽度输入的 15–100 合法值即时更新，临时空值和越界值只保留在输入框中，失焦回到最近有效宽度，鼠标调整和“铺满”会同步数值。图片设置保留扩展对象和数组中未知属性；异步导入在解码后核对当前目标卡片，并合并最新扩展，关闭文档或切换目标不会把旧上传写进另一张卡片。

剪贴板图片：选中论文、Note 或插页后 Ctrl/Cmd+V 可添加 PNG/JPEG/WebP，复用格式、签名、解码和大小检查；没有图片的普通粘贴不拦截。异步队列保持连续粘贴顺序，提交前核对挂载、文档代次、文件关联、只读状态与选择代次，再合并目标节点的最新图片数据，避免解码期间切换目标导致误写。新图片图注为空、宽度 100%。真实 DSH 使用原生“复制图片”→Cmd+V 添加 400×200 PNG，保存独立 `.local/` 测试副本后经 `CanvasGraph` 回读确认内嵌数据与尺寸。

2026-11-13 图片内存边界复查：真实 DSH 拒绝仅 12227 字节但有 1 亿像素的合法 PNG，卡片和撤销记录不变；随后正常 PNG 与 macOS 实际转码 JPEG 经浏览器剪贴板分别粘贴成功，DOM 自然尺寸均为 2×1。新增 5 项格式头、解码前预算、边界及资源释放回归，相关 21 项测试通过。浏览器文件选择流程曾长时间阻塞，实际返回后才记录拒绝结果；未用文件字节数推断解码内存安全。

2026-11-13 功能收缩：按用户决定移除 PPTX 导出、演示分页、放映及新增插页入口；删除相关 ZIP/DrawingML 实现、面板、样式和专用测试，导出格式只保留 SVG、PNG，调用已移除格式会明确拒绝。旧 `page` 卡片仍作为已有文本卡片显示、编辑；`paperstreamPresentation` 作为未知扩展原样保留，打开、编辑和图片导出不清理它，不修改已有图文件或历史导出文件。下文涉及 PPT 的验证均为已移除版本的历史记录，不再属于当前功能或待办。

图片导出：整图 SVG、PNG 从文档数据生成，包含视口外对象，局部过滤不丢弃隐藏节点；手工关系标签位置、线路、卡片图片和图注也进入导出。仅在 XML 输出中替换禁止的控制字符，保留源文档；无效图片像素元数据使用有限默认值，避免产生 Infinity 布局。PNG 分配前检查像素边界，超限提示使用 SVG。

本次裁剪已在实际 DSH 核对文件菜单仅有 PNG/SVG，底部无演示入口；原双页签草稿和分点正文恢复正常。实际下载 SVG 后用标准 XML 解析器检查标题和两个分点均保留。前端与 DSH 构建、DSH 15 项检查通过；前端完整测试覆盖已移除格式的明确拒绝、旧分页元数据保留、SVG 全图导出及 PNG 分配边界。

全局外观：顶部右侧齿轮提供主题与直角、圆角、曲线三种路径，默认苔绿与圆角；卡片详情使用小文本页图标。曲线在无折点时为平滑贝塞尔线，有折点时在已有通道内使用较大的圆滑转角，防止短端口段产生回钩。使用环境的偏好不写入单张 `.canvas`，避免同一用户切图时反复切换外观。苔绿、纸白和夜间对应 `sage`、`paper`、`night`。DSH Web 通过 `GET/PUT /paperstream/preferences` 保存到 `DSH_HOME/paperstream/preferences.json`，无环境覆盖时使用 `~/.dsh/paperstream/preferences.json`。宿主写入排队并原子替换，保留未知已有属性，损坏文件拒绝覆盖。独立编辑器使用同源 localStorage；DSH 同步失败时保留浏览器回退并提示，不把回退描述成已同步。重启宿主后的读取与切到纸白后的真实 JSON 落盘均已验证。

原文入口：卡片与详情页的原文入口保留普通 HTTP(S) 的 `href`；在本机 DSH Web 点击时可通过 `POST /paperstream/open-url` 请求宿主用系统默认浏览器打开。macOS 使用 `/usr/bin/open`、Linux 使用 `xdg-open`，URL 为独立 argv 参数且不经 shell；Windows 当前返回不支持。外观与外链路由都在任何读写/调用前执行官方 `connection.requestRejection`，沿用 Host/Origin 与 cookie 认证；仅接受用途限定的 ≤ 4 KiB JSON。外链额外限制 socket 回环地址、HTTP(S)、无凭据与控制字符。成功只表示系统打开器已接受请求，失败会明确提示普通原文链接。

系统浏览器在 DSH 宿主机器上打开；socket 回环判断不能证明物理同机，代理/SSH 转发可能呈现回环地址。直连远程地址不通过本机调用，远程或不支持的环境可右键普通 `href` 在客户端打开。已在 macOS 真机确认 LeNet 原文经宿主 `/usr/bin/open` 进入 Chrome；没有将 Linux、Windows、远程或 Desktop 记为已验证。

前端新增与修改通过纯函数格式层，不能直接保存 React Flow 的内部快照。有效编辑即时进入文档，保存文件仍是独立操作；拖动和缩放只改位置尺寸；提供撤销/重做及删除连线确认。只看附近通过显示过滤实现，保存始终使用完整文档，避免隐藏节点被当作删除。普通备注、文件卡、链接及分组不会被清除；此版本只做基本展示，文件卡显示路径，分组框移动不自动带动框内卡片，不宣称完整复刻 Obsidian 的笔记/附件体验。

2026-11-13 局部视图定位修复：清除选择后“全图”仍可使用；搜索成功时先退出局部过滤，并将匹配卡片纳入本次视口计算，避免选中一个仍隐藏的对象。空白搜索不跳到第一张卡片。真实 DSH 验证不相连 Note 在局部视图隐藏、取消选择后可返回全图；再次过滤后搜索该 Note，恢复 3/3 卡片、选中目标且其中心与画布中心一致。前端与 DSH 构建通过。

就地编辑与详情：取消固定右栏，点击卡片右上角文本页图标或右键卡片/边，在点击位置附近打开非模态详情浮层；浮层尺寸与坐标限制在工作区边界内。双击 alias、takeaway 或 relation 进入原位置的输入框，每次有效输入立即通过字段级更新进入文档，不再提供“应用更改”或确认/取消按钮。单行 Enter、多行 Ctrl/Cmd+Enter、失焦和 Esc 只结束编辑，不回滚已经生效的内容；普通多行 Enter 保留换行，输入法组合期间不提前结束。输入框随内容增高，详情字段同样即时更新。同一对象同一字段间隔小于 1100 ms 的连续有效输入合并为一个撤销步骤，换字段、结束编辑或其他图操作会分开记录。

最新双击修复：画布捕获阶段原先以 `.closest('.react-flow__pane')` 判断空白，实际也匹配卡片文字等后代，提前拦截了原位编辑。现在只在事件目标就是画布空白 pane 时打开插入菜单，可编辑文字使用 `nodrag`；中文原位输入已在真实 DSH 验证。论文详情依次展示 alias、takeaway、name、url、year，再到图片、外观及删除；边详情依次展示 relation、端点与方向、含义与依据、外观、默认折叠的路径设置及删除。

2026-11-13 relation 连续输入修复：每次有效输入更新 Canvas 后，原节点同步会重新生成不含 React Flow `measured` 的节点。React Flow 因而清除连接点边界，暂时得不到边端点，卸载整条关系线及输入框；重新测量后再次挂载，触发输入框初始 `select()`。真实 DSH 复现为输入 `a` 后选区 `[0,1]`，再输入 `b` 覆盖成 `b`；临时挂载日志证实每次输入都卸载、重建，修复后已移除日志。现在按节点 ID 和渲染类型保留已有测量，新节点数据与位置仍以 Canvas 为准；打开或重新读取另一份文档时清空节点缓存，避免同 ID 复用旧测量。测量只留在界面状态，不写入 `.canvas`，即时编辑和撤销规则保持原行为。

本次回归新增 5 项，使用实际 XYFlow 节点同步与边端点计算验证测量不会被文本更新清除；恢复旧同步行为时回归用例失败。真实 DSH 已验证 `a → ab → abcdef`、中间插字 `abcdXYef`、清空后连续输入中文、结束后重新编辑追加、撤销及重做。中文文本连续输入通过，未把它等同于所有操作系统输入法候选流程都已覆盖。前端 161 项、DSH 15 项及 Codex 10 项测试通过，前端与两种插件构建通过。

2026-11-13 编辑开销复查：节点同步与当前帧投影对同 ID、同渲染类型且浅相同的 data 保留引用，使 relation 编辑不再使所有无关卡片的 memo 失效、重复解析其内嵌图片；变化的 raw、busy、draft、editing、回调立即使用新值，仍保留 React Flow 测量与同帧受控输入。提交阶段使用 `validateCanvas` 校验，避免仅为校验再分配整份序列化字符串；保存、精确 dirty 比较和历史语义不改。节点授权对照也改为线性 Map。新增 4 项引用与隔离回归，节点同步共 9 项通过；真实 DSH 再验 `a → abcdef` 焦点与末尾选区 `[6,6]`，一次撤销恢复此前完整 relation。仍未以纯 Node 耗时估算真实浏览器帧率或大图容量。

本轮最终检查：前端 198 项、Python 75 项、DSH 15 项、桌面适配器 18 项通过，文件往返、前端/DSH/适配器构建及类型检查通过。本机纯 Node 对照中，100 卡含 8 MiB 内嵌图片的保守 relation 编辑路径中位约 27.8 → 14.9 ms，32 MiB 为 130.3 → 78.4 ms；包含双 stringify、source 序列化和投影，不含 DOM、标签布局、图片解码或持久化。剩余大字符串比较和序列化仍是后续优化目标，不承诺浏览器响应时间。本地已安装插件重新更新，HTML SHA-256 与最新构建一致且启用；正式 App 文件打开请求已排队至当前聊天右侧的 ResNet 样例，不将排队结果当作原生画布通过。

后续快照比较优化：提交先校验新文档，再用无缓存的有序纯 JSON 比较替代双 `JSON.stringify`。仅在编辑器不可变快照中跳过引用未变的子树，仍比较未知字段、对象键顺序和数组顺序，保留 JSON 对 -0/0 的语义；不用于任意带 getter/toJSON 的 JavaScript 对象。保存文本与精确 dirty 判断继续使用原有序列化。6 项回归覆盖 200 组嵌套对照、恢复原值、键重排及带图卡片；真实 DSH 验证键盘进入 relation、`a → abcdef`、选区 `[6,6]` 和一次撤销。`node --experimental-strip-types web/scripts/benchmark-snapshot-comparison.ts` 可复现比较阶段：100 卡、32 MiB 内嵌字符串约 54 ms → 小于 0.01 ms，不含校验、source 生成、DOM 或宿主通知，不代表完整输入延迟。

同日输入可靠性复查：忙碌时原位输入框原先仍可输入，而文档更新函数拒绝修改，造成键入后立即回滚；现在同步将原位输入设为只读，保留焦点与选区，不以 disabled 触发失焦。卡片的 busy 状态在当前渲染直接投影，避免依赖 effect 的一帧滞后。搜索 Enter 和详情 Escape 与原位输入共用输入法组合保护，候选输入及 keyCode 229 不触发搜索、关闭或提交。演示页面面板在打开或重读文件等待期间也统一锁定标题、成员、增删和排序，避免等待中新增的修改被 replace 丢弃；只读文件保留查看、定位、放映和导出。

新增真实组件回归检查原位输入的只读属性、实际键盘与修改回调，以及演示面板的控件状态和实际修改回调，不以只测辅助函数代替接线检查。实际 DSH 已验证新页签恢复与标题 `审查 Alpha` 的连续输入、末尾光标和 Enter 结束；本轮后续慢速宿主手测被内置浏览器确认框阻塞，没有将未完成的交互记为通过。操作系统输入法候选窗口、大图性能和完整跨平台流程仍需专门手测。

输入验证与空值：格式无效或尚未输入完整的年份、URL、线重等保留在输入框并提示，文档继续保持最近一次有效值，不把非法数据写入 Canvas。有效字段按各自修改独立保存，不因另一个无效输入被整份旧表单覆盖；输入状态可随工作区草稿恢复。Canvas 论文的 alias、takeaway 允许空字符串，relation 也可为空；清空 name、url 或 year 使用原有的 null 语义。旧 Mermaid 的非空规则仍独立保留。即时更新文档不等于自动覆盖磁盘文件，显式保存继续执行原有外改检查。

卡片自动尺寸：标题和正文允许长词换行，正文保留换行；年份固定在卡片内部右下角，手动高度留白时仍贴底。有年份的卡片使用 `has-year`，内容底部预留 42 px（15 px 底距、17 px 年份行高、10 px 正文间距），预留区参与自然高度测量，避免正文遮挡年份；无年份不预留年份区。ResizeObserver 测量内容自然高度，使用不受画布缩放影响的 CSS 像素，经 `patchNode` 写回标准 Canvas `height`，保存会包含该尺寸。论文和带 `paperstreamCard` 扩展的新增卡片默认 `heightMode: auto`，随内容增减双向调整高度；手动 resize 会切到 `heightMode: manual`，保留用户宽度与留白，但高度不低于内容需要。详情设置可切回自动模式。自动尺寸更新归入当前修改，不另占撤销步骤，也不清空重做；拖动或缩放卡片期间延后自动测量提交。未带扩展的导入普通卡片继续仅在内容放不下时增高。

外观扩展：节点与边的 `paperstreamStyle` 保存显示设置，不重复存放论文语义字段。论文节点可设置 `strokeWidth` 和 `heightMode`，关系可设置 `strokeWidth`；线宽接受 0.5–8 px 的有限数字，节点边框默认 1 px、关系线默认 1.8 px。恢复默认值时可省略对应扩展键，更新保留其他节点/边字段以及未知的嵌套样式属性。已有无效扩展值在显示时使用默认值但不静默改写原数据；非对象的 `paperstreamStyle` 会阻止外观修改并保留原值。

选择同步：卡片、关系文字、详情图标及键盘操作统一通过显式选择入口和最新的 ref 更新选择；不再把 React Flow 的选择观察回调写回表单，并过滤其内部 `select` 变化，避免旧选择回放或取消切换后轮廓与详情不一致。原位输入值在当前渲染中直接传给节点，不通过 effect 延迟一帧，避免快速连续输入被旧值覆盖。

关系说明使用可换行、可点击编辑的 HTML 标签，连接路径和箭头仍由 SVG 绘制。通过自然尺寸测量和可见卡片边界计算标签位置，按稳定的边 ID 顺序避开卡片与已放置的标签，并留出间距；优先靠近原连接线；主线直接经过标签中心，文本框遮住框内线段，不再用虚线牵引。用于避让的测量基于未绕行的基础路线，避免文本位置与线形互相反馈。拖动卡片或内容尺寸改变后重新布局，仅影响界面，不修改卡片坐标或 Canvas 的 `label`。首次显示及“适应视图”合并卡片和标签的边界，包含负坐标；后续拖动不会自动改变用户视角。

手工关系布局：拖动关系文字可固定其图坐标，保存为边的 `paperstreamStyle.labelPosition: { x, y }`；手工位置优先于自动避让，并作为其他自动标签的障碍；主线同样经过文本框中心。选中关系后显示路径控制柄，可拖动添加或移动折点，也可 Shift+双击路径添加，折点双击或按 Delete 删除；普通双击关系文字仍用于编辑。折点依序存为 `paperstreamStyle.waypoints: [{ x, y }]`，折点保留顺序，使用所选的直角、圆角或曲线外观。屏幕与 SVG/PNG 共用 `connection-path.ts`；导出使用精确贝塞尔边界，标签有不透明背景。文字和折点拖动只在本地预览，松手提交一次；取消手势不写入。关系详情提供恢复自动布局的入口，清除手工标签位置和折点时只删除对应布局键，不修改 relation、端点、线重、箭头或未知扩展。适应视图和图片导出都将手工标签及路径控制点纳入范围，避免被裁掉。

箭头方向相对于已有 `fromNode → toNode` 端点定义为 `forward`、`reverse`、`both`、`none`，分别映射到标准 Canvas 的 `fromEnd`/`toEnd`。切换时显式设置两端以清除旧箭头，保持边 ID、端点和其他字段；双向关系不增加一条伪反向边。未指定端点样式时遵循 Canvas 默认值：起点无箭头、终点有箭头。

共享关系标签：仍使用标准 text 节点加 `paperstreamCard.kind: "relation"` 保存，但外观与交互按连线标签处理：12 px 正文、紧凑文本框，没有论文标题、年份与普通卡片尺寸控件。详情图标位于框外并按悬停/选中显示；详情列出入线与出线，可改文字、回到连线中央或接入另一篇论文。唯一文本框被多线共用，不复制多份说明。自动模式下文字增删会收缩或扩大文本框；打开已有文件不重写其自定义宽度。连接端口朝向相邻折点或节点；拖动论文时按不同相邻节点中心变化的平均值跟随，共享节点的最终位置也参与普通边标签跟随。直接拖动标签或多选显式移动优先，保留人工偏移。把普通边转为共享标签时沿用当前可见文字位置，旧折点只拆分一次；不让两段线各自重复完整路径。

关系补充：Canvas 允许 `label: ""`，空说明仍保留可选中的线，也能之后添加文字；这不改变旧 Mermaid 的非空约定。多个连接共享说明时，使用标准 text 节点与 `paperstreamCard.kind: "relation"` 表示唯一的关系文本，各条边连接到同一节点，不复制多份 label 冒充同步。边的 `paperstreamStyle` 还可保存实线/虚线/点线、实心/开放/菱形/圆点箭头，以及 1–5 的人工关系权重。人工权重、边的视觉粗细和论文重要性分别维护。`paperstreamRelation.type` 可人工标记继承／改进、比较、支持、对照／反驳或其他，`evidence` 保存多行依据；未填权重表示未评估。显式“按权重映射线宽”仅执行一次 0.8 + 0.6 × 权重 px 的线宽修改，后续权重、边线宽和节点边框仍独立。不从年份、引用次数或线宽推断因果强度，也不将方法对照当作引用证据。

读写保留未知顶层、节点、边与论文代码块字段以及节点顺序；JSON 缩进可能重排。Python 不修改数据的保存保留原字节。两端均拒绝重复 JSON 键、悬空边及无效字段；浏览器额外拒绝无法无损处理的数字，避免 JavaScript 精度导致未知字段悄悄改变。Python 可精确保留未知字段的大整数，但浏览器会拒绝超出安全整数范围的值。坐标与尺寸两端均限制为 JavaScript 安全整数，尺寸为正。

保存保护分两种。Python 使用文件快照、协作锁及同目录临时文件原子提交。浏览器对选定文件使用 File System Access API，打开写入流前后及提交前核对快照；不支持文件句柄的浏览器通过下载副本保存。浏览器和 Python 没有共享锁，最终核对与提交间仍可能出现外部写入；该方案不承诺无冲突实时协作。遇到外部修改拒绝覆盖，先保留当前副本，再重新读取核对。[浏览器写入流说明](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable)

打开文件时先在点击事件中触发文件选择器，再确认是否放弃当前未保存内容，避免用户阅读确认框时浏览器的临时用户手势过期。取消选择或拒绝替换都保留当前文档与草稿；文件输入回退路径同样在选择后确认。已在 DSH 验证拒绝替换后内容保留，以及确认框停留后仍可正常打开所选文件。

DSH 主面板通过 main 与 sidebar.panellist 槽位注册，构建时将 React 相关共享模块排除出插件包。组件可能在切换面板时卸载，因此浏览器工作区将标签顺序、活动页、文档、输入状态和保存基线保存在 IndexedDB，文件句柄与打开时的原文快照另行保存。撤销/重做历史仍限当前会话，避免反复持久化含大图的历史快照。恢复先核对文件关联代次、名称和保存基线，记录不匹配时只恢复草稿并要求重新选择文件，不能把旧草稿连到另一份文件。

启动恢复仅查询已有权限，不主动弹授权；需要权限时显示重新授权入口，由用户点击后请求读写权限。重新授权成功也不跳过保存时的外改核对；外部文件变化仍拒绝覆盖，并保留恢复草稿。IndexedDB 不可用时可回退到 localStorage 恢复草稿，但不能声称文件句柄已长期恢复；旧 sessionStorage 草稿按时间迁移，持久写入失败不删除旧副本，恢复读取失败时暂停覆盖原恢复记录并明确提示。浏览器恢复记录不替代 `.canvas` 正式文件，也不建立跨浏览器、跨设备或跨 origin 同步。连续输入停止 250 ms 后尝试持久化，持续输入期间约每 1.5 秒尝试保留最新快照；页面隐藏和组件卸载时尽力 flush。延迟的是工作区快照获取和序列化，文档内编辑仍立即生效。异常终止可能丢失尚未持久成功的输入；不能把调度间隔描述成绝对恢复保证。大图仍需专门性能测试，不能声称已解决所有编辑开销。

浏览器选择器访问浏览器机器的文件；宿主路由仅处理外观偏好与受限外链控制，没有图文档文件 RPC 或模型工具注册，远程工作区文件不会自动出现在选择器中。自动化继续使用 Python API/CLI。

2026-11-13 恢复数据审查：旧 sessionStorage 草稿的损坏 JSON 保留原始字符串，交给编辑器隔离并暂停覆盖，不能当作不存在而创建空白草稿；持久或旧 session 页签清单存在但无效、存储读取被拒绝、localStorage 回退中的空字符串记录同样明确报恢复失败，保护原记录与其他页签入口。有效持久页签清单优先于损坏旧副本。新增 5 组回归覆盖原记录保留、重新打开后的隔离、读取异常及空记录；工作区 14 项、文件保存 5 项与 Python 75 项检查通过。

后续恢复审查为页签清单补上与草稿同样的单调时间戳：新增或关闭页签的持久事务中断时，恢复有效的较新 session 清单，避免新页签草稿失去入口或已关闭页签再次出现；成功恢复后修复旧持久清单。旧记录仍兼容，损坏清单继续隔离。新增、关闭和较新持久版本三项失败注入回归通过，工作区检查共 17 项。

保存与面板生命周期分开协调：每个页签由当前草稿实例持有文件状态，成功保存的 checkpoint 只更新 saved、fileName、fileBindingId 和文件快照，不替换图、输入或选择。等待选择文件前就捕获保存身份，卸载时同步缓存最后输入；原实例卸载后保存仍可交给沿用同一关联的新实例，但切换文件、关闭页签或过期补发回调不能重新关联旧文件。旧实例的延迟草稿写入失效，当前实例的陈旧 React 快照按最新保存元数据归一；每页只留当前 checkpoint，卸载释放回调。恢复存储失败仍承认实际文件已保存并采用新基线，保留恢复失败提示；旧异步打开/重读结果在卸载后不执行 replace。

该交接新增 7 项回归，覆盖卸载后成功、重开后继续输入、改开另一文件、关闭页签、过期微任务、连续保存及恢复存储失败。工作区 24 项、前端 184 项、Python 75 项检查与构建通过；实际 DSH 验证未完成 URL 输入离开面板后原值和校验状态仍在，清空后可继续编辑。真实磁盘慢速保存跨面板流程的每个时序未逐一手测，交接边界由可控异步回归验证。

上一轮验证状态（2026-11-06）：前端 52 项、DSH 生命周期 5 项、Python 73 项测试通过，Python/TypeScript 文件互操作、独立前端构建及 DSH 插件构建通过。前端依赖已安装并生成 `web/package-lock.json`。就地编辑、详情浮层、双向箭头及高度/线宽设置的真实 DSH 验证范围如下。

此前工作台改造的自动检查为前端 72 项、DSH 13 项、Python 74 项，并通过两端构建与文件往返。工作台已在真实 DSH 验证简约顶部、底部状态栏与竖向布局；Note 分点显示、空白双击插入菜单、两步点击空说明连线，以及将边转换为共享关系节点后再接入第二条边均通过。导入 fig 并保存的副本经 Python 回读为 6 节点、6 边，其中 4 条空说明边，共享关系有 2 条入边，内嵌图片确实保留。PNG 实际生成并经图像查看检查，主题宿主读取/落盘、macOS 默认浏览器原文入口按上述范围验证。前一版已实测选中后线重从 1 调至 1.2；曾改为所有普通滚轮均缩放、Alt 调线重；用户反馈后恢复为选中对象直接调线重，保留 Ctrl/Command 缩放。空白拖动平移已在 DSH 实测，缩放锚点、边界和修饰键优先级通过辅助函数测试。Fig 已在实际鼠标拖动后保存并经 Python 回读为 53% 宽度；节点边框 1.2 px 与原有边线设置保持独立。已在第二个独立页签打开量子力学六篇样例，原验证图保留；页签关闭、草稿恢复及插页的全部边界流程尚未穷尽。PPTX 仅结构验证，未在 PowerPoint 打开。不把模块测试或构建成功等同于所有新交互手测通过。

本次深化已在真实 DSH 验证原位简称编辑及 Enter 结束、详情逐字段即时更新、清空简称、分点与年份保留、两页放映及翻页、重载草稿与文件关联恢复、关系文字拖动及新增折点。人工权重 4 不会自动改变 1.8 px 连线，显式映射后为 3.2 px；证据与几何保存后经 CanvasGraph 回读，节点边框保持原样。`.local/live-edit-validation.canvas` 回读为 1 卡片、2 页；`.local/relation-routing-validation.canvas` 回读保留手工标签位置、2 个折点与关系依据。多页 PPTX 经 DSH 实际下载后检查为 2 页、19/14 个形状及 3/2 条连接线，XML 均可解析。这不是 PowerPoint 实开验证。

视觉整理由 Astra 两轮实屏检查推进：统一三种主题的语义色和表单、菜单、选中态，标题调整为 18 px / 650，正文保持 13 px / 21.45 px；底栏操作采用 28 px 触区，缩放控件统一容器，移除叠加的蓝色 resize 边线，保留可拖区域。此前共享关系正文为齿轮预留 26 px；本轮移到框外并改用文本页图标，去除正文留白。屏幕 CSS 和导出共用 `card-layout.ts` 的间距与文字几何，避免分别修改后再度漂移；默认隐藏的文件输入不因表单 display 规则而重新露出。纸白和夜间主题已在真实 DSH 截图复查，当时保留用户选择的齿轮入口；本轮按最新要求改为文本页图标。空页面面板按内容收缩，避免大片无内容浮层。

此前回归：前端 117 项、DSH 13 项、Python 75 项均通过；Python/TypeScript 文件往返、前端构建和 DSH 插件构建通过。图注即时输入保持焦点，图片宽度 75→50 即时生效，越界值失焦恢复 50；一次撤销恢复整段简称；重新授权指定文件后正常保存，CanvasGraph 回读核对实际内容。演示面板滚轮实测保持选中卡片边框为 1 px，不再误改。大图性能、跨平台及 PowerPoint 实际兼容性仍是验证边界。

Astra 审查发现并修复：恢复暂停后仍先覆写 sessionStorage/内存副本；页面列表滚轮误调背后卡片线重；共享关系导出套用普通卡片布局而越界；WebP 转成过大 PNG 后被无提示过滤；多页签自定义 SVG 箭头 ID 冲突；手工路由与自动竖排互相破坏。恢复保护回归同时检查 IndexedDB、sessionStorage、缓存和文件关联；导出测试改为检查真实几何边界并使用有效 PNG fixture，不能仅以 XML 含文字证明视觉正确。导出字体宽度仍为便携估算，未承诺各软件完全一致。

前一轮回归（2026-11-07）：前端 145 项、DSH 15 项、Python 75 项通过；文件互操作、前端构建与 DSH 构建检查通过。真实 DSH 已验证三种路径设置及宿主落盘/重载、文本页详情入口、隐藏图片文件名、智能竖排、共享标签跟随和短拖动。布局结果经 CanvasGraph 回读确认有效整数节点坐标和边折点；再拖动论文后保存，回读确认受影响自动几何已清除，原标签文字与论文内容保留。右下角缩放期间的共享标签预览可能等到松手后刷新，最终几何会正确更新。PowerPoint 实际打开、大图性能与其他平台仍未完成验证。

同日最新回归：前端 156 项、DSH 15 项、Python 75 项、Codex 适配 10 项均通过；Python/TypeScript 文件互操作、前端、DSH 与 Codex 构建通过。真实 DSH 中文编辑、线重滑块与滚轮互不干扰、系统剪贴板图片粘贴按上述范围通过。最终插件已重新安装并确认启用，安装 HTML 与构建产物 SHA-256 一致；从安装缓存目录运行 stdio 客户端，实际收到 `paperstream.canvas` 的 `.canvas` 文件入口与 2,581,016 字节 HTML 资源。浏览器 AppBridge 的内存资源编辑、版本保存、外改、冲突和只读测试通过；ChatGPT 桌面原生文件面板仍未验证，详见下方适配章节。

下面保留的是此前版本的手测历史，其中“应用”“取消未应用修改”和 sessionStorage 不恢复文件句柄属于旧行为。PPTX 反向导入、双向同步和实际 PowerPoint 打开均未完成。

真实运行环境为 macOS arm64、Node.js 26.12.1、pnpm 10.34.9、Chrome 与 DSH Web 0.2.2-rc.1。DSH 安装在 `.local/dsh-runtime`，`DSH_HOME` 指向 `.local/dsh-home`，插件通过本地目录链接安装到 Web profile。Web 仅监听 `127.0.0.1:3080`；已有开发机可用 `sh .local/start-dsh.sh` 重启，完整安装命令见 [DSH 说明](../../dsh/README.md)。

已手测入口和画布显示、本机打开文件、详情修改和应用、未应用字段的保存禁用、取消放弃编辑、撤销/重做、拖动、放大及适应视图。保存到测试副本后已通过 Python 回读核对，包括拖动位置；外部 API 更新文件后，浏览器保存拒绝覆盖，重新读取正确显示外部修改；局部视图显示 2/3 卡片时，保存仍包含全量 3 卡片、2 条关系。切换到 Plugins 后返回，未应用的表单修改完整恢复，画布保持已应用内容；文件句柄未恢复，因此重新读取禁用，保存仍须先应用表单。

新增论文的选择回跳修复已实测：选中已有卡片后可进入空表单，创建中文长标题、五行中文、长无空格英文和年份的卡片成功。内容自动增高完整显示，手动收窄后继续增高，适应视图后所有文字和年份均可见；缩放控件图标也已修复并确认可见。按钮新增关系、编辑关系说明、确认删边及撤销恢复通过；删除带关系卡片会提示数量，确认后卡片和关联边一起删除，撤销恢复两者。另存为 `.local/paperstream-ui-validation.canvas` 成功，CanvasGraph 回读确认 4 卡片、3 关系和长卡片宽 225、高 471 均已保存。

后续高度与外观实测：长内容改为短内容后卡片正确收缩；边框设为 5 px、关系线设为 6 px 后保存并回读一致；手动 resize 后模式切为 manual，宽 396、高 277 已保存。

年份固定右下角的独立调整已在重新构建的 DSH 中验证：手动拉高 LeNet 卡片时，1998 随卡片底边移动；应用八行正文后卡片继续增高，正文末行与底部年份保持留白，关系标签避让正常。

就地编辑实测：卡片齿轮与卡片/边右键均可打开附近详情浮层，右下角节点的浮层限制在工作区内；简称用 Enter、要点用 Cmd+Enter、关系说明用 Enter 原位应用，要点的普通 Enter 保留换行。撤销与取消按钮通过；详情先修改 name，再原位修改 alias 并取消后，name 草稿仍保留，关闭未应用详情会确认。连续快速输入晚一帧的问题已修复，并以 `abc` 输入完整保留验证。manual 切回 auto 后正确收缩；双向箭头两端显示正确。保存的 `.local/inline-direction-validation.canvas` 经 Python 回读，关系两端为 `arrow`、关系文本为新值，节点边框 5 px 与首条关系线 6 px 独立保留。

Esc 的验证边界：当前 Chrome 在 HTTP 页面仅触发失焦，没有向页面送达 Esc；同一纯测试页在 `file://` 下能收到 Esc。浏览器安装有 Vimium，测试未修改扩展设置，未将实际 DSH 的 Esc 取消记为通过；取消按钮已验证，可作为当前环境的操作入口。原位编辑仍实现 Esc 处理，不把外部拦截误写成该快捷键的真实宿主验证通过。

关系标签已手测点击编辑、长中文换行、拥挤布局和动态避让：4 卡片、3 标签初始没有文字遮挡卡片，将 DenseNet 拖到标签原位置后，标签自动移到上方空白处。“适应视图”合并卡片与标签边界，相关负坐标和边界几何测试通过；CNN 四篇正式样例在 DSH 初始视图中完整显示。拖 LeNet 底部连接点到 VGG 左侧后，表单的起终点正确，应用后从 3 边变为 4 边，撤销恢复 3 边并保存。下载副本至 `.local/paperstream-download-test.canvas` 完成，Python 校验通过；新建空白画布确认流程通过。

“定位论文”下拉选择 LeNet 后正确定位并显示详情；原文链接打开 [LeNet 作者页面](https://bottou.org/papers/lecun-98h)，页面显示论文标题、作者与 1998 年发表信息。测试结束后重新读取 `cnn-evolution.canvas` 并适应视图，界面保留已保存的 4 卡片、3 条关系，没有测试修改。

生命周期限制：代码热更新卸载当前画布时已观察到返回 Conversation；插件管理总开关的 Off 状态能持久化，但导航未立即卸载，切回 On 后已恢复，不能将该总开关动态禁用记为通过。Desktop、不支持 File System Access API 的浏览器回退流程、性能和大图容量尚未验证；以上测试不等于所有使用场景均无缺陷。

新增 [CNN 演进图](../../examples/cnn-evolution.canvas)，通过 CanvasGraph 创建 LeNet-5、AlexNet、VGG、ResNet 四篇论文及三条方法比较边。来源使用作者或正式发表页面，年份为 1998、2012、2015、2016；VGG 和 ResNet 的预印本年份未与正式发表年份混用。边表示阅读路线中的方法比较，不表示完整引用关系或全部思想直接继承。

AlexNet 与 VGG 的边已通过 API 改为双向方法对照，仍是一条边；双向箭头表示对照阅读，不表示两篇论文相互引用。

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

实现使用 Python 3.10+ 标准库，没有第三方运行依赖。Mermaid 阶段的 55 项测试覆盖增删改查、标题/链接/年份独立维护、旧格式兼容、元数据有效性、多字段插入、字段级文本保留、CRLF、多行与特殊字符、ID 不复用、非法操作不改变图、外部冲突、协作锁及写入失败保护。真实示例另已通过 API 创建与回读校验。旧入口仍未完成 Mermaid 原生解析或渲染验证；`validate` 是项目文档约定的校验，当前全量测试状态见文首。

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

用户明确不希望依赖 Obsidian，希望在 DSH 界面显示或操作画布，并优先使用已有 API，减少自研与打磨。以下保留实施前的官方资料核验；当时尚未安装 DSH，接口依据上游 master。当前安装和实测状态见文首，实际使用仍需匹配宿主版本。

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

运行开销取决于显示的节点/连线数量、卡片复杂度以及更新方式；官方性能文档特别指出拖动触发的无效重绘、过多节点和复杂样式的影响。[React Flow 性能建议](https://reactflow.dev/learn/advanced-use/performance) 对本项目可先采用简短文字卡片、按需显示详细内容、减少动画，并在面板不用时停止不必要的订阅或渲染。开发端会增加 JavaScript/TypeScript 的依赖与构建流程，但开发依赖目录体积不能当作插件下载大小或运行内存。插件现已构建并运行，仍未测量内存、启动时间或大图拖动性能，不提供未经测量的 MB 数字或容量上限。

## ChatGPT、Codex 与 Claude 桌面端适配与调研

2026-11-13 Claude Code 本地插件：`claude/` 新增官方插件清单、手动调用的 `/paperstream:open` Skill、本地 marketplace 与便携构建；前端复用 `PaperstreamEmbeddedEditor`，HTTP 传输复用 Codex 的纯 `ResourceSession` 状态机，不加载 OpenAI SDK。完整插件和 ZIP 包含单 HTML、Python 标准库包及启动器，可移出源码目录使用，运行不需 Node、Vite 或模型 API key。Skill 通过 `${CLAUDE_PLUGIN_ROOT}` 定位启动器，文件变更继续要求经过 CLI/API。Claude Code 桌面使用官方 Browser 预览通道；未宣称注册原生 `.canvas` 文件侧栏或另做 Mods 画布。[插件规范](https://code.claude.com/docs/en/plugins/create)、[桌面预览配置](https://code.claude.com/docs/en/desktop#configure-preview-servers)。

桥接前端按编辑器规则规范化读取的 JSON 字符串，消除 Python `1e-07` 与 JavaScript `1e-7` 的表示差异，同时保留原始磁盘 etag，避免保存后误报外改。后台聚焦读取与显式重载共用刷新协调器：显式重载优先，旧请求和销毁后的回调不污染当前界面，重试成功清除旧错误；读取期间新输入仍受资源会话保护。随机令牌仅存 URL fragment 与当前标签页 sessionStorage，成功保存令牌后才清除 fragment，禁用存储时仍可刷新。

无登录验收：官方 Claude CLI 2.1.323 在仓库内隔离配置中完成严格插件校验、本地 marketplace 安装及启用，未改变用户全局配置或调用模型。官方目录检查另提示缺少 LICENSE 和图标，当前只做私下本地测试，未擅自选择仓库许可证或公开上架。真实普通浏览器经打包服务完成简称编辑、智能竖排、保存、干净外改重载；有未保存输入时，连续两次冲突保存均保留草稿及磁盘外部修改，未知扩展和小数值保留。证据为 `.local/claude-local-verified-20261113.jpg` 与测试副本，不是 Claude 原生界面截图。Claude 16 项、Python 93 项、web 204 项、DSH 15 项、Codex 21 项检查及各端构建、Python/TypeScript 往返通过。真实 Claude 会话发现并执行 Skill、权限交互及桌面 Browser 尚需有官方账号后验收；CLI 的 API/云凭据渠道不等于桌面订阅登录。[认证渠道](https://code.claude.com/docs/en/authentication)。

2026-11-13 本地单文件桥：新增 `python3 -m paperstream serve 文件.canvas`，供桌面 Browser 或普通浏览器承载同一编辑器，不增加新的画布实现。Python 标准库服务只绑定 127.0.0.1 和启动时明确选择的一份现有 Canvas，静态页面为预构建单 HTML；随机令牌放在 URL fragment，文档 GET/PUT 另需 Bearer。写入还检查 Host、同源 Origin、精确 If-Match、64 MiB 请求边界，不提供目录、任意路径、创建或删除接口。`CanvasGraph.source_revision` 从同次读取的原始字节产生版本，`set_json` 复用严格解析，保存继续走原有锁、外改检查及原子替换。路径守卫拒绝后出现的符号链接或父目录替换，但不把本地服务称为抵御恶意本机进程的隔离沙箱。

新增 16 项真实 HTTP 与 2 项 API 回归覆盖并发旧版本仅一个成功、未知字段/顺序保留、读取和保存之间外改、错误认证/来源、只读、无效 JSON/重复键、原子失败完整性和路径替换；完整 Python 93 项通过。服务不自动打开浏览器、联网安装依赖或改写未请求的文件，Ctrl-C 停止。前端缺失时明确要求先构建。

2026-11-13 ChatGPT App 适配复核：官方当前把 Chat、Work、Codex 描述为同一桌面 App 中的入口，插件目录共用；本机 `ChatGPT.app` 的显示名称与 `com.openai.codex` bundle ID 不能单独证明或排除某种入口能力。[桌面产品说明](https://learn.chatgpt.com/docs/use-chatgpt#compare-work-mode-and-codex-on-desktop)、[插件支持范围](https://learn.chatgpt.com/docs/plugins)。现有 `codex/` 对应正式的文件编辑器扩展，支持提供 `openai/resource` 的桌面会话时可以复用，无需另写 React Flow 编辑器，也无需另开 HTTP 浏览器服务；普通聊天 `@` 工具、云端远程 MCP 与本地文件面板不是同一验收范围。[文件编辑器入口](https://developers.openai.com/plugins/build/extensions#file-viewers-and-editors)。个人本地 marketplace 安装已有正式路径，公开分发本地 MCP 的合作伙伴限制不等同于禁止个人本地测试。[本地安装](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually)、[公开分发限制](https://developers.openai.com/plugins/deploy/desktop-only)。本轮更新包后可通过正式 App 文件打开接口请求在当前聊天右侧打开样例；打开请求不返回画布渲染结果，因此原生加载、编辑、保存仍需单独验收，不能用模拟 AppBridge 或 CLI 状态代替。

同日宿主通知开销优化：`onDocumentChange(document, canonicalSource)` 传递编辑器本轮已生成的规范文本，ResourceSession 用该不可变字符串跟踪本地修订，避免每字重新序列化内嵌图片。此通知只用于慢读保护，不成为保存或文档数据来源；公共 `noteLocalDocument` 仍逐次校验和序列化，支持同对象原地改写的外部调用，保存独立读取并序列化当前文档。新增 3 项回归，ResourceSession 17 项通过；模拟宿主实际验证干净状态启动延迟读取、等待中编辑简称、释放后保留新输入，再保存达到版本 2、计数 1、“已保存”。

原生面板验证范围更新：通过当前聊天已打开的 MCP Apps 面板直接看到 ResNet/DenseNet/ResNeXt 画布，并实际打开、关闭 ResNet 详情；这已证明桌面 Codex 会话中的原生显示和基本交互，不再仅是模拟宿主。该既有实例仍有旧“演示”入口和未保存的排版，未替换、保存或清除它，也不能把它记为最新构建通过。使用 CanvasGraph 另建 `.local/chatgpt-acceptance-20261113.canvas` 副本，正式文件打开请求已排队，编辑/保存及 Chat/Work 入口仍待后续验收。

原生日志同时记录尺寸观察器循环告警。测试宿主现显示 `resizeWarnings`，同源 iframe 的浏览器 error 事件只计数、不拦截或忽略；初次加载复现 1 次，内容增长与缩小后达到 2 次。关闭 SDK autoResize、将本项目观察回调延后一帧以及两者组合均未消除复现，相关生产改动全部撤回。告警根因仍未定位；它本身不证明白屏或保存失败，不将诊断尝试写成修复完成。

本轮收尾检查：前端 204、Python 75、DSH 15、桌面适配器 21 项全部通过；文件往返、前端/DSH/适配器构建和类型检查通过。最终插件已重新安装，HTML SHA-256 与构建产物一致。仅停止临时模拟宿主，DSH 本地服务继续运行；既有原生面板与未保存排版保留，测试副本仍等待正式文件打开请求执行。

2026-11-07 当前实现：新增 [codex/](../../codex/README.md) 本地 MCP Apps 文件编辑器，注册 `.canvas` 入口，通过官方扩展协议读取宿主传入的资源 URI、权限和版本标记，订阅外部更新。URI 保持不透明，不当作本地文件路径。保存要求宿主明确允许写入并提供版本，写请求携带 `ifMatch`；干净文档接收外部更新，有本地修改时保留草稿并提示，冲突不更新旧基线，也不以重复保存覆盖新版。只读资源禁用编辑与保存。

2026-11-13 会话可靠性审查：显式重新载入只授权丢弃操作开始前的修改；若读取等待期间产生新修改，即使原本已经是脏文档，也保留当前编辑器和旧保存基线。已关闭或被取代读取的迟到错误不污染当前文件，当前请求的失败仍报告。快速 A→B→A 切换时，订阅与取消操作按顺序完成，防止旧取消撤销新订阅；界面销毁后迟到的连接完成不再打开待处理文件。最新读取缺少版本标记时立即只读，最新写入授权与旧基线 etag 分开记录，既不能借旧标记继续写，也不能采用外部新标记覆盖其内容。

后续补上输入草稿的独立版本通知：非法年份、URL 或临时空线重可能只改变 form，不改变 Canvas，dirty 原本已为 true 时也必须保护；宿主重新载入会检查这些变化，不能重建并吞掉后输入的无效文本。初始空表和仅键顺序变化不算新编辑。新增两项回归，适配器共 18 项及类型检查、构建通过。浏览器内存 AppBridge 宿主现已实际验证：干净状态启动暂停读取，等待中修改简称，释放后保留新文字并提示；暂停保存时详情控件禁用，释放后保存计数 1、版本 2、界面显示已保存且重新可编辑。此验证补完前轮确认框阻塞的干净重载/慢速保存流程，仍不等同于 ChatGPT 桌面原生面板通过。

本轮增加可控延迟读取、写入和订阅回归，以及浏览器测试宿主的暂停/释放按钮。最终前端 177 项、Python 75 项、DSH 15 项、适配器 16 项通过；Python/TypeScript 文件往返、前端、DSH、适配器构建与类型检查通过。实际 DSH 连续标题输入已验证；浏览器慢速宿主场景遇到确认框阻塞，未记为手测通过，对应竞态以回归测试验证。ChatGPT 桌面原生文件面板、操作系统输入法候选流程、大图性能和跨平台仍未完成验证；不把本次审查描述为全部场景无缺陷。

编辑器抽出宿主嵌入入口，宿主文档建立独立保存基线，不读取或覆写浏览器工作区草稿。自动高度测量按节点快照记录是否发生用户修改：未编辑快照的纯测量不把文件误标为脏，用户修改过的快照才允许持久化自然高度；显示边界仍可测量。授权使用界面内的 WeakSet，不写入文档，也不因同 ID 的旧快照被编辑过而授权原始快照。派生测量继承已有授权，撤销原文保留原尺寸，重做仍可完成后续图片或文字测量。4 项回归以及实际内存 AppBridge 宿主验证：原高 220 → 编辑后 137 → 撤销恢复 220 且“已保存” → 重做 137 → 再撤销仍干净；此为模拟宿主，非桌面原生面板验证。外链使用宿主接口。React、样式和编辑器代码构建为单个 HTML 资源，由本地 stdio 服务提供，生产使用不需 Vite 或 HTTP 服务；Claude Code 专用面板本轮未实现。

本机已通过 CLI 安装并启用 `paperstream@paperstream-local` 0.1.0，最终重新安装的 `app.html` 与构建产物 SHA-256 完全一致。浏览器测试宿主 `http://127.0.0.1:4318` 运行真实打包界面与官方 AppBridge，资源仅在内存中：初始状态干净；编辑保存后版本 2、成功保存计数 1、界面显示“已保存”；干净外部更新到版本 3；下一次保存发生版本 4 冲突时，成功计数仍为 1、本地草稿保留；只读模式编辑禁用。适配 10 项测试及构建通过。

上述浏览器测试**不是 ChatGPT 桌面原生文件面板验证**。当前电脑控制工具明确不允许控制 ChatGPT 应用，本次未绕过限制，也未把 CLI 安装或模拟宿主成功记作原生界面通过。安装更新后需由用户重启 ChatGPT 桌面应用，必要时新建会话，再在文件面板打开 `.canvas`，确认加载、编辑、保存及外改提示。目标桌面宿主验收仍未完成。

以下保留 2026-11-06 的官方接口调研与当时的工程判断。应分别评估 agent 调用文件 API、在应用内显示现有网页、以及注册原生插件界面；共同使用 React 不意味着 DSH 的槽位注册、共享依赖或文件选择器可以直接移植。

用户已进一步明确：图形适配只面向 Codex App 与 Claude Code 桌面 App，不开发终端画布。以下重点评估文件侧栏与应用内交互；Python API / CLI 仍是已有自动化接口，不因此扩展图形适配范围。

跨平台架构建议：保留 React / React Flow，进一步分离宿主服务，不因 DSH 使用 React 而更换界面框架。React 是通用网页界面库，可接入采用其他技术的现有页面；宿主若提供合适的网页容器与扩展入口，也可以承载独立打包的 React 界面。DSH 已有 React 只是同页集成时复用依赖的便利条件，并非 Paperstream 必须依赖 DSH 的理由。[React 官方集成说明](https://react.dev/learn/add-react-to-an-existing-project)

建议维持以下四个边界，不要求立即拆成多个发布包：

| 部分 | 职责与依赖边界 |
| --- | --- |
| 文档约定 | 独立 `.canvas` 文件、稳定 ID、论文与关系字段；不保存宿主专属运行状态。 |
| 数据操作 | 现有 Python API / CLI 与纯 TypeScript Canvas 操作；增删改、校验和未知字段保留不依赖 DSH 或 React。继续以往返测试核对两种实现的语义一致性。 |
| 可视编辑器 | React / React Flow 负责卡片、连线和交互；接收文档并报告修改，不自行决定文件位置或导入 DSH 接口。 |
| 平台接入 | 独立网页、DSH、MCP Apps 或其他宿主分别处理入口、打开/保存、草稿、外部链接、文档更新通知与构建包装。 |

初始实现只部分满足这些边界：`web/src/canvas.ts` 与 Python API 独立，DSH 注册和专用构建集中在 `dsh/`，独立网页和 DSH 挂载同一个 `PaperstreamEditor`；当时 Editor 仍把文件选择、保存、sessionStorage 草稿和界面组合在一起。上述新适配已增加文档、修改回调、保存和只读接口，将宿主资源与浏览器文件恢复分开。隔离 iframe 按宿主要求打包 React，不沿用 DSH 的共享模块假设；资源保存继续保留冲突检测与外部更新处理。

MCP 工具与 MCP Apps 是可选接入方式，不是独立文件 API 或编辑器的强制运行依赖。MCP Apps 使用 HTML、JavaScript 和隔离网页容器，官方提供包括 React 在内的多框架示例；普通 MCP 工具支持不等于交互界面支持。应按实际能力启用界面和保存功能，不能嵌入时仍可通过 API 操作文件或使用独立网页。跨平台目标是复用文档、业务操作和尽可能多的界面代码，各宿主的文件权限、界面尺寸和交互入口仍须验证；当前已实施 Codex 文件适配，目标桌面界面的验证边界见本节开头。[MCP Apps 官方说明](https://modelcontextprotocol.io/extensions/apps/overview)

| 目标 | 官方可确认入口 | 判断 |
| --- | --- | --- |
| agent 自动维护文件 | Claude Code 可调用本地命令或 stdio MCP；有本地执行与文件权限的 ChatGPT/Codex 会话也可运行项目 CLI | 接入相对简单；将 Python API 包装为 MCP 工具可进一步减少对命令行提示的依赖。仍需安装运行环境与明确文件位置。 |
| Codex 桌面会话的 Browser | OpenAI 官方文档记录桌面中的 Codex 可操作内置浏览器，浏览器可打开本地服务提供的页面 | 可先承载同一份 React 编辑器，再验证文件保存与 agent 修改后的刷新；该 Browser 不提供于 Codex CLI 或 IDE 扩展，不能由此推断所有 Codex 客户端都支持画布面板。 |
| Claude Code 桌面 Code 标签页 | Browser 面板可预览并手工操作本地开发服务器提供的网页 | 先复用独立编辑器是较短路径；这是网页承载，不等同于已安装专属画布插件。SSH 会话的 Browser 自动预览有官方限制，不能照搬本地会话结论。 |
| Claude Desktop 聊天 | 官方交互连接器支持聊天内嵌与全屏 MCP Apps | 画布可复用，需 MCP Apps UI 接口和工具服务，文件持久化要重新接入；不能把 Code 的 MCP 工具支持视为其已保证渲染 MCP Apps。 |
| ChatGPT 桌面插件 | MCP Apps UI，以及侧栏应用、会话面板、按扩展名打开文件的编辑器扩展 | 可把 `.canvas` 注册为文件编辑入口；属中等规模宿主适配，实际账户、版本和文件接口还需实测。 |

官方依据：[ChatGPT MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui)、[ChatGPT 插件扩展与文件编辑器](https://developers.openai.com/plugins/build/extensions)、[ChatGPT 本地执行能力](https://learn.chatgpt.com/docs/use-chatgpt)、[Claude Code 桌面预览](https://code.claude.com/docs/en/desktop#preview-your-app)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Claude 交互连接器](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)。

补充 Codex 的明确边界：当前官方 [Browser 文档](https://learn.chatgpt.com/docs/browser)将相关能力描述为 ChatGPT 桌面应用中的 Codex 使用体验，并给出启动本地服务、在应用内打开页面的步骤；不将这一能力泛化为任意版本的独立客户端或原生插件插槽。[Codex 官方实践](https://learn.chatgpt.com/docs/learn/best-practices#use-mcps-for-external-context)确认可接入 STDIO 和 Streamable HTTP MCP 工具。因此可以保留 React 编辑器并单独接入工具 API；终端使用时，画布可由外部浏览器显示。网页能显示不代表项目保存、同步和安装流程已经完成联调。

用户希望点开 `.canvas` 就在右侧文件面板显示，避免额外打开网页。Codex App 现已找到具体接入依据：OpenAI [文件编辑器扩展](https://developers.openai.com/plugins/build/extensions#file-viewers-and-editors)支持按扩展名打开会话侧栏中的自定义界面；[正式协议](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#platform-support)明确列出 Desktop 支持文件入口、文件资源和打开文件。官方 Bits & Bolts [插件清单](https://github.com/openai/mcp-extensions/blob/main/plugins/bits-and-bolts/.codex-plugin/plugin.json)明确面向 Codex 提供交互式 CAD 文件查看和修改，是同类桌面接入示例，不能再将本方案仅描述成泛泛的网页兼容猜测。实现时仍须在目标 App 检查资源能力与可写状态；有公开接口和示例，不等于本项目已完成安装验证。

Codex 文件接入可直接复用[官方 TypeScript SDK](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md#file-extension-handlers)：入口传入 `{file:{name,resourceUri}}`，界面调用 `resources.read`、`subscribe` / `addUpdateHandler` 和 `write`，保存时携带 `ifMatch` 版本标记，处理 `saved`、`conflict`、`too-large`。只在读取元数据的 `writable` 明确为 true 时保存；初始化确认 `hostCapabilities.experimental["openai/resource"]` 及扩展对象存在。资源 URI 不当作本地路径解析，服务端需要路径时走正式的文件工具上下文。按[正式入口规范](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#file-extension-entrypoint)使用 `extensions: [".canvas"]`；产品概览的无点示例与规范有差别，以规范及目标 SDK 校验为准。外部文件更新不能覆盖界面尚未保存的编辑，需结合版本冲突处理。`desktop.custom_file_handlers` 则是启动外部编辑器的 Open in 菜单配置，不是内嵌文件编辑接口。[配置说明](https://learn.chatgpt.com/docs/config-file/config-advanced#add-custom-file-handlers)

Codex 生产运行不必常驻 Vite 或额外 HTTP 界面服务。Bits & Bolts 的[构建脚本](https://github.com/openai/mcp-extensions/blob/main/plugins/bits-and-bolts/scripts/build-app.mjs)将前端脚本与样式内联为 HTML，其[服务端](https://github.com/openai/mcp-extensions/blob/main/plugins/bits-and-bolts/src/server/index.ts)使用本地 stdio MCP 提供打包资源；仍有 MCP 工具进程和 App 的界面渲染开销。[本地插件安装](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually)允许通过个人或仓库 marketplace 私下安装测试，无需先公开发布。

Claude Code 桌面 App 的[文件面板](https://code.claude.com/docs/en/desktop#open-and-edit-files)可打开和编辑本地项目文件，但未声明原生 JSON Canvas 图形预览。其 [Mods 界面接口](https://code.claude.com/docs/en/plugins/mods/interface)支持自建 Pane 与宿主绘制的 Box、Text、Button 等元素。深入核对[官方类型声明](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts#L11214-L11221)后，已确认 Client 与 hooks 环境均没有 DOM，不能原样运行依赖 DOM 的 React Flow；Client 的 module 是插件内 JS/TS 路径，也不是任意 HTML 入口。[Svg 元素](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts#L9540-L9574)只开放有限的悬停与样式交互，禁止脚本和事件属性，不能借它装入 React Flow。未找到按文件扩展名接管原有文件侧栏的公开注册接口。

因此 Claude Code App 目前有两条不同成本的路线：保留现有完整编辑器时，用 App 内的 [Browser 面板](https://code.claude.com/docs/en/desktop#preview-your-app)承载本地页面；若坚持 Mods 自建面板，则另做关系图预览与字段表单，通过 hooks 读写 API 衔接资料，完整拖动、连线体验还需另行验证和实现。后者不是对 React Flow 换一个入口，不能以“已支持 Mods”承诺现有画布直接嵌入。更换为其他网页框架也不会消除无 DOM 的宿主限制。

运行开销应按实际机制判断：上述 MCP App 仍是隔离 iframe 中的网页界面，放入侧栏不会消除 React、图节点、连线和编辑状态的开销。生产构建可打包界面资源，避免把 Vite 开发服务器作为使用要求，也无需为此再包装一套独立桌面浏览器；但宿主隔离视图与 MCP 工具服务仍可能增加进程和内存。建议按需加载编辑器、关闭面板时释放交互资源，继续只显示文字卡片与连线、不自动嵌入 PDF 或原文网页。比较时用同一张图记录宿主、相关渲染进程及工具服务的总内存增量，不以位置在“侧栏”或“网页”推断更轻。只读场景可另评估静态预览以免运行完整编辑器，但不以静态图片替代用户要求的手工编辑。[UI 隔离与打包](https://developers.openai.com/plugins/build/chatgpt-ui)

ChatGPT 官方建议优先用开放 MCP Apps 协议实现可复用 UI，再加平台专用扩展；UI 通过隔离 iframe 与宿主通信，不能将现有浏览器文件句柄视为跨宿主通用能力。文件长期保存仍应落在明确的本地目录或文件服务，避免把聊天组件状态当作论文唯一存档。个人测试和公开分发也要区分：[本地插件测试与打包](https://developers.openai.com/plugins/build/plugins)支持本地来源；[本地 MCP 的公开提交](https://developers.openai.com/plugins/deploy/desktop-only)目前有批准伙伴限制，这不等于禁止个人本地测试。

建议顺序：先完成当前编辑器的完整构建与运行验证；按用户偏好，优先仿照官方文件插件在 Codex App 核验 `.canvas` 入口、资源读写和刷新，再测内存。Claude Code App 若优先复用完整交互，先采用内置 Browser；若用户坚持专用面板，则单独评估 Mods 界面的功能与成本，不预先重写现有 React 编辑器。独立网页继续作为通用入口，MCP 工具与 MCP Apps UI 按具体接入需要封装。此顺序是基于公开接口和现有源码的判断，未测移植工时、性能或各桌面端文件保存能力。

## 后续验证顺序

1. 对后续修改运行前端测试、完整 TypeScript 检查及插件构建，并在真实 DSH 复测相关界面操作。
2. 跟进插件管理总开关未立即卸载的限制；在不支持文件句柄的浏览器验证回退流程，Desktop 单独验收。
3. 在真实数据规模下测量响应与内存，再决定是否需要搜索、布局或长笔记/附件适配；不提前承诺节点容量。

当前六个业务字段已实现，先在实际论文整理中使用，再决定是否需要来源证据、阅读状态等扩展。

## 选型记录

此前比较了 DOT、Mermaid、draw.io 和 JSON Canvas，曾选择 Mermaid 并实现其 API。用户随后确认转向 JSON Canvas 与 React Flow；旧选择理由保留如下。

- DOT：文本紧凑、可保存字符串属性，显示自定义字段需要标签映射。
- draw.io：已有可视编辑和自定义属性，但 XML 更繁杂。旧 [draw.io 样例](../../examples/paperstream.drawio) 只保留为选型记录，不作为当前主文档。
- JSON Canvas：已有节点、边与坐标，三个语义字段仍需约定与编辑器兼容验证。

运行负担需区分文档与工具：Mermaid 文本很小，在已有编辑器中预览方便；其官方命令行导出涉及 Node.js 与 Puppeteer 驱动的浏览器。此次选择依据用户偏好的文本维护方式，没有进行统一内存或性能测试。[Mermaid 介绍](https://mermaid.js.org/intro/)、[Mermaid CLI](https://github.com/mermaid-js/mermaid-cli)

此前核验的 draw.io Desktop 32.6.10 Windows 安装包为 137 MB，四节点四条边旧样例为 4257 字节；这些数值分别是下载包与单个文档大小，不代表运行内存。[发布文件列表](https://github.com/jgraph/drawio-desktop/releases/expanded_assets/v32.6.10)
