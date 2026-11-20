# Paperstream Agent 自动部署协议

本文件面向帮你在本机拉取并安装 Paperstream 的 AI Agent（以及希望通过单一脚本完成部署的维护者）。所有探查、构建、安装与冒烟验收统一由零依赖标准库脚本 [`scripts/setup.py`](scripts/setup.py) 完成，避免跨目录拼装容易出错的手工命令。

## 给用户：可以这样请你的 Agent 帮忙

> 帮我看看 `https://github.com/hello-jl/paperstream` 里的 `DEPLOY.md`，结合我当前的本机环境和使用习惯，介绍一下有哪些合适的本地安装方式（比如直接用 Releases 里的预构建包，还是从源码安装）；等我确认后再帮我配置。

---

## 依赖全景与逐级回退策略

部署优先选用高集成形态；如果某层环境不满足、下载失败或宿主校验不通过，不要强行覆盖配置或降级强编，按下面从下到上的**优雅回退阶梯**降一级安装：

| 部署层级 | 适用组合 / Target | 实际依赖 | 若失败如何回退 |
| --- | --- | --- | --- |
| **Level 4：源码构建与前端开发**（路线 B） | `setup.py build` / Vite 开发 | Python ≥ 3.10 + **Node.js ≥ 22.18 + npm** | 构建或 `npm ci` 失败 → 改走 **路线 A（`setup.py fetch`）** 使用预构建包；或降级到 Level 1 |
| **Level 3：对话内嵌 / 原生面板** | `mcp` / `codex` / `dsh` | `mcp` / `codex`：通过 `fetch` 免 `npm ci`，运行时需 **Node.js ≥ 22** + Python ≥ 3.10<br>`dsh`：通过 `fetch` 拉取 `.tgz` 只需 Python ≥ 3.10 + **DSH Web `0.2.2-rc.1`** | 下载/校验失败时若有 Node ≥ 22.18 可改走路线 B 自编译；仍失败或宿主不兼容则回退到 **Level 2 / Level 1** |
| **Level 2：离线本地桥 / Claude 插件** | `cli` + `skill` + `serve`（或 `claude`） | **仅 Python ≥ 3.10**（通过 `setup.py fetch` 使用 Releases，无需 Node.js / npm） | 若 Releases 下载失败且无 Node.js 自编译 → 回退到 **Level 1** |
| **Level 1：最小本地人机协作** | `cli` + `skill` + 在线工作台 | **仅 Python ≥ 3.10**（零第三方 Python 包） | CLI 依次尝试 `uv` → `pipx` → `~/.local/bin/paperstream` shim；若均不可写或不想动全局目录，Agent 可直接在仓库内用 `python3 -m paperstream` |
| **Level 0：零本机环境兜底** | 在线工作台 | **仅现代浏览器** | 直接打开 `https://hello-jl.github.io/paperstream/` 本地读写电脑上的 `.canvas` 文件 |

---

## Agent 执行流程（5 步状态机）

### 第 1 步：只读体检（不改任何系统文件）

在仓库根目录运行：

```sh
python3 scripts/setup.py doctor --json
```

读取返回的 `python`、`node`、`npm`、`python_installers`、`hosts`、`built_artifacts`、`existing_install`、`recommended_targets` 以及 `install_methods`（默认推荐 `release` 路线，同时报告 `source` 路线是否可用）。脚本支持在所有子命令中加 `--json`，业务/环境错误通过 stderr 输出结构化 JSON（退出码 `1`，用法错误 `2`）。

### 第 2 步：选择路线与目标，并向用户一次性确认

结合 `doctor` 结果与你当前所处的客户端环境，按下面映射表给出建议：

| 用户环境 / 目标宿主 | 建议目标（`--target`） | 安装后能用什么 |
| --- | --- | --- |
| 通用终端 Agent（任意有 Shell 的 Agent） | `cli`, `skill`, `serve` | 全局 `paperstream` CLI、完整 Skill（含 `references/api.md`）、`paperstream serve` 本地单文件画布 |
| Claude Code（CLI 或桌面 Code） | `cli`, `skill`, `serve`, `claude` | 以上能力 + `/paperstream:open` 本地插件 |
| Claude Desktop（无 Shell 对话内嵌画布） | `cli`, `skill`, `mcp` | 全局 CLI + 标准 stdio MCP Apps 工具与内嵌画布（需用户至少指定 1 份 `.canvas` 或 `--use-example`） |
| ChatGPT / Codex 桌面端 | `cli`, `skill`, `codex` | 全局 CLI + 原生侧栏 `.canvas` 文件编辑器插件 |
| DeepSeek Harness (DSH Web) | `cli`, `skill`, `dsh` | 全局 CLI + DSH 主面板插件 |
| 仅有 Python 3.10+（无 Node.js / npm） | `cli`, `skill`, `serve`（及 `claude` / `dsh`） | 统一走 **路线 A（`fetch`）** 无需编译即可使用；若仅用纯命令行与在线画布则只需 `cli`, `skill` |

