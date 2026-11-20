#!/usr/bin/env python3
"""Zero-dependency environment doctor, builder, installer, and verifier for Paperstream."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
from http.client import HTTPConnection
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import select
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
from typing import Any, Mapping, Sequence
import zipfile

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from paperstream import CanvasGraph  # noqa: E402
from paperstream.__main__ import resolve_preview_app, user_data_dir  # noqa: E402
from paperstream.preview import create_preview_server  # noqa: E402

SHIM_MARKER = "# Managed by Paperstream setup.py"

BUILD_TARGETS = ("web", "serve", "claude", "mcp", "codex", "dsh")
INSTALL_TARGETS = ("cli", "serve", "skill", "mcp", "claude", "codex", "dsh")
VERIFY_TARGETS = ("cli", "serve", "skill", "mcp", "claude", "codex", "dsh")
SKILL_HOST_SUBDIRS = {
    "agents": (".agents", "skills"),
    "claude": (".claude", "skills"),
    "codex": (".codex", "skills"),
}


class SetupError(RuntimeError):
    """Actionable failure during environment inspection, build, install, or verification."""


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str


def _env_map(env: Mapping[str, str] | None) -> dict[str, str]:
    return dict(os.environ) if env is None else dict(env)


def _home_path(home: Path | None, env: Mapping[str, str]) -> Path:
    if home is not None:
        return home
    if env.get("HOME"):
        return Path(env["HOME"])
    return Path.home()


@contextmanager
def _temp_environ(env: Mapping[str, str] | None):
    if env is None:
        yield
        return
    previous = os.environ.copy()
    os.environ.clear()
    os.environ.update(env)
    try:
        yield
    finally:
        os.environ.clear()
        os.environ.update(previous)


def _run(
    cmd: Sequence[str],
    *,
    cwd: Path,
    env: Mapping[str, str] | None = None,
    timeout: int = 300,
) -> CommandResult:
    proc = subprocess.run(
        list(cmd),
        cwd=str(cwd),
        env=_env_map(env),
        text=True,
        capture_output=True,
        timeout=timeout,
    )
    return CommandResult(proc.returncode, proc.stdout, proc.stderr)


def _run_checked(
    cmd: Sequence[str],
    *,
    cwd: Path,
    env: Mapping[str, str] | None = None,
    timeout: int = 300,
) -> CommandResult:
    result = _run(cmd, cwd=cwd, env=env, timeout=timeout)
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or f"exit code {result.returncode}"
        raise SetupError(f"Command failed ({' '.join(cmd)}): {detail}")
    return result


def _parse_targets(raw: Sequence[str] | None, valid: Sequence[str], *, allow_all: bool = False) -> list[str]:
    if not raw:
        raise SetupError(f"At least one --target is required ({', '.join(valid)}).")
    items: list[str] = []
    for entry in raw:
        for part in entry.split(","):
            name = part.strip().lower()
            if name:
                items.append(name)
    if not items:
        raise SetupError("Target list cannot be empty.")
    allowed = set(valid) | ({"all"} if allow_all else set())
    unknown = [item for item in items if item not in allowed]
    if unknown:
        raise SetupError(f"Unknown target(s): {', '.join(unknown)}. Valid targets: {', '.join(sorted(allowed))}.")
    if allow_all and "all" in items:
        return list(valid)
    deduped: list[str] = []
    for item in items:
        if item not in deduped:
            deduped.append(item)
    return deduped


def _probe_node(env: Mapping[str, str]) -> dict[str, Any]:
    executable = shutil.which("node", path=env.get("PATH"))
    if not executable:
        return {"executable": None, "version": None, "major": None, "minor": None, "ok": False}
    try:
        out = subprocess.run(
            [executable, "--version"], text=True, capture_output=True, timeout=10
        )
    except OSError:
        return {"executable": executable, "version": None, "major": None, "minor": None, "ok": False}
    raw = out.stdout.strip().lstrip("v")
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)", raw)
    if out.returncode != 0 or not match:
        return {"executable": executable, "version": raw or None, "major": None, "minor": None, "ok": False}
    major, minor = int(match.group(1)), int(match.group(2))
    return {
        "executable": executable,
        "version": raw,
        "major": major,
        "minor": minor,
        "ok": (major, minor) >= (22, 18),
    }


def _probe_npm(env: Mapping[str, str]) -> dict[str, Any]:
    executable = shutil.which("npm", path=env.get("PATH"))
    if not executable:
        return {"executable": None, "version": None, "ok": False}
    try:
        out = subprocess.run(
            [executable, "--version"], text=True, capture_output=True, timeout=10
        )
    except OSError:
        return {"executable": executable, "version": None, "ok": False}
    raw = out.stdout.strip()
    return {
        "executable": executable,
        "version": raw if out.returncode == 0 and raw else None,
        "ok": out.returncode == 0 and bool(raw),
    }


def claude_desktop_config_path(env: Mapping[str, str] | None = None, home: Path | None = None) -> Path:
    """Resolve the Claude Desktop MCP config file path across platforms."""
    env_vars = _env_map(env)
    explicit = env_vars.get("PAPERSTREAM_CLAUDE_DESKTOP_CONFIG", "").strip()
    if explicit:
        return Path(explicit)
    home_dir = _home_path(home, env_vars)
    if sys.platform == "darwin":
        return home_dir / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
    if os.name == "nt" or sys.platform.startswith("win"):
        appdata = env_vars.get("APPDATA", "").strip()
        base = Path(appdata) if appdata else home_dir / "AppData" / "Roaming"
        return base / "Claude" / "claude_desktop_config.json"
    xdg_cfg = env_vars.get("XDG_CONFIG_HOME", "").strip()
    base = Path(xdg_cfg) if xdg_cfg else home_dir / ".config"
    return base / "Claude" / "claude_desktop_config.json"


def _atomic_write_text(target: Path, content: str, *, mode: int | None = None) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.tmp-", dir=str(target.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        if mode is not None:
            os.chmod(tmp_path, mode)
        os.replace(tmp_path, target)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


def _atomic_copy_file(source: Path, target: Path, *, mode: int | None = None) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.tmp-", dir=str(target.parent))
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        shutil.copyfile(source, tmp_path)
        if mode is not None:
            os.chmod(tmp_path, mode)
        os.replace(tmp_path, target)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


def _atomic_replace_dir(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{target.name}.stage-", dir=str(target.parent)))
    shutil.rmtree(staging)
    backup: Path | None = None
    try:
        shutil.copytree(source, staging, ignore=shutil.ignore_patterns("__pycache__", "*.py[cod]"))
        if target.exists() or target.is_symlink():
            backup = Path(tempfile.mkdtemp(prefix=f".{target.name}.old-", dir=str(target.parent)))
            backup.rmdir()
            os.replace(target, backup)
        os.replace(staging, target)
        if backup is not None and (backup.exists() or backup.is_symlink()):
            if backup.is_dir() and not backup.is_symlink():
                shutil.rmtree(backup)
            else:
                backup.unlink()
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        if backup is not None and backup.exists() and not target.exists():
            os.replace(backup, target)
        raise


def _artifact_flags(root: Path) -> dict[str, bool]:
    return {
        "web": (root / "web" / "dist" / "index.html").is_file(),
        "serve": (
            (root / "dist" / "serve" / "app.html").is_file()
            or (root / "claude" / "dist" / "app.html").is_file()
        ),
        "mcp": (
            (root / "mcp" / "dist" / "package" / "dist" / "server.mjs").is_file()
            and (root / "mcp" / "dist" / "package" / "dist" / "app.html").is_file()
        ),
        "claude": (
            (root / "claude" / "dist" / "plugin" / "scripts" / "paperstream.py").is_file()
            and (root / "claude" / "dist" / "plugin" / "app" / "app.html").is_file()
        ),
        "codex": (
            (root / "codex" / "dist" / "plugin" / "dist" / "server.mjs").is_file()
            and (root / "codex" / "dist" / "plugin" / "dist" / "app.html").is_file()
        ),
        "dsh": (
            (root / "dsh" / "lib" / "index.js").is_file()
            and (root / "dsh" / "lib" / "client.js").is_file()
        ),
    }


def run_doctor(
    *,
    repo_root: Path | None = None,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> dict[str, Any]:
    """Inspect runtime versions, host CLIs, dependencies, and build/install state."""
    root = (repo_root or REPO_ROOT).resolve()
    env_vars = _env_map(env)
    with _temp_environ(env_vars):
        data_dir = user_data_dir()
    cfg_path = claude_desktop_config_path(env=env_vars, home=home)

    py_ver = sys.version_info
    python_info = {
        "executable": sys.executable,
        "version": f"{py_ver.major}.{py_ver.minor}.{py_ver.micro}",
        "ok": (py_ver.major, py_ver.minor) >= (3, 10),
    }
    node_info = _probe_node(env_vars)
    npm_info = _probe_npm(env_vars)
    installers = {
        "uv": shutil.which("uv", path=env_vars.get("PATH")),
        "pipx": shutil.which("pipx", path=env_vars.get("PATH")),
        "pip": importlib.util.find_spec("pip") is not None,
    }
    hosts = {
        "claude_cli": shutil.which("claude", path=env_vars.get("PATH")),
        "codex_cli": shutil.which("codex", path=env_vars.get("PATH")),
        "dsh_cli": shutil.which("dsh", path=env_vars.get("PATH")),
        "claude_desktop_config": {
            "path": str(cfg_path),
            "exists": cfg_path.is_file(),
            "parent_exists": cfg_path.parent.is_dir(),
        },
    }
    node_modules = {
        "web": (root / "web" / "node_modules").is_dir(),
        "codex": (root / "codex" / "node_modules").is_dir(),
        "mcp": (root / "mcp" / "node_modules").is_dir(),
    }
    artifacts = _artifact_flags(root)
    serve_installed = (data_dir / "app.html").is_file()
    existing_install = {
        "paperstream_cli": shutil.which("paperstream", path=env_vars.get("PATH")),
        "serve_app_path": str(data_dir / "app.html"),
        "serve_app_installed": serve_installed,
    }

    recommended = ["cli", "skill"]
    if node_info["ok"] or artifacts["serve"]:
        recommended.append("serve")
    if (node_info["ok"] or artifacts["mcp"]) and (
        hosts["claude_desktop_config"]["exists"] or hosts["claude_desktop_config"]["parent_exists"]
    ):
        recommended.append("mcp")
    if hosts["claude_cli"]:
        recommended.append("claude")
    if hosts["codex_cli"]:
        recommended.append("codex")
    if hosts["dsh_cli"]:
        recommended.append("dsh")

    return {
        "ok": True,
        "operation": "doctor",
        "repo_root": str(root),
        "platform": sys.platform,
        "machine": platform.machine(),
        "python": python_info,
        "node": node_info,
        "npm": npm_info,
        "python_installers": installers,
        "hosts": hosts,
        "node_modules": node_modules,
        "built_artifacts": artifacts,
        "existing_install": existing_install,
        "recommended_targets": recommended,
    }


def run_build(
    targets: Sequence[str],
    *,
    force_install: bool = False,
    repo_root: Path | None = None,
    env: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Install locked JS dependencies as needed and build requested targets in order."""
    root = (repo_root or REPO_ROOT).resolve()
    env_vars = _env_map(env)
    selected = _parse_targets(targets, BUILD_TARGETS, allow_all=True)

    node_info = _probe_node(env_vars)
    npm_info = _probe_npm(env_vars)
    if not node_info["ok"]:
        raise SetupError(
            f"Node.js >= 22.18 is required to build JS artifacts (found: {node_info['version'] or 'none'}). "
            "Alternatively download prebuilt artifacts from GitHub Releases."
        )
    if not npm_info["ok"]:
        raise SetupError("npm is required to install locked dependencies and build JS artifacts.")

    npm_cmd = npm_info["executable"]
    node_cmd = node_info["executable"]

    installed_deps: list[str] = []
    dep_dirs = ["web"]
    if "mcp" in selected:
        dep_dirs.append("mcp")
    if "codex" in selected:
        dep_dirs.append("codex")

    for pkg in dep_dirs:
        if force_install or not (root / pkg / "node_modules").is_dir():
            _run_checked([npm_cmd, "ci", "--prefix", pkg], cwd=root, env=env_vars, timeout=600)
            installed_deps.append(pkg)

    build_steps = {
        "web": [npm_cmd, "--prefix", "web", "run", "build"],
        "serve": [node_cmd, "scripts/build-serve.mjs"],
        "claude": [npm_cmd, "--prefix", "claude", "run", "build"],
        "mcp": [npm_cmd, "--prefix", "mcp", "run", "build"],
        "codex": [npm_cmd, "--prefix", "codex", "run", "build"],
        "dsh": [npm_cmd, "--prefix", "dsh", "run", "build"],
    }
    ordered = [name for name in BUILD_TARGETS if name in selected]
    built: list[dict[str, str]] = []
    for name in ordered:
        cmd = build_steps[name]
        _run_checked(cmd, cwd=root, env=env_vars, timeout=600)
        built.append({"target": name, "command": " ".join(cmd)})

    return {
        "ok": True,
        "operation": "build",
        "repo_root": str(root),
        "installed_node_modules": installed_deps,
        "built": built,
        "built_artifacts": _artifact_flags(root),
    }


