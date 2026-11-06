# Paperstream 的 DSH 界面插件

这个目录把 [独立编辑器](../web/) 放进 DSH 的主面板，并在左侧导航加入 Paperstream。编辑器复用宿主 React；文件仍由浏览器选择、保存或下载，不依赖 Obsidian。

当前接入按 **DSH 0.2.2-rc.1** 编写，并于 2026-11-06 在 macOS arm64、Node.js 26.12.1、Chrome 的真实 DSH Web 中完成下述联调。`engines.dsh` 严格限定该版本；Desktop 和其他宿主版本尚未验证，升级范围前应重新联调。

## 构建

在项目根目录执行：

```sh
npm --prefix web ci
npm --prefix web run build
npm --prefix dsh run build
npm --prefix dsh test
node dsh/verify-build.mjs
```

`web/package-lock.json` 已生成，使用 `npm --prefix web ci` 安装锁定依赖。`dsh/build.mjs` 直接复用 `web/node_modules` 中的 React、React Flow 和 esbuild，不要求另装一套依赖，也不依赖 DSH 源码工作区。独立编辑器要求 Node.js 22.18+；本次 DSH 版本要求 Node.js 24.9+。

产物为 `dsh/lib/index.js` 和 `dsh/lib/client.js`。构建会提取编辑器 CSS，将其嵌入插件工厂；React 及 React DOM 保持 external，由 DSH 的共享模块表提供。产物不提交 Git。

`verify-build.mjs` 检查浏览器产物能向 DSH loader 注册正确的工厂；它不等于宿主集成测试。网络不可用时仍能运行 `npm --prefix dsh test`，但不能据此断言完整前端构建已通过。

## 安装与打开

先确保目标 DSH Web 已经正常启动过，且命令行安装插件所需的 pnpm 可用。构建成功后，在项目根目录执行：

```sh
dsh plugin --profile web add ./dsh
dsh --profile web --dump-config
dsh web
```

相对目录安装按照官方流程链接本地目录。`--dump-config` 应包含 `dsh-paperstream` 层和 `paperstream` 行。打开 Web 后，左侧导航应出现 **Paperstream**，点击进入编辑器，再从工具栏选择本机 `.canvas` 文件。

也可将 DSH 与配置隔离在当前项目中，本次使用的安装方式为：

```sh
npm install --prefix .local/dsh-runtime @deepseek-ai/dsh@0.2.2-rc.1 pnpm@10
export DSH_HOME="$PWD/.local/dsh-home"
export PATH="$PWD/.local/dsh-runtime/node_modules/.bin:$PATH"
dsh --profile web --dump-config
dsh plugin --profile web add ./dsh
dsh web --no-open --host 127.0.0.1 --port 3080
```

`--dump-config` 首次运行会初始化 Web profile。本次安装使用 pnpm 10.34.9；`.local/` 已被 Git 忽略。开发机已有 `.local/start-dsh.sh`，后续可从项目根目录执行 `sh .local/start-dsh.sh`。打开 DSH 输出的地址后，选择 [CNN 演进图](../examples/cnn-evolution.canvas) 或 [ResNet 关系图](../examples/resnet.canvas)。

如需分发预构建包，在 `dsh/` 目录执行 `npm pack`，再在目标机器使用：

```sh
dsh plugin --profile web add /absolute/path/dsh-paperstream-0.1.0.tgz
```

`prepack` 会拒绝缺少产物或工厂格式不正确的包。不要直接从 Git 安装本目录的未构建源文件：构建依赖相邻的 `web/`，它不是一个能独立执行 prepare 的包。

Desktop 与 npm CLI 的安装空间不同；不要假定装进 npm 的 `web` profile 就会自动出现在桌面版中。本次尚未验证 Desktop 安装本地预构建包的入口，需要按目标版本自身的插件安装流程验证。

## 文件与草稿

- 文件选择器面对的是**运行浏览器的机器**。远程 DSH 的工作区文件不会因此自动变成本机文件；本插件没有接入 Host 文件 RPC。
- 保存到原文件取决于浏览器文件句柄支持与用户授权；下载/导出会产生新文件。选择文件不表示服务器获得了读写权限。
- 插件给编辑器传入 `draftKey="dsh-paperstream-main"`，用于保留当前页面的草稿。草稿恢复不会自动恢复原文件的写入句柄，恢复后需要另存或导出。
- 浏览器草稿是临时恢复手段，不能替代 `.canvas` 文件。关闭浏览器、清理站点数据或跨设备使用前先保存文件。
- DSH 主面板切换可能卸载组件。本插件没有伪造宿主的“取消离开”接口；编辑器负责草稿恢复与页面关闭提示。禁用或升级插件前先保存。

自动化仍通过项目的文件 API 维护图；插件没有额外注册模型工具或图文档文件 HTTP API。宿主提供下面两个用途受限的控制路由。

## DSH 本地主题与原文浏览器