在修改仓库外文件或下载大产物之前，**一次性**向用户确认以下四件事：
1. **安装路线**（优先推荐默认路线，并说明可互换）：
   - **路线 A（默认推荐）：用 GitHub Releases 预构建包（`setup.py fetch`）**——无需安装 `npm` 依赖，无需本地编译前端；
   - **路线 B：本地安装依赖从源码自编译（`setup.py build`）**——需 Node.js ≥ 22.18 + npm，适合想修改源码或拉不到 GitHub Releases 的情况。
2. 本次要安装的 `targets`；
3. 将写入的全局路径（例如 `~/.local/bin/paperstream`、Skill 目录或 `claude_desktop_config.json`）；
4. 若安装 `mcp`，由用户明确指定要授权的 `.canvas` 文件路径（或明确同意使用 `--use-example` 示例图）。

### 第 3 步：获取预构建包（路线 A）或从源码构建（路线 B）

> [!IMPORTANT]
> **失败互退原则**：任意一条路线报错时，不要静默跳过或强行覆盖环境，**主动提醒用户原因并建议切换另一条路线**（或降级到 Level 1 纯 Python `cli + skill` + 在线工作台）。

- **路线 A（默认推荐）：从 GitHub Releases 拉取并校验 `SHA256SUMS.txt`**：

```sh
python3 scripts/setup.py fetch --target serve --json
# 支持 web, serve, claude, mcp, codex, dsh, all（可选 --tag v0.1.0 或 --from-dir /path/to/downloaded）
```

> 若网络无法访问 GitHub Releases、校验失败或缺少目标资产，提示用户：**如本机已有 Node.js ≥ 22.18 与 npm，可改试路线 B（`python3 scripts/setup.py build`）；否则可退回 Level 1（`cli,skill` + 在线工作台）。**

- **路线 B：本地从源码构建（需要 Node.js ≥ 22.18 与 npm）**：

```sh
python3 scripts/setup.py build --target serve --json
# 按需替换或组合多个 target：web, serve, mcp, claude, codex, dsh, all

# 仅需修改或调试 web/ 前端源码时，可启动本地开发服务器：
npm ci --prefix web && npm --prefix web run dev
```

> 若提示缺少 Node.js ≥ 22.18、或 `npm ci` / 构建报错，提示用户：**可直接改走路线 A（`python3 scripts/setup.py fetch` 拉取预构建包，免安装 npm 依赖）；若仍不可达则退回 Level 1。**

### 第 4 步：统一安装（先 dry-run 预览，再 `--apply`）

无论第 3 步走的是路线 A 还是路线 B，五端后续**完全走同一套 `install` 命令**；不带 `--apply` 时只做校验与变更预览，不修改磁盘：

```sh
# 1. 预览变更
python3 scripts/setup.py install --target cli,skill,serve --json

# 2. 用户确认后应用安装
python3 scripts/setup.py install --target cli,skill,serve --apply --json
```

常用专项与外置包覆盖参数：
- **安装全局 CLI**：`--installer auto|uv|pipx|pip|shim`（`auto` 优先 `uv` → `pipx` → `~/.local/bin/paperstream` 自管 shim；若 `~/.local/bin` 不在 `PATH` 中，结果里的 `path_hint` 会提示）。也可直接用标准打包入口 `uv tool install -e .` 或 `pip install --user -e .`。
- **安装独立 `serve` 前端**：默认使用 `fetch` 或 `build` 准备好的 `dist/serve/app.html`（或 `claude/dist/app.html`）；也可用 `--app-source /path/to/app.html` 指定手工解压的文件/目录，安装到 `$PAPERSTREAM_DATA_DIR` / `$XDG_DATA_HOME/paperstream` / `~/.local/share/paperstream`。
- **安装 Skill**：通过 `--host agents|claude|codex`（可多次传入）或 `--skill-dir /path/to/skills` 安装**完整** [`skills/paperstream/`](skills/paperstream/SKILL.md) 目录（含 `references/api.md`）。
- **配置标准 MCP（Claude Desktop）**：必须传 `--canvas /abs/path/to/papers.canvas`（可重复）或 `--use-example`，可选 `--read-only`、`--mcp-package <dir>`、`--claude-config <path>`。应用前会自动将原配置备份到 `*.paperstream-bak`，仅合并 `mcpServers.paperstream`。
- **安装宿主插件（`claude` / `codex` / `dsh`）**：`fetch` 与 `build` 后均会自动找到对应产物；如手工解压或指定外部包，分别可传 `--claude-package <dir>`、`--codex-package <dir>` 或 `--dsh-package <path-to-tgz-or-dir>`（其中 `.tgz` 安装和校验无需本机 Node.js）。

### 第 5 步：隔离冒烟验收并汇报结果

安装完成后立即运行（同样统一覆盖 `fetch` 与 `build` 产物）：

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