def _install_cli(
    *,
    root: Path,
    env_vars: dict[str, str],
    home_dir: Path,
    installer: str,
    bin_dir: Path | None,
    force: bool,
    apply: bool,
) -> dict[str, Any]:
    chosen = installer
    if chosen == "auto":
        if shutil.which("uv", path=env_vars.get("PATH")):
            chosen = "uv"
        elif shutil.which("pipx", path=env_vars.get("PATH")):
            chosen = "pipx"
        else:
            chosen = "shim"

    if chosen == "shim":
        target_dir = (bin_dir or (home_dir / ".local" / "bin")).expanduser()
        target_bin = target_dir / "paperstream"
        shim_body = "\n".join([
            "#!/usr/bin/env python3",
            SHIM_MARKER,
            "from pathlib import Path",
            "import sys",
            "",
            f"REPO_ROOT = Path({repr(str(root))})",
            "if str(REPO_ROOT) not in sys.path:",
            "    sys.path.insert(0, str(REPO_ROOT))",
            "",
            "from paperstream.__main__ import main",
            "",
            'if __name__ == "__main__":',
            "    raise SystemExit(main())",
            "",
        ])
        if target_bin.exists() or target_bin.is_symlink():
            is_managed = False
            if target_bin.is_file() and not target_bin.is_symlink():
                try:
                    is_managed = SHIM_MARKER in target_bin.read_text(encoding="utf-8")
                except OSError:
                    is_managed = False
            if not is_managed and not force:
                raise SetupError(
                    f"Refusing to overwrite existing unmanaged file at {target_bin}. Pass --force to replace it."
                )
        if apply:
            _atomic_write_text(target_bin, shim_body, mode=0o755)
        path_entries = [Path(p).expanduser() for p in env_vars.get("PATH", "").split(os.pathsep) if p]
        in_path = target_dir in path_entries or target_dir.resolve() in {
            p.resolve() for p in path_entries if p.exists()
        }
        return {
            "target": "cli",
            "installer": "shim",
            "applied": apply,
            "path": str(target_bin),
            "in_path": in_path,
            "path_hint": None if in_path else f"Add {target_dir} to your PATH.",
        }

    cmd_map = {
        "uv": ["uv", "tool", "install", "--editable", str(root)],
        "pipx": ["pipx", "install", "--editable", str(root)],
        "pip": [sys.executable, "-m", "pip", "install", "--user", "--editable", str(root)],
    }
    if chosen not in cmd_map:
        raise SetupError(f"Unsupported CLI installer: {chosen}")
    exe = cmd_map[chosen][0]
    if chosen in ("uv", "pipx") and not shutil.which(exe, path=env_vars.get("PATH")):
        raise SetupError(f"Installer '{exe}' was not found in PATH.")
    if chosen == "pip" and importlib.util.find_spec("pip") is None:
        raise SetupError("Python 'pip' module is not installed.")
    cmd = cmd_map[chosen]
    if apply:
        _run_checked(cmd, cwd=root, env=env_vars, timeout=300)
    return {
        "target": "cli",
        "installer": chosen,
        "applied": apply,
        "command": cmd,
    }