主题由宿主保存到 `DSH_HOME/paperstream/preferences.json`；未设置 `DSH_HOME` 时使用 `~/.dsh/paperstream/preferences.json`。苔绿、纸白、夜间对应 `sage`、`paper`、`night`，各画布共用，`.canvas` 不携带主题。`GET/PUT /paperstream/preferences` 使用 DSH 官方 `webServer.register` 契约，每次请求先调用 `connection.requestRejection`，沿用宿主的 Host/Origin 与登录 cookie 校验。写请求只接受一个合法主题、JSON 内容类型和 ≤ 4 KiB 的请求体；写入排队并通过临时文件原子替换，保留已有未知属性，损坏偏好文件拒绝覆盖。

客户端读写失败会显示“主题未同步”，使用浏览器同源存储的回退值，而不宣称已保存到 DSH。真实本机验证已通过：重启宿主后读取主题没有回退提示，点击切到纸白后，`.local/dsh-home/paperstream/preferences.json` 实际写入 `{"theme":"paper"}`。

`POST /paperstream/open-url` 用于请求宿主打开系统默认浏览器。它先执行同一认证校验，再要求请求 socket 的地址为回环地址；只接收一个无凭据、无控制字符的绝对 HTTP(S) URL，JSON 请求体同样限制为 4 KiB。macOS 调用 `/usr/bin/open`，Linux 调用 `xdg-open`，URL 作为单独 argv 参数传递，不经 shell；Windows 当前明确返回不支持。只有系统打开器成功返回才确认成功，失败会提示使用普通原文链接。

该操作打开的是 **DSH 宿主机器** 的默认浏览器。回环检查针对 socket peer，不是物理同机证明；代理或 SSH 转发可能仍呈现回环地址。直接远程连接不通过该本机入口，远程阅读应右键卡片的普通原文链接在客户端浏览器打开。本轮只验证了本机 macOS：点击 LeNet 卡片的原文入口，经宿主 `/usr/bin/open` 打开了实际 Chrome 论文页。Linux、Windows、远程和 Desktop 未记为真机通过，也没有修改系统默认浏览器设置。

这两个路由的入口与测试见 [宿主实现](src/index.mjs)、[主题测试](test/preferences.test.mjs)、[外链测试](test/open-url.test.mjs)。修改宿主入口后需要重新构建；若宿主热更新未重载路由，需要重启 DSH。

## 卸载与检查

先保存画布，再通过 DSH 插件管理页面禁用/卸载，或运行：

```sh
dsh plugin --profile web remove dsh-paperstream
```

插件释放通过 `ctx.effect` 注册的导航项、主面板和自身样式。若当前就在 Paperstream，释放主面板前切回 Conversation；独立的 `.canvas` 文件不会被删除，浏览器草稿也不会被插件清除。

本次已观察到代码热更新卸载当前画布时返回 Conversation。但插件管理总开关的 Off 状态虽然能持久化，导航未立即卸载；切回 On 后已恢复。这是当前宿主联调的已知限制，不能把总开关动态禁用视为通过。

2026-11-06 的 Chrome / DSH Web 实测已通过：

- 左侧入口、画布显示、本机文件选择、论文详情编辑及拖动；新建空白画布的确认流程。
- 未应用表单时禁用保存；取消放弃修改后保留输入；应用修改、撤销和重做。
- 保存写回测试副本，并通过 Python API 回读核对；外部 API 修改文件后，界面保存拒绝覆盖，重新读取显示外部内容。
- “只看附近”显示 2/3 张卡片时，保存仍保留完整 3 张卡片和 2 条关系；放大和适应视图。
- 未应用的表单修改在切换到 Plugins 后返回仍保留，画布维持已应用内容并显示草稿恢复提示；恢复后保存仍须先应用，重新读取禁用，因为文件句柄未恢复。
- 选中已有卡片后点击“＋论文”正常进入空表单，不再被旧选择抢回；新增中文长标题、多行中文及长英文词的测试卡成功。
- 卡片按内容自动增高，手动收窄后重新换行并增高，全部文字和年份保持可见；缩放控件图标可见。
- 通过按钮新增关系、编辑关系说明、确认删除关系并撤销恢复；删除带关系卡片时提示关联数量，确认后卡片及其关系一起删除，撤销可恢复两者。
- 另存为测试副本成功，经 CanvasGraph 回读确认 4 张卡片、3 条关系，以及长卡片的宽 225、高 471 均已持久化。
- 关系说明可点击编辑，长中文说明正常换行；拥挤的 4 卡片、3 标签图中没有文字遮挡卡片，拖动卡片占据原标签位置后，标签自动移到空白处。
- CNN 四篇样例完整显示，初始视图包含关系说明。拖动 LeNet 底部连接点到 VGG 左侧可进入正确起终点的关系表单，应用后增加一条边，撤销后恢复原有 3 条边并保存。
- 下载副本完成，下载文件通过 Python Canvas 校验；“适应视图”同时计入卡片与标签边界，包括负坐标。
- “定位论文”选择 LeNet 后正确定位并进入详情；点击原文链接打开作者页面，显示论文标题、作者及 1998 年发表信息。
- 自动高度的长内容改短后正确收缩；论文边框 5 px、关系线 6 px 保存后回读正确；手动 resize 切为 manual，并保存宽 396、高 277。
- 齿轮和右键均打开就近详情浮层，右下角卡片的浮层仍位于工作区内；手动高度切回自动模式后正确收缩。
- 简称与关系说明可双击原位编辑并用 Enter 应用；要点的 Enter 保留换行，Cmd+Enter 应用。连续快速输入 `abc` 完整保留，修复了输入晚一帧的问题。
- 原位编辑的撤销与“×”取消通过；详情先修改原题，再原位修改简称并取消后，原题草稿仍保留；关闭未应用的详情会确认。
- 双向箭头两端显示正确并保存；Python 回读确认 `fromEnd`/`toEnd` 均为 `arrow`、关系新文本正确，节点边框 5 px 与独立关系线 6 px 保持各自值。

