# Paperstream 的 DSH 界面插件

这个目录把 [独立编辑器](../web/) 放进 DSH 的主面板，并在左侧导航加入 Paperstream。编辑器复用宿主 React；文件仍由浏览器选择、保存或下载，不依赖 Obsidian。

当前接入按 **DSH 0.2.2-rc.1 的官方源码接口** 编写，已提供生命周期测试。开发环境没有 DSH，也无法通过网络安装未缓存的前端依赖，因此尚未完成真实 DSH Web/Desktop 的端到端验证。`engines.dsh` 暂时严格限定该版本；它表达目标版本，不代表已经通过宿主实测。升级范围前先验证下文步骤。

## 构建

在项目根目录执行：

```sh
npm --prefix web install
npm --prefix dsh run build
npm --prefix dsh test
node dsh/verify-build.mjs
```

当前尚无 `web/package-lock.json`；联网安装并生成锁文件后，后续可改用 `npm --prefix web ci`。前端依赖安装需要 npm 网络或完整缓存。`dsh/build.mjs` 直接复用 `web/node_modules` 中的 React、React Flow 和 esbuild，不要求另装一套依赖，也不依赖 DSH 源码工作区。Node 版本遵循 `web/package.json` 的要求。

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

当前只提供人工编辑界面。自动化仍通过项目的文件 API 维护图；这个浏览器插件没有额外注册模型工具或 HTTP API。

## 卸载与检查

先保存画布，再通过 DSH 插件管理页面禁用/卸载，或运行：

```sh
dsh plugin --profile web remove dsh-paperstream
```

插件释放通过 `ctx.effect` 注册的导航项、主面板和自身样式。若当前就在 Paperstream，释放主面板前切回 Conversation；独立的 `.canvas` 文件不会被删除，浏览器草稿也不会被插件清除。

在可运行 DSH 的环境中仍需验证：

1. 左侧入口出现，画布能显示、拖动、连线和编辑。
2. 打开真实 `.canvas`，修改后保存/导出，再重新打开核对内容与位置。
3. 切换面板后返回，确认草稿恢复；恢复后确认不会无提示覆盖原文件。
4. 在画布页禁用插件，确认返回 Conversation、导航项消失、插件样式移除。
5. 分别在 Web 和 Desktop 验证文件选择与保存，不能用单元测试代替这些检查。

## 使用的官方接口

接口于 2026-11-05 核对；以下 master 链接会随上游更新。

- [主面板 `main` 与 `ctx.layout.selectPanel`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/README.md)
- [左侧入口 `sidebar.panellist`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar/README.md)
- [官方 Plugins 主面板的实际注册代码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/src/client/index.ts)
- [共享 React 的 PLATFORM_MODULES](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/web/src/platform.ts)
- [工厂构建格式：`window.__ModuleLoader__.load({ id, factory })`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/tsdown.client.ts)
- [bundle、安装与卸载](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [Desktop 与 Web 的承载关系](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md#desktop-application)