def _resolve_serve_source(root: Path, app_source: Path | None) -> Path:
    if app_source is not None:
        source = app_source.expanduser().resolve()
        if not source.is_file():
            raise SetupError(f"Specified --app-source does not exist: {source}")
        return source
    for candidate in (root / "dist" / "serve" / "app.html", root / "claude" / "dist" / "app.html"):
        if candidate.is_file():
            return candidate
    raise SetupError(
        "No built serve editor bundle found. Run 'python3 scripts/setup.py build --target serve' "
        "or pass '--app-source /path/to/app.html'."
    )


def _install_serve(
    *,
    root: Path,
    env_vars: dict[str, str],
    app_source: Path | None,
    apply: bool,
) -> dict[str, Any]:
    source = _resolve_serve_source(root, app_source)
    with _temp_environ(env_vars):
        dest_dir = user_data_dir()
    dest_app = dest_dir / "app.html"

    notice_root = source.parent if (source.parent / "LICENSE").is_file() else root
    if apply:
        _atomic_copy_file(source, dest_app)
        for name in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
            notice = notice_root / name if (notice_root / name).is_file() else root / name
            if notice.is_file():
                _atomic_copy_file(notice, dest_dir / name)
        licenses_src = notice_root / "licenses" if (notice_root / "licenses").is_dir() else root / "licenses"
        if licenses_src.is_dir():
            _atomic_replace_dir(licenses_src, dest_dir / "licenses")

    return {
        "target": "serve",
        "applied": apply,
        "source": str(source),
        "destination": str(dest_app),
        "data_dir": str(dest_dir),
    }