论文卡片现在默认按内容自动增高和收缩。手动调整尺寸后切换到手动高度模式，保留宽度和留白，但高度不低于内容需要；详情中的“卡片高度”可切回自动模式。论文边框和关系线粗细范围为 0.5–8 px，默认分别为 1 px、1.8 px。外观保存在节点或边的 `paperstreamStyle` 扩展中，修改时保留未知属性。

年份固定在卡片内部右下角，手动高度留白时仍贴底；有年份时为正文预留独立的底部空间并计入自动高度，无年份则不预留。实际 DSH 已验证：手动拉高 LeNet 卡片后，1998 随底边移动；应用八行正文后卡片继续增高，末行与年份保持留白，关系标签避让正常。

详情改为就近浮层：卡片右上角齿轮，或卡片/边右键打开；浮层限制在工作区边界内，不再使用固定右栏。双击简称、要点或关系文字直接编辑，Enter 应用简称/关系，Ctrl/Cmd+Enter 应用多行要点，Esc 取消；应用后再保存文件。箭头方向支持正向、反向、双向和无箭头，使用同一条边的标准 Canvas `fromEnd`/`toEnd`，不会额外生成反向边。CNN 示例的 AlexNet 与 VGG 已通过 API 设置为双向方法对照，双向箭头不表示相互引用。

标签避让只改变显示位置，不改动论文卡片坐标或文件里的关系说明；拥挤时标签可能移到图外侧，“适应视图”会将其一起纳入。

上一轮检查通过：前端 52 项、DSH 生命周期 5 项、Python 73 项、Python/TypeScript 互操作，以及独立前端和 DSH 插件构建。就地编辑、局部浮层、双向箭头及高度/粗细设置已按上述范围手测；未将所有方向逐一切换或全部键盘组合视为已覆盖。

本轮工作台的真实 DSH 验证新增：简约顶部、底部状态栏和竖向布局；Note 的分点显示、空白双击插入菜单、两步点击创建空说明边；将边转换为共享关系节点后，再把第二条边接入同一文本。导入 fig 后保存副本，Python 回读确认 6 个节点、6 条边，其中 4 条为空说明边、共享节点有 2 条入边，图片 data URL 实际随文档保存。PNG 已在真实浏览器生成并通过图像查看核对；SVG/PPTX 的数据与包结构已检查，PPTX 尚未在 PowerPoint 中打开。

宿主主题落盘和 macOS 系统默认浏览器调用按上节完成真机验证。最终交互为默认滚轮缩放、手拖空白平移，Alt + 滚轮调选中线重；缩放锚点、边界与修饰键优先级经过辅助函数测试。Fig 鼠标拖动后的 53% 宽度已保存并回读核对。跨平台兼容和性能仍待验证。

当前 Chrome 的 HTTP 页面中，Esc 在到达编辑器前被浏览器环境拦截，只出现失焦；同一纯测试页通过 `file://` 打开时能收到 Esc。该浏览器装有 Vimium，测试未改动扩展设置，也未把实际 DSH 的 Esc 取消记为通过；可使用输入框旁的“×”取消。上述记录不代表所有使用场景均无问题；Desktop、不支持 File System Access API 的浏览器回退流程，以及大规模性能仍未验证。

## 使用的官方接口

接口于 2026-11-05 核对；以下 master 链接会随上游更新。

- [主面板 `main` 与 `ctx.layout.selectPanel`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/README.md)
- [左侧入口 `sidebar.panellist`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar/README.md)
- [官方 Plugins 主面板的实际注册代码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/src/client/index.ts)
- [共享 React 的 PLATFORM_MODULES](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/web/src/platform.ts)
- [工厂构建格式：`window.__ModuleLoader__.load({ id, factory })`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/tsdown.client.ts)
- [bundle、安装与卸载](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [Desktop 与 Web 的承载关系](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md#desktop-application)
