# Paperstream for Claude Code

这是一个本地 Claude Code 插件，复用现有画布与 Python API。`/paperstream:open 文件路径` 启动只绑定该 `.canvas` 的本地编辑页面；Claude Code 桌面版可用 Browser 预览承载它，普通浏览器也能打开。

这条接入不接管 Claude 的原生 `.canvas` 文件面板，也不把 Codex 专用的文件协议搬过去。插件本身不调用 Anthropic API、无需 API key；运行 Claude 会话仍需官方支持的账号或凭据。没有账号时可以先构建、校验插件并完整测试本地画布读写。

## 构建与检查

在仓库根目录运行：

```sh
npm ci --prefix web
npm --prefix claude run typecheck
npm --prefix claude run build
npm --prefix claude test
python3 -m unittest discover -s tests -v
```

构建沿用现有 web 依赖，不增加 Python 第三方依赖。`claude/dist/plugin/` 包含页面、Python 包与启动器，可整体移动到其他目录；运行时只需 Python 3.10+，无需 npm、Node、源码仓库或持续运行的 Vite。构建还生成 `claude/dist/paperstream-claude-0.1.0.zip`，解压后的 `paperstream/` 就是完整插件，可交给有账号的人验收，无需先上架。

## 本地使用

即使没有 Claude 账号，也可以启动编辑器：

```sh
python3 claude/dist/plugin/scripts/paperstream.py serve /absolute/path/papers.canvas --port 3817
```

打开命令输出的完整本机 URL。它带一次随机令牌，只授权启动时指定的文件。端口被占用时换一个端口或用 `--port 0`，不要停止其他服务。进程保持前台运行，Ctrl-C 停止；加 `--read-only` 可只查看。不会自动启动浏览器、创建图或联网安装依赖。

有 Claude CLI 后可以先做官方校验，再临时加载：

```sh
claude plugin validate ./claude/dist/plugin --strict
claude --plugin-dir ./claude/dist/plugin
```

会话内使用 `/paperstream:open /absolute/path/papers.canvas`。持久安装可使用本地 marketplace：

```sh
claude plugin marketplace add /absolute/path/dsh-paperstream/claude
claude plugin install paperstream@paperstream-local
```

以上路径是源码开发方式；分发时给完整 `dist/plugin` 文件夹即可。不要单独复制 `SKILL.md` 或启动器，也不要把仓库外目录写死进插件。

## Claude Code 桌面 Browser

本机 Code 会话可以用 Browser 打开上述 URL。若需要 Preview 菜单管理启动进程，在目标项目根现有 `.claude/launch.json` 中合并一个配置，保留其他配置：

```json
{
  "version": "0.0.1",
  "configurations": [{
    "name": "Paperstream",
    "runtimeExecutable": "python3",
    "runtimeArgs": ["/absolute/plugin/scripts/paperstream.py", "serve", "/absolute/path/papers.canvas", "--port", "3817"],
    "port": 3817
  }]
}
```

将两处路径替换为实际文件，打开进程输出的含令牌链接；只打开裸端口不会获得文件权限。此配置属于你的项目，插件不会自动覆盖它。SSH、云端转发及移动端不属于当前本机桥的验证范围。

## 保存与外部修改

编辑即时进入当前画布，点击保存才写磁盘。写回经过 `CanvasGraph` 的严格 JSON 校验、原始版本检查、锁与原子替换；未知字段和数组顺序保留。外部文件变化时，干净画布在重新聚焦或点击重载后更新，有本地修改时保留草稿；旧版本不能通过重复保存覆盖新内容。格式尚未完整的输入也受慢读保护。没有自动写盘、任意文件路径、目录浏览、创建或删除接口。

服务只监听 `127.0.0.1`，检查 Host、Origin、Bearer 令牌和 If-Match，不提供 CORS。静态页面不含文件资料，文档请求另行鉴权。新符号链接或父目录替换会被拒绝；它不是隔离恶意本机进程的安全沙箱，外部写入检测沿用现有 API 的 best-effort 边界。

已有 Codex 的资源会话负责慢读、冲突和输入保护，Claude 桥只增加 HTTP 传输，不复制另一套状态机。这个包不包含 PPT、演示或新的卡片种类。

## 账号与验收边界

本地构建、插件校验、便携包运行、普通浏览器编辑保存和冲突测试均可不登录。真实 Claude 会话发现并执行 Skill、权限交互、桌面 Browser 内运行仍需有账号后实测；普通浏览器通过不能替代它们。CLI 的官方 API/云服务认证渠道也不等于桌面订阅登录。

依据：[插件创建](https://code.claude.com/docs/en/plugins/create)、[插件命令](https://code.claude.com/docs/en/plugins/cli-reference#plugin-validate)、[桌面预览](https://code.claude.com/docs/en/desktop#configure-preview-servers)、[认证渠道](https://code.claude.com/docs/en/authentication)。