def _skill_destinations(home_dir: Path, hosts: Sequence[str], skill_dirs: Sequence[Path]) -> list[Path]:
    destinations: list[Path] = []
    if skill_dirs:
        for raw_dir in skill_dirs:
            path = raw_dir.expanduser()
            dest = path if path.name == "paperstream" else path / "paperstream"
            if dest not in destinations:
                destinations.append(dest)
    else:
        chosen_hosts = hosts or ("agents",)
        for host in chosen_hosts:
            if host not in SKILL_HOST_SUBDIRS:
                raise SetupError(f"Unknown skill host '{host}'. Choose from: {', '.join(SKILL_HOST_SUBDIRS)}.")
            dest = home_dir.joinpath(*SKILL_HOST_SUBDIRS[host], "paperstream")
            if dest not in destinations:
                destinations.append(dest)
    return destinations


def _install_skill(
    *,
    root: Path,
    home_dir: Path,
    hosts: Sequence[str],
    skill_dirs: Sequence[Path],
    apply: bool,
) -> dict[str, Any]:
    source = root / "skills" / "paperstream"
    if not (source / "SKILL.md").is_file() or not (source / "references" / "api.md").is_file():
        raise SetupError(f"Repository skill directory is incomplete: {source}")
    destinations = _skill_destinations(home_dir, hosts, skill_dirs)
    if apply:
        for dest in destinations:
            _atomic_replace_dir(source, dest)
    return {
        "target": "skill",
        "applied": apply,
        "source": str(source),
        "destinations": [str(d) for d in destinations],
    }


def _validate_canvas_arg(path: Path) -> Path:
    if path.is_symlink():
        raise SetupError(f"Canvas path must not be a symlink: {path}")
    try:
        st = path.lstat()
    except OSError as exc:
        raise SetupError(f"Canvas file is missing or unreadable: {path}") from exc
    if not stat.S_ISREG(st.st_mode):
        raise SetupError(f"Canvas path must be a regular file: {path}")
    if path.suffix.lower() != ".canvas":
        raise SetupError(f"Expected a .canvas file: {path}")
    return path.resolve()


def _install_mcp(
    *,
    root: Path,
    env_vars: dict[str, str],
    home_dir: Path,
    canvases: Sequence[Path],
    use_example: bool,
    claude_config: Path | None,
    mcp_package: Path | None,
    read_only: bool,
    apply: bool,
) -> dict[str, Any]:
    pkg_dir = (mcp_package or (root / "mcp" / "dist" / "package")).expanduser().resolve()
    server_mjs = pkg_dir / "dist" / "server.mjs"
    app_html = pkg_dir / "dist" / "app.html"
    if not server_mjs.is_file() or not app_html.is_file():
        raise SetupError(
            f"Built MCP package is missing server.mjs/app.html under {pkg_dir}. "
            "Run 'python3 scripts/setup.py build --target mcp' or pass '--mcp-package'."
        )

    node_exe = shutil.which("node", path=env_vars.get("PATH"))
    if not node_exe:
        raise SetupError("Node.js executable was not found in PATH for MCP server configuration.")

    selected_canvases: list[Path] = []
    if canvases:
        selected_canvases = [_validate_canvas_arg(p.expanduser()) for p in canvases]
    elif use_example:
        selected_canvases = [_validate_canvas_arg(root / "examples" / "resnet.canvas")]
    else:
        raise SetupError("MCP install requires at least one --canvas <file.canvas> or --use-example.")

    config_path = (claude_config.expanduser() if claude_config else claude_desktop_config_path(env=env_vars, home=home_dir))
    existing_data: dict[str, Any] = {}
    if config_path.exists():
        try:
            raw_text = config_path.read_text(encoding="utf-8")
            parsed = json.loads(raw_text)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SetupError(f"Existing Claude Desktop config is invalid JSON ({config_path}): {exc}") from exc
        if not isinstance(parsed, dict):
            raise SetupError(f"Existing Claude Desktop config root must be a JSON object: {config_path}")
        servers = parsed.get("mcpServers")
        if servers is not None and not isinstance(servers, dict):
            raise SetupError(f"Existing 'mcpServers' in {config_path} must be a JSON object.")
        existing_data = parsed

    args = [str(server_mjs)]
    for canvas_path in selected_canvases:
        args.extend(["--file", str(canvas_path)])
    args.extend(["--python", sys.executable])
    if read_only:
        args.append("--read-only")

    entry = {"command": node_exe, "args": args}
    merged = dict(existing_data)
    merged_servers = dict(existing_data.get("mcpServers") or {})
    merged_servers["paperstream"] = entry
    merged["mcpServers"] = merged_servers

    backup_path = config_path.with_name(f"{config_path.name}.paperstream-bak")
    if apply:
        if config_path.exists():
            _atomic_copy_file(config_path, backup_path)
        _atomic_write_text(config_path, json.dumps(merged, ensure_ascii=False, indent=2) + "\n")

    return {
        "target": "mcp",
        "applied": apply,
        "config_path": str(config_path),
        "backup_path": str(backup_path) if config_path.exists() else None,
        "mcp_entry": entry,
        "canvases": [str(p) for p in selected_canvases],
        "merged_config_preview": merged,
    }


