# Paperstream Agent 自动部署协议

本文件面向帮你在本机拉取并安装 Paperstream 的 AI Agent（以及希望通过单一脚本完成部署的维护者）。所有探查、构建、安装与冒烟验收统一由零依赖标准库脚本 [`scripts/setup.py`](scripts/setup.py) 完成，避免跨目录拼装容易出错的手工命令。

## 给用户：可以这样请你的 Agent 帮忙

> 帮我看看 `https://github.com/hello-jl/paperstream` 里的 `DEPLOY.md`，结合我当前的本机环境和使用习惯，介绍一下有哪些合适的本地安装方式（比如直接用 Releases 里的预构建包，还是从源码安装）；等我确认后再帮我配置。

---

## Agent 执行流程（5 步状态机）

### 第 1 步：只读体检（不改任何系统文件）

在仓库根目录运行：

```sh
python3 scripts/setup.py doctor --json
```

读取返回的 `python`、`node`、`python_installers`、`hosts`、`built_artifacts`、`existing_install` 和 `recommended_targets`。脚本支持在所有子命令中加 `--json`，业务/环境错误通过 stderr 输出结构化 JSON（退出码 `1`，用法错误 `2`）。

### 第 2 步：对照宿主选择目标，并向用户一次性确认

结合 `doctor` 结果与你当前所处的客户端环境，按下面映射表给出建议：

| 用户环境 / 目标宿主 | 建议目标（`--target`） | 安装后能用什么 |
| --- | --- | --- |
| 通用终端 Agent（任意有 Shell 的 Agent） | `cli`, `skill`, `serve` | 全局 `paperstream` CLI、完整 Skill（含 `references/api.md`）、`paperstream serve` 本地单文件画布 |
| Claude Code（CLI 或桌面 Code） | `cli`, `skill`, `serve`, `claude` | 以上能力 + `/paperstream:open` 本地插件 |
| Claude Desktop（无 Shell 对话内嵌画布） | `cli`, `skill`, `mcp` | 全局 CLI + 标准 stdio MCP Apps 工具与内嵌画布（需用户至少指定 1 份 `.canvas` 或 `--use-example`） |
| ChatGPT / Codex 桌面端 | `cli`, `skill`, `codex` | 全局 CLI + 原生侧栏 `.canvas` 文件编辑器插件 |
| DeepSeek Harness (DSH Web) | `cli`, `skill`, `dsh` | 全局 CLI + DSH 主面板插件 |
| 无 Node.js 22.18+ 环境（仅有 Python 3.10+） | `cli`, `skill`（及可选预构建包） | 纯 Python CLI/API 与 Skill；若需 `serve` / `mcp` / `claude`，可直接从 [GitHub Releases](https://github.com/hello-jl/paperstream/releases) 下载对应便携包并配合 `--app-source` / `--mcp-package` 使用 |

在修改仓库外文件之前，**一次性**向用户确认以下三件事：
1. 本次要安装的 targets；
2. 将写入的全局路径（例如 `~/.local/bin/paperstream`、Skill 目录或 `claude_desktop_config.json`）；
3. 若安装 `mcp`，由用户明确指定要授权的 `.canvas` 文件路径（或明确同意使用 `--use-example` 示例图）。

### 第 3 步：构建或准备预构建产物

- **有 Node.js ≥ 22.18 与 npm**：按需执行统一构建（会自动补装缺失的锁文件依赖并按顺序构建）：

```sh
python3 scripts/setup.py build --target serve --json
# 按需替换或组合多个 target：web, serve, mcp, claude, codex, dsh, all
```

- **直接用预构建包（无需 Node.js ≥ 22.18，也最省事）**：可从 [GitHub Releases](https://github.com/hello-jl/paperstream/releases) 直接下载对应版本的预构建便携包（`paperstream-serve-*.zip`、`paperstream-mcp-*.zip`、`paperstream-claude-*.zip`、`paperstream-codex-*.zip`、`dsh-paperstream-*.tgz` 等），解压后进入第 4 步并传入 `--app-source` 或 `--mcp-package`（无 Node.js ≥ 22.18 时不要自行降级编译前端）。

### 第 4 步：先预览（dry-run），再应用（apply）

默认不带 `--apply` 时，`install` 只做校验与变更预览，不修改磁盘：

```sh
# 1. 预览变更
python3 scripts/setup.py install --target cli,skill,serve --json

# 2. 用户确认后应用安装
python3 scripts/setup.py install --target cli,skill,serve --apply --json
```

常用专项参数：
- **安装全局 CLI**：`--installer auto|uv|pipx|pip|shim`（`auto` 优先 `uv` → `pipx` → `~/.local/bin/paperstream` 自管 shim；若 `~/.local/bin` 不在 `PATH` 中，结果里的 `path_hint` 会提示）。也可直接用标准打包入口 `uv tool install -e .` 或 `pip install --user -e .`。
- **安装独立 `serve` 前端**：默认读取 `dist/serve/app.html`（或 `claude/dist/app.html`），无本地构建时加 `--app-source /path/to/app.html`，安装到 `$PAPERSTREAM_DATA_DIR` / `$XDG_DATA_HOME/paperstream` / `~/.local/share/paperstream`。
- **安装 Skill**：通过 `--host agents|claude|codex`（可多次传入）或 `--skill-dir /path/to/skills` 安装**完整** [`skills/paperstream/`](skills/paperstream/SKILL.md) 目录（含 `references/api.md`）。
- **配置标准 MCP（Claude Desktop）**：必须传 `--canvas /abs/path/to/papers.canvas`（可重复）或 `--use-example`，可选 `--read-only`、`--mcp-package <dir>`、`--claude-config <path>`。应用前会自动将原配置备份到 `*.paperstream-bak`，仅合并 `mcpServers.paperstream`。

### 第 5 步：隔离冒烟验收并汇报结果

安装完成后立即运行：

```sh
python3 scripts/setup.py verify --target cli,skill,serve --json
# 或传入实际验证范围：all / mcp / claude / codex / dsh
```

验收只在临时目录中操作临时 `.canvas`，不触碰用户论文文件。向用户报告时务必包含：
1. 实际安装的命令、Skill 目录、配置文件路径（以及备份路径）；
2. 若改动了 Claude Desktop / Codex / DSH 配置，提醒重启对应客户端；
3. 清晰区分“脚本冒烟已通过”与“尚未真机打开的桌面界面”（例如需要用户自己重启宿主点开画布核对）；
4. 给出第一条可立即试跑的命令，例如 `paperstream show examples/resnet.canvas --raw` 或 `paperstream serve /path/to/papers.canvas`。

---

## Agent 安全护栏

- **禁止静默覆盖**：未获 `--force` 授权不覆盖非 `setup.py` 管理的已有同名可执行文件；发现损坏的宿主 JSON 配置立即中止而不覆写。
- **禁止碰无关文件与 Git 推送**：部署过程只读仓库示例代码，不改写用户的 `.canvas` 数据，也不自动执行 `git push`。
- **遵守画布协作规范**：部署完成后日常读写图文档时，遵循 [`skills/paperstream/SKILL.md`](skills/paperstream/SKILL.md) 与 [`AGENTS.md`](AGENTS.md) 中的 `CanvasGraph` / CLI / MCP 边界。