def _install_host_plugin(
    target: str,
    *,
    root: Path,
    env_vars: dict[str, str],
    apply: bool,
) -> dict[str, Any]:
    if target == "claude":
        plugin_dir = root / "claude" / "dist" / "plugin"
        if not (plugin_dir / ".claude-plugin" / "plugin.json").is_file():
            raise SetupError("Claude plugin is not built. Run 'python3 scripts/setup.py build --target claude' first.")
        cli = shutil.which("claude", path=env_vars.get("PATH"))
        if not cli:
            raise SetupError("Claude CLI ('claude') was not found in PATH.")
        commands = [
            [cli, "plugin", "validate", str(plugin_dir), "--strict"],
            [cli, "plugin", "marketplace", "add", str(root / "claude")],
            [cli, "plugin", "install", "paperstream@paperstream-local"],
        ]
    elif target == "codex":
        plugin_dir = root / "codex" / "dist" / "plugin"
        if not (plugin_dir / ".codex-plugin" / "plugin.json").is_file():
            raise SetupError("Codex plugin is not built. Run 'python3 scripts/setup.py build --target codex' first.")
        cli = shutil.which("codex", path=env_vars.get("PATH"))
        if not cli:
            raise SetupError("Codex CLI ('codex') was not found in PATH.")
        commands = [
            [cli, "plugin", "marketplace", "add", str(root / "codex")],
            [cli, "plugin", "add", "paperstream@paperstream-local"],
        ]
    elif target == "dsh":
        if not (root / "dsh" / "lib" / "client.js").is_file():
            raise SetupError("DSH plugin is not built. Run 'python3 scripts/setup.py build --target dsh' first.")
        node_exe = shutil.which("node", path=env_vars.get("PATH"))
        cli = shutil.which("dsh", path=env_vars.get("PATH"))
        if not node_exe:
            raise SetupError("Node.js executable was not found in PATH.")
        if not cli:
            raise SetupError("DSH CLI ('dsh') was not found in PATH.")
        commands = [
            [node_exe, str(root / "dsh" / "verify-build.mjs")],
            [cli, "plugin", "--profile", "web", "add", str(root / "dsh")],
        ]
    else:
        raise SetupError(f"Unsupported host plugin target: {target}")

    if apply:
        for cmd in commands:
            _run_checked(cmd, cwd=root, env=env_vars, timeout=180)
    return {"target": target, "applied": apply, "commands": commands}


def run_install(
    targets: Sequence[str],
    *,
    apply: bool = False,
    installer: str = "auto",
    bin_dir: Path | None = None,
    force: bool = False,
    app_source: Path | None = None,
    skill_hosts: Sequence[str] = (),
    skill_dirs: Sequence[Path] = (),
    canvases: Sequence[Path] = (),
    use_example: bool = False,
    claude_config: Path | None = None,
    mcp_package: Path | None = None,
    read_only: bool = False,
    repo_root: Path | None = None,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> dict[str, Any]:
    """Preview (--dry-run) or apply installation steps for Paperstream targets."""
    root = (repo_root or REPO_ROOT).resolve()
    env_vars = _env_map(env)
    home_dir = _home_path(home, env_vars)
    selected = _parse_targets(targets, INSTALL_TARGETS, allow_all=False)

    actions: list[dict[str, Any]] = []
    for target in selected:
        if target == "cli":
            actions.append(
                _install_cli(
                    root=root,
                    env_vars=env_vars,
                    home_dir=home_dir,
                    installer=installer,
                    bin_dir=bin_dir,
                    force=force,
                    apply=apply,
                )
            )
        elif target == "serve":
            actions.append(
                _install_serve(root=root, env_vars=env_vars, app_source=app_source, apply=apply)
            )
        elif target == "skill":
            actions.append(
                _install_skill(
                    root=root,
                    home_dir=home_dir,
                    hosts=skill_hosts,
                    skill_dirs=skill_dirs,
                    apply=apply,
                )
            )
        elif target == "mcp":
            actions.append(
                _install_mcp(
                    root=root,
                    env_vars=env_vars,
                    home_dir=home_dir,
                    canvases=canvases,
                    use_example=use_example,
                    claude_config=claude_config,
                    mcp_package=mcp_package,
                    read_only=read_only,
                    apply=apply,
                )
            )
        else:
            actions.append(_install_host_plugin(target, root=root, env_vars=env_vars, apply=apply))

    return {
        "ok": True,
        "operation": "install",
        "mode": "apply" if apply else "dry-run",
        "actions": actions,
    }


def _verify_cli(root: Path, env_vars: dict[str, str], cli_bin: Path | None) -> dict[str, Any]:
    resolved_bin = str(cli_bin) if cli_bin else shutil.which("paperstream", path=env_vars.get("PATH"))
    if resolved_bin:
        cmd_prefix = [resolved_bin]
        mode = "installed_cli"
        run_env = dict(env_vars)
    else:
        cmd_prefix = [sys.executable, "-m", "paperstream"]
        mode = "module_fallback"
        run_env = dict(env_vars)
        existing_pp = run_env.get("PYTHONPATH", "")
        run_env["PYTHONPATH"] = f"{root}{os.pathsep}{existing_pp}" if existing_pp else str(root)

    with tempfile.TemporaryDirectory(prefix="paperstream-verify-cli-") as tmp:
        tmp_dir = Path(tmp)
        canvas_file = tmp_dir / "smoke.canvas"
        _run_checked([*cmd_prefix, "init", str(canvas_file)], cwd=tmp_dir, env=run_env, timeout=30)
        added = json.loads(
            _run_checked(
                [*cmd_prefix, "add-node", str(canvas_file), "--alias", "SmokePaper", "--takeaway", "- Verified CLI"],
                cwd=tmp_dir,
                env=run_env,
                timeout=30,
            ).stdout
        )
        shown = json.loads(
            _run_checked([*cmd_prefix, "show", str(canvas_file), "--raw"], cwd=tmp_dir, env=run_env, timeout=30).stdout
        )
        validated = json.loads(
            _run_checked([*cmd_prefix, "validate", str(canvas_file)], cwd=tmp_dir, env=run_env, timeout=30).stdout
        )
        if not validated.get("valid") or shown["nodes"][0]["id"] != added["node"]["id"]:
            raise SetupError("CLI smoke verification returned unexpected graph data.")
        return {
            "target": "cli",
            "status": "passed",
            "mode": mode,
            "executable": resolved_bin or sys.executable,
            "node_id": added["node"]["id"],
        }


def _verify_serve(root: Path, env_vars: dict[str, str]) -> dict[str, Any]:
    with _temp_environ(env_vars):
        app_path = resolve_preview_app(root)
    if not app_path.is_file():
        raise SetupError(f"Built serve bundle not found at {app_path}.")
    with tempfile.TemporaryDirectory(prefix="paperstream-verify-serve-") as tmp:
        canvas_file = Path(tmp) / "smoke.canvas"
        with CanvasGraph.create(canvas_file) as graph:
            graph.add_node("ServeSmoke", "Verify local preview server")
        server = create_preview_server(canvas_file, app_path, port=0)
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
        thread.start()
        try:
            conn = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
            try:
                conn.request("GET", "/")
                page_resp = conn.getresponse()
                page_body = page_resp.read()
                if page_resp.status != 200 or not page_body:
                    raise SetupError(f"Preview HTTP GET / failed with status {page_resp.status}.")
                conn.request("GET", "/api/canvas", headers={"Authorization": f"Bearer {server.token}"})
                api_resp = conn.getresponse()
                api_body = api_resp.read()
                if api_resp.status != 200:
                    raise SetupError(f"Preview GET /api/canvas failed with status {api_resp.status}.")
                envelope = json.loads(api_body.decode("utf-8"))
                if not envelope.get("etag") or envelope.get("name") != "smoke.canvas":
                    raise SetupError("Preview envelope missing expected metadata.")
            finally:
                conn.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)
    return {
        "target": "serve",
        "status": "passed",
        "app_path": str(app_path),
        "etag": envelope["etag"],
    }


def _verify_skill(root: Path, skill_dir: Path | None) -> dict[str, Any]:
    repo_skill = root / "skills" / "paperstream"
    if skill_dir is not None:
        candidate = skill_dir.expanduser()
        target = candidate if (candidate / "SKILL.md").is_file() else candidate / "paperstream"
    else:
        target = repo_skill
    required = ("SKILL.md", "references/api.md")
    for rel in required:
        repo_file = repo_skill / rel
        target_file = target / rel
        if not target_file.is_file():
            raise SetupError(f"Missing skill file: {target_file}")
        if target_file.read_bytes() != repo_file.read_bytes():
            raise SetupError(f"Skill file differs from repository source: {target_file}")
    return {"target": "skill", "status": "passed", "path": str(target)}


def _verify_mcp(root: Path, env_vars: dict[str, str], mcp_package: Path | None) -> dict[str, Any]:
    pkg_dir = (mcp_package or (root / "mcp" / "dist" / "package")).expanduser().resolve()
    server_mjs = pkg_dir / "dist" / "server.mjs"
    app_html = pkg_dir / "dist" / "app.html"
    for req in (server_mjs, app_html, pkg_dir / "LICENSE", pkg_dir / "THIRD_PARTY_NOTICES.md"):
        if not req.is_file():
            raise SetupError(f"Missing packaged MCP artifact: {req}")
    node_exe = shutil.which("node", path=env_vars.get("PATH"))
    if not node_exe:
        raise SetupError("Node.js executable was not found in PATH for MCP verification.")

    with tempfile.TemporaryDirectory(prefix="paperstream-verify-mcp-") as tmp:
        tmp_dir = Path(tmp)
        canvas_file = tmp_dir / "mcp-smoke.canvas"
        with CanvasGraph.create(canvas_file) as graph:
            graph.add_node("McpSmoke", "Verify stdio MCP handshake")

        proc = subprocess.Popen(
            [node_exe, str(server_mjs), "--file", str(canvas_file), "--python", sys.executable],
            cwd=str(tmp_dir),
            env=env_vars,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            assert proc.stdin is not None and proc.stdout is not None
            init_req = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "paperstream-setup-verify", "version": "0.1.0"},
                },
            }
            proc.stdin.write(json.dumps(init_req) + "\n")
            proc.stdin.flush()
            if os.name == "posix" and not select.select([proc.stdout], [], [], 15)[0]:
                raise SetupError("Timed out waiting for MCP initialize response.")
            init_line = proc.stdout.readline()
            if not init_line:
                stderr_out = proc.stderr.read() if proc.stderr else ""
                raise SetupError(f"MCP server closed before initialize response: {stderr_out.strip()}")
            init_resp = json.loads(init_line)
            if "error" in init_resp or not init_resp.get("result", {}).get("serverInfo"):
                raise SetupError(f"Unexpected MCP initialize response: {init_resp}")

            proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
            proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}) + "\n")
            proc.stdin.flush()
            if os.name == "posix" and not select.select([proc.stdout], [], [], 15)[0]:
                raise SetupError("Timed out waiting for MCP tools/list response.")
            tools_line = proc.stdout.readline()
            if not tools_line:
                stderr_out = proc.stderr.read() if proc.stderr else ""
                raise SetupError(f"MCP server closed before tools/list response: {stderr_out.strip()}")
            tools_resp = json.loads(tools_line)
            tool_names = {tool.get("name") for tool in tools_resp.get("result", {}).get("tools", [])}
            expected_tools = {"paperstream_list_canvases", "paperstream_read_graph", "paperstream_apply_changes"}
            missing = sorted(expected_tools - tool_names)
            if missing:
                raise SetupError(f"MCP tools/list missing expected tools: {', '.join(missing)}")
        finally:
            if proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.terminate()
                proc.wait(timeout=5)
    return {"target": "mcp", "status": "passed", "package": str(pkg_dir), "tools": sorted(tool_names)}


def _verify_portable_plugin(target: str, root: Path, env_vars: dict[str, str]) -> dict[str, Any]:
    plugin_dir = root / target / "dist" / "plugin"
    required = [
        plugin_dir / "scripts" / "paperstream.py",
        plugin_dir / "skills" / "paperstream" / "SKILL.md",
        plugin_dir / "skills" / "paperstream" / "references" / "api.md",
        plugin_dir / "LICENSE",
        plugin_dir / "THIRD_PARTY_NOTICES.md",
    ]
    if target == "claude":
        required.append(plugin_dir / "app" / "app.html")
    else:
        required.extend([plugin_dir / "dist" / "server.mjs", plugin_dir / "dist" / "app.html"])
    for req in required:
        if not req.is_file():
            raise SetupError(f"Missing built {target} plugin file: {req}")

    if target == "claude":
        zips = sorted((root / "claude" / "dist").glob("paperstream-claude-*.zip"))
        if not zips:
            raise SetupError("Missing Claude portable ZIP archive under claude/dist/.")
        with zipfile.ZipFile(zips[0]) as archive:
            if archive.testzip() is not None:
                raise SetupError(f"Corrupt Claude ZIP archive: {zips[0]}")

    launcher = plugin_dir / "scripts" / "paperstream.py"
    clean_env = {k: v for k, v in env_vars.items() if k != "PYTHONPATH"}
    with tempfile.TemporaryDirectory(prefix=f"paperstream-verify-{target}-") as tmp:
        tmp_dir = Path(tmp)
        canvas_file = tmp_dir / "portable.canvas"
        _run_checked([sys.executable, str(launcher), "init", str(canvas_file)], cwd=tmp_dir, env=clean_env, timeout=30)
        _run_checked(
            [sys.executable, str(launcher), "add-node", str(canvas_file), "--alias", "Portable", "--takeaway", "OK"],
            cwd=tmp_dir,
            env=clean_env,
            timeout=30,
        )
        validated = json.loads(
            _run_checked([sys.executable, str(launcher), "validate", str(canvas_file)], cwd=tmp_dir, env=clean_env, timeout=30).stdout
        )
        if not validated.get("valid"):
            raise SetupError(f"Portable {target} launcher failed Canvas validation.")
    return {"target": target, "status": "passed", "plugin": str(plugin_dir)}


def _verify_dsh(root: Path, env_vars: dict[str, str]) -> dict[str, Any]:
    for req in (
        root / "dsh" / "lib" / "index.js",
        root / "dsh" / "lib" / "client.js",
        root / "dsh" / "LICENSE",
        root / "dsh" / "THIRD_PARTY_NOTICES.md",
    ):
        if not req.is_file():
            raise SetupError(f"Missing built DSH artifact: {req}")
    node_exe = shutil.which("node", path=env_vars.get("PATH"))
    if not node_exe:
        raise SetupError("Node.js executable was not found in PATH for DSH verification.")
    _run_checked([node_exe, str(root / "dsh" / "verify-build.mjs")], cwd=root, env=env_vars, timeout=30)
    return {"target": "dsh", "status": "passed", "lib": str(root / "dsh" / "lib")}


def run_verify(
    targets: Sequence[str],
    *,
    skill_dir: Path | None = None,
    cli_bin: Path | None = None,
    mcp_package: Path | None = None,
    repo_root: Path | None = None,
    env: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Run non-destructive isolated smoke checks on selected Paperstream targets."""
    root = (repo_root or REPO_ROOT).resolve()
    env_vars = _env_map(env)
    is_all = any(part.strip().lower() == "all" for item in targets for part in item.split(","))
    selected = _parse_targets(targets, VERIFY_TARGETS, allow_all=True)

    artifacts = _artifact_flags(root)
    with _temp_environ(env_vars):
        serve_available = resolve_preview_app(root).is_file()

    results: list[dict[str, Any]] = []
    for target in selected:
        if is_all and target not in ("cli", "skill"):
            available = serve_available if target == "serve" else artifacts.get(target, False)
            if not available:
                results.append({
                    "target": target,
                    "status": "skipped",
                    "reason": f"{target} artifact is not built or installed.",
                })
                continue

        if target == "cli":
            results.append(_verify_cli(root, env_vars, cli_bin))
        elif target == "serve":
            results.append(_verify_serve(root, env_vars))
        elif target == "skill":
            results.append(_verify_skill(root, skill_dir))
        elif target == "mcp":
            results.append(_verify_mcp(root, env_vars, mcp_package))
        elif target in ("claude", "codex"):
            results.append(_verify_portable_plugin(target, root, env_vars))
        elif target == "dsh":
            results.append(_verify_dsh(root, env_vars))

    return {
        "ok": True,
        "operation": "verify",
        "results": results,
    }


class _SetupParser(argparse.ArgumentParser):
    def __init__(self, *args: Any, json_mode: bool = False, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self._json_mode = json_mode

    def error(self, message: str) -> None:
        if self._json_mode:
            print(json.dumps({"ok": False, "error": "UsageError", "message": message}, ensure_ascii=False), file=sys.stderr)
        else:
            print(f"error: {message}", file=sys.stderr)
        self.exit(2)


def _build_parser(*, json_mode: bool) -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help="Emit structured JSON output")

    parser = _SetupParser(
        prog="python3 scripts/setup.py",
        description="Inspect, build, install, and verify Paperstream locally.",
        json_mode=json_mode,
    )
    parser.set_defaults(json=False)
    parser.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help="Emit structured JSON output")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", parents=[common], help="Inspect local tools, hosts, and build state")

    build_p = sub.add_parser("build", parents=[common], help="Install locked JS dependencies and build targets")
    build_p.add_argument("--target", action="append", required=True, help="web, serve, mcp, claude, codex, dsh, or all")
    build_p.add_argument("--force-install", action="store_true", help="Re-run npm ci even if node_modules exists")

    install_p = sub.add_parser("install", parents=[common], help="Preview (default) or apply installation steps")
    install_p.add_argument("--target", action="append", required=True, help="cli, serve, skill, mcp, claude, codex, dsh")
    install_p.add_argument("--dry-run", action="store_true", help="Preview changes without modifying files (default)")
    install_p.add_argument("--apply", action="store_true", help="Apply installation changes")
    install_p.add_argument("--installer", choices=("auto", "uv", "pipx", "pip", "shim"), default="auto")
    install_p.add_argument("--bin-dir", type=Path, help="Target bin directory for --installer shim")
    install_p.add_argument("--force", action="store_true", help="Overwrite an existing unmanaged CLI shim")
    install_p.add_argument("--app-source", type=Path, help="Prebuilt app.html path for --target serve")
    install_p.add_argument("--host", action="append", default=[], dest="skill_hosts", choices=("agents", "claude", "codex"))
    install_p.add_argument("--skill-dir", action="append", default=[], type=Path, dest="skill_dirs")
    install_p.add_argument("--canvas", action="append", default=[], type=Path, dest="canvases")
    install_p.add_argument("--use-example", action="store_true", help="Authorize examples/resnet.canvas for MCP")
    install_p.add_argument("--claude-config", type=Path, help="Override Claude Desktop config path")
    install_p.add_argument("--mcp-package", type=Path, help="Path to built or extracted mcp package")
    install_p.add_argument("--read-only", action="store_true", help="Configure MCP server in read-only mode")

    verify_p = sub.add_parser("verify", parents=[common], help="Run isolated smoke checks")
    verify_p.add_argument("--target", action="append", required=True, help="cli, serve, skill, mcp, claude, codex, dsh, or all")
    verify_p.add_argument("--skill-dir", type=Path, help="Installed skill directory to verify")
    verify_p.add_argument("--cli-bin", type=Path, help="Installed paperstream executable to verify")
    verify_p.add_argument("--mcp-package", type=Path, help="Built or extracted mcp package directory to verify")

    return parser


def _format_human(payload: dict[str, Any]) -> str:
    op = payload.get("operation")
    if op == "doctor":
        lines = [
            f"Paperstream repo: {payload['repo_root']}",
            f"Python: {payload['python']['version']} ({'ok' if payload['python']['ok'] else 'too old'})",
            f"Node: {payload['node']['version'] or 'missing'} ({'ok' if payload['node']['ok'] else 'need >=22.18'})",
            f"Recommended targets: {', '.join(payload['recommended_targets'])}",
            f"Built artifacts: {', '.join(k for k, v in payload['built_artifacts'].items() if v) or 'none'}",
        ]
        return "\n".join(lines)
    if op == "build":
        built = ", ".join(item["target"] for item in payload.get("built", [])) or "none"
        return f"Built targets: {built}"
    if op == "install":
        mode = payload.get("mode", "dry-run")
        targets = ", ".join(item["target"] for item in payload.get("actions", []))
        return f"Install ({mode}) complete for: {targets}"
    if op == "verify":
        parts = [f"{r['target']}: {r['status']}" for r in payload.get("results", [])]
        return "Verify results: " + ", ".join(parts)
    return json.dumps(payload, ensure_ascii=False, indent=2)


def main(argv: Sequence[str] | None = None) -> int:
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    json_mode = "--json" in raw_argv
    parser = _build_parser(json_mode=json_mode)
    args = parser.parse_args(raw_argv)

    try:
        if args.command == "doctor":
            payload = run_doctor()
        elif args.command == "build":
            payload = run_build(args.target, force_install=args.force_install)
        elif args.command == "install":
            if args.dry_run and args.apply:
                raise SetupError("Cannot combine --dry-run and --apply.")
            payload = run_install(
                args.target,
                apply=bool(args.apply),
                installer=args.installer,
                bin_dir=args.bin_dir,
                force=args.force,
                app_source=args.app_source,
                skill_hosts=args.skill_hosts,
                skill_dirs=args.skill_dirs,
                canvases=args.canvases,
                use_example=args.use_example,
                claude_config=args.claude_config,
                mcp_package=args.mcp_package,
                read_only=args.read_only,
            )
        elif args.command == "verify":
            payload = run_verify(
                args.target,
                skill_dir=args.skill_dir,
                cli_bin=args.cli_bin,
                mcp_package=args.mcp_package,
            )
        else:
            raise SetupError(f"Unsupported command: {args.command}")
    except (SetupError, OSError, ValueError) as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": type(exc).__name__, "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        else:
            print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(_format_human(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
