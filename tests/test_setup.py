"""Isolated unit and smoke tests for scripts/setup.py."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

REPO_ROOT = Path(__file__).resolve().parent.parent
SETUP_PATH = REPO_ROOT / "scripts" / "setup.py"


def _load_setup_module():
    spec = importlib.util.spec_from_file_location("paperstream_setup", SETUP_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


setup_mod = _load_setup_module()


class SetupTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.home = self.root / "home"
        self.home.mkdir()
        self.data_dir = self.root / "data_dir"
        self.config_path = self.root / "claude" / "claude_desktop_config.json"
        host_entries = [p for p in os.environ.get("PATH", "").split(os.pathsep) if p]
        isolated_entries = [p for p in host_entries if not (Path(p) / "paperstream").exists()]
        if not shutil.which("node", path=os.pathsep.join(isolated_entries)):
            node_path = shutil.which("node")
            if node_path:
                tool_bin = self.root / "tool_bin"
                tool_bin.mkdir(exist_ok=True)
                (tool_bin / "node").symlink_to(node_path)
                isolated_entries.insert(0, str(tool_bin))
        self.base_env = {
            **os.environ,
            "PATH": os.pathsep.join(isolated_entries),
            "HOME": str(self.home),
            "PAPERSTREAM_DATA_DIR": str(self.data_dir),
            "PAPERSTREAM_CLAUDE_DESKTOP_CONFIG": str(self.config_path),
        }
        self.base_env.pop("PAPERSTREAM_APP_PATH", None)
        self.base_env.pop("XDG_DATA_HOME", None)

    def _run_cli(self, *args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SETUP_PATH), *args],
            cwd=str(self.root),
            env=env or self.base_env,
            text=True,
            capture_output=True,
            timeout=30,
        )

    def test_doctor_json_reports_environment_and_recommended_targets(self):
        proc = self._run_cli("doctor", "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = json.loads(proc.stdout)
        self.assertTrue(report["ok"])
        self.assertEqual(report["operation"], "doctor")
        self.assertEqual(Path(report["repo_root"]), REPO_ROOT.resolve())
        self.assertTrue(report["python"]["ok"])
        self.assertIn("cli", report["recommended_targets"])
        self.assertIn("skill", report["recommended_targets"])
        self.assertIn("built_artifacts", report)
        self.assertIn("node_modules", report)
        self.assertEqual(report["existing_install"]["serve_app_path"], str(self.data_dir / "app.html"))
        self.assertFalse(report["existing_install"]["serve_app_installed"])

    def test_install_cli_shim_dry_run_apply_update_and_conflict_guard(self):
        bin_dir = self.root / "bin"
        shim_path = bin_dir / "paperstream"

        dry = self._run_cli("install", "--target", "cli", "--installer", "shim", "--bin-dir", str(bin_dir), "--json")
        self.assertEqual(dry.returncode, 0, dry.stderr)
        dry_data = json.loads(dry.stdout)
        self.assertEqual(dry_data["mode"], "dry-run")
        self.assertFalse(dry_data["actions"][0]["applied"])
        self.assertFalse(shim_path.exists())

        applied = self._run_cli(
            "install", "--target", "cli", "--installer", "shim", "--bin-dir", str(bin_dir), "--apply", "--json"
        )
        self.assertEqual(applied.returncode, 0, applied.stderr)
        applied_data = json.loads(applied.stdout)
        self.assertEqual(applied_data["mode"], "apply")
        self.assertTrue(applied_data["actions"][0]["applied"])
        self.assertTrue(shim_path.is_file())
        self.assertTrue(os.access(shim_path, os.X_OK))
        self.assertIn(setup_mod.SHIM_MARKER, shim_path.read_text(encoding="utf-8"))

        # Re-applying over our managed shim succeeds cleanly.
        updated = self._run_cli(
            "install", "--target", "cli", "--installer", "shim", "--bin-dir", str(bin_dir), "--apply", "--json"
        )
        self.assertEqual(updated.returncode, 0, updated.stderr)

        # Executing the shim from an unrelated cwd works without PYTHONPATH.
        work_dir = self.root / "unrelated_cwd"
        work_dir.mkdir()
        clean_env = {k: v for k, v in self.base_env.items() if k != "PYTHONPATH"}
        canvas_file = work_dir / "my-papers.canvas"
        for args in (
            ["init", str(canvas_file)],
            ["add-node", str(canvas_file), "--alias", "ShimTest", "--takeaway", "- Installed globally"],
            ["validate", str(canvas_file)],
        ):
            res = subprocess.run(
                [str(shim_path), *args], cwd=str(work_dir), env=clean_env, text=True, capture_output=True, timeout=20
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertTrue(json.loads(res.stdout)["ok"])

        verify = self._run_cli("verify", "--target", "cli", "--cli-bin", str(shim_path), "--json")
        self.assertEqual(verify.returncode, 0, verify.stderr)
        verify_data = json.loads(verify.stdout)
        self.assertEqual(verify_data["results"][0]["status"], "passed")
        self.assertEqual(verify_data["results"][0]["mode"], "installed_cli")

        # Refuse to overwrite an unmanaged file unless --force is passed.
        unmanaged = "#!/bin/sh\necho custom\n"
        shim_path.write_text(unmanaged, encoding="utf-8")
        conflict = self._run_cli(
            "install", "--target", "cli", "--installer", "shim", "--bin-dir", str(bin_dir), "--apply", "--json"
        )
        self.assertEqual(conflict.returncode, 1)
        self.assertEqual(json.loads(conflict.stderr)["error"], "SetupError")
        self.assertEqual(shim_path.read_text(encoding="utf-8"), unmanaged)

        forced = self._run_cli(
            "install", "--target", "cli", "--installer", "shim", "--bin-dir", str(bin_dir), "--force", "--apply", "--json"
        )
        self.assertEqual(forced.returncode, 0, forced.stderr)
        self.assertIn(setup_mod.SHIM_MARKER, shim_path.read_text(encoding="utf-8"))

    def test_install_and_verify_serve_using_prebuilt_app_source(self):
        prebuilt = self.root / "release-serve" / "app.html"
        prebuilt.parent.mkdir(parents=True)
        prebuilt_html = "<!doctype html><title>Paperstream Prebuilt</title><div id=\"root\"></div>"
        prebuilt.write_text(prebuilt_html, encoding="utf-8")

        dry = self._run_cli("install", "--target", "serve", "--app-source", str(prebuilt), "--json")
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertFalse((self.data_dir / "app.html").exists())

        applied = self._run_cli("install", "--target", "serve", "--app-source", str(prebuilt), "--apply", "--json")
        self.assertEqual(applied.returncode, 0, applied.stderr)
        self.assertEqual((self.data_dir / "app.html").read_text(encoding="utf-8"), prebuilt_html)
        self.assertTrue((self.data_dir / "LICENSE").is_file())
        self.assertTrue((self.data_dir / "THIRD_PARTY_NOTICES.md").is_file())
        self.assertTrue((self.data_dir / "licenses" / "third-party" / "inventory.json").is_file())

        # resolve_preview_app discovers the installed bundle via PAPERSTREAM_DATA_DIR.
        from paperstream.__main__ import resolve_preview_app

        isolated_repo = self.root / "empty-repo"
        isolated_repo.mkdir()
        orig_data_dir = os.environ.get("PAPERSTREAM_DATA_DIR")
        orig_app_path = os.environ.get("PAPERSTREAM_APP_PATH")
        try:
            os.environ["PAPERSTREAM_DATA_DIR"] = str(self.data_dir)
            os.environ.pop("PAPERSTREAM_APP_PATH", None)
            self.assertEqual(resolve_preview_app(isolated_repo), self.data_dir / "app.html")
        finally:
            if orig_data_dir is None:
                os.environ.pop("PAPERSTREAM_DATA_DIR", None)
            else:
                os.environ["PAPERSTREAM_DATA_DIR"] = orig_data_dir
            if orig_app_path is not None:
                os.environ["PAPERSTREAM_APP_PATH"] = orig_app_path

        # verify --target serve runs real HTTP smoke checks against the installed bundle.
        verify = self._run_cli("verify", "--target", "serve", "--json")
        self.assertEqual(verify.returncode, 0, verify.stderr)
        verify_data = json.loads(verify.stdout)
        self.assertEqual(verify_data["results"][0]["status"], "passed")

    def test_install_and_verify_skill_preserves_siblings(self):
        skills_parent = self.root / "skills_host"
        sibling = skills_parent / "other-skill"
        sibling.mkdir(parents=True)
        (sibling / "SKILL.md").write_text("keep sibling skill", encoding="utf-8")

        dry = self._run_cli("install", "--target", "skill", "--skill-dir", str(skills_parent), "--json")
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertFalse((skills_parent / "paperstream").exists())

        applied = self._run_cli("install", "--target", "skill", "--skill-dir", str(skills_parent), "--apply", "--json")
        self.assertEqual(applied.returncode, 0, applied.stderr)
        installed = skills_parent / "paperstream"
        self.assertTrue((installed / "SKILL.md").is_file())
        self.assertTrue((installed / "references" / "api.md").is_file())
        self.assertTrue((installed / "agents" / "openai.yaml").is_file())
        self.assertEqual((sibling / "SKILL.md").read_text(encoding="utf-8"), "keep sibling skill")

        verify = self._run_cli("verify", "--target", "skill", "--skill-dir", str(skills_parent), "--json")
        self.assertEqual(verify.returncode, 0, verify.stderr)
        self.assertEqual(json.loads(verify.stdout)["results"][0]["status"], "passed")

    def test_install_mcp_merges_config_creates_backup_and_validates_inputs(self):
        mcp_pkg = self.root / "mcp-package"
        (mcp_pkg / "dist").mkdir(parents=True)
        (mcp_pkg / "dist" / "server.mjs").write_text("console.log('stub');\n", encoding="utf-8")
        (mcp_pkg / "dist" / "app.html").write_text("<html></html>", encoding="utf-8")
        (mcp_pkg / "LICENSE").write_text("MIT", encoding="utf-8")
        (mcp_pkg / "THIRD_PARTY_NOTICES.md").write_text("Notices", encoding="utf-8")

        canvas = self.root / "papers.canvas"
        canvas.write_text('{"nodes":[],"edges":[]}\n', encoding="utf-8")

        self.config_path.parent.mkdir(parents=True)
        original_config = {
            "theme": "dark",
            "mcpServers": {
                "existingTool": {"command": "echo", "args": ["keep-me"]},
            },
        }
        original_text = json.dumps(original_config, indent=2) + "\n"
        self.config_path.write_text(original_text, encoding="utf-8")

        dry = self._run_cli(
            "install",
            "--target",
            "mcp",
            "--mcp-package",
            str(mcp_pkg),
            "--canvas",
            str(canvas),
            "--claude-config",
            str(self.config_path),
            "--json",
        )
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertEqual(self.config_path.read_text(encoding="utf-8"), original_text)
        backup_path = self.config_path.with_name(f"{self.config_path.name}.paperstream-bak")
        self.assertFalse(backup_path.exists())

        applied = self._run_cli(
            "install",
            "--target",
            "mcp",
            "--mcp-package",
            str(mcp_pkg),
            "--canvas",
            str(canvas),
            "--claude-config",
            str(self.config_path),
            "--read-only",
            "--apply",
            "--json",
        )
        self.assertEqual(applied.returncode, 0, applied.stderr)
        self.assertEqual(backup_path.read_text(encoding="utf-8"), original_text)

        merged = json.loads(self.config_path.read_text(encoding="utf-8"))
        self.assertEqual(merged["theme"], "dark")
        self.assertEqual(merged["mcpServers"]["existingTool"], {"command": "echo", "args": ["keep-me"]})
        ps_entry = merged["mcpServers"]["paperstream"]
        self.assertEqual(ps_entry["command"], shutil.which("node", path=self.base_env.get("PATH")))
        self.assertIn(str((mcp_pkg / "dist" / "server.mjs").resolve()), ps_entry["args"])
        self.assertIn(str(canvas.resolve()), ps_entry["args"])
        self.assertIn("--read-only", ps_entry["args"])

        # Missing canvas file is rejected without modifying config.
        missing_canvas = self.root / "missing.canvas"
        bad_canvas = self._run_cli(
            "install",
            "--target",
            "mcp",
            "--mcp-package",
            str(mcp_pkg),
            "--canvas",
            str(missing_canvas),
            "--claude-config",
            str(self.config_path),
            "--apply",
            "--json",
        )
        self.assertEqual(bad_canvas.returncode, 1)
        self.assertEqual(json.loads(bad_canvas.stderr)["error"], "SetupError")

        # Invalid JSON config is rejected without overwriting.
        self.config_path.write_text("{broken json", encoding="utf-8")
        bad_cfg = self._run_cli(
            "install",
            "--target",
            "mcp",
            "--mcp-package",
            str(mcp_pkg),
            "--canvas",
            str(canvas),
            "--claude-config",
            str(self.config_path),
            "--apply",
            "--json",
        )
        self.assertEqual(bad_cfg.returncode, 1)
        self.assertEqual(self.config_path.read_text(encoding="utf-8"), "{broken json")

    def test_verify_mcp_stdio_handshake_and_verify_all_skips_unbuilt(self):
        # Test MCP stdio JSON-RPC verification with a tiny Node stub package.
        mcp_pkg = self.root / "mcp-stub"
        (mcp_pkg / "dist").mkdir(parents=True)
        (mcp_pkg / "dist" / "app.html").write_text("<html></html>", encoding="utf-8")
        (mcp_pkg / "LICENSE").write_text("MIT", encoding="utf-8")
        (mcp_pkg / "THIRD_PARTY_NOTICES.md").write_text("Notices", encoding="utf-8")
        (mcp_pkg / "dist" / "server.mjs").write_text(
            "\n".join([
                "import readline from 'node:readline';",
                "const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });",
                "rl.on('line', line => {",
                "  if (!line.trim()) return;",
                "  const msg = JSON.parse(line);",
                "  if (msg.method === 'initialize') {",
                "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'paperstream-standard', version: '0.1.0' }, capabilities: {} } }) + '\\n');",
                "  } else if (msg.method === 'tools/list') {",
                "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'paperstream_list_canvases' }, { name: 'paperstream_read_graph' }, { name: 'paperstream_apply_changes' }] } }) + '\\n');",
                "  }",
                "});",
            ]),
            encoding="utf-8",
        )
        verify_mcp = self._run_cli("verify", "--target", "mcp", "--mcp-package", str(mcp_pkg), "--json")
        self.assertEqual(verify_mcp.returncode, 0, verify_mcp.stderr)
        mcp_res = json.loads(verify_mcp.stdout)["results"][0]
        self.assertEqual(mcp_res["status"], "passed")
        self.assertIn("paperstream_apply_changes", mcp_res["tools"])

        # Verify --target all passes cli & skill strictly and skips missing optional targets.
        verify_all = self._run_cli("verify", "--target", "all", "--json")
        self.assertEqual(verify_all.returncode, 0, verify_all.stderr)
        by_target = {r["target"]: r["status"] for r in json.loads(verify_all.stdout)["results"]}
        self.assertEqual(by_target["cli"], "passed")
        self.assertEqual(by_target["skill"], "passed")
        for opt in ("serve", "mcp", "claude", "codex", "dsh"):
            self.assertIn(by_target[opt], ("passed", "skipped"))

    def test_install_mcp_new_config_has_no_backup_path(self):
        mcp_pkg = self.root / "mcp-package-new"
        (mcp_pkg / "dist").mkdir(parents=True)
        (mcp_pkg / "dist" / "server.mjs").write_text("console.log('stub');\n", encoding="utf-8")
        (mcp_pkg / "dist" / "app.html").write_text("<html></html>", encoding="utf-8")
        canvas = self.root / "fresh.canvas"
        canvas.write_text('{"nodes":[],"edges":[]}\n', encoding="utf-8")
        fresh_config = self.root / "new_claude" / "claude_desktop_config.json"

        applied = self._run_cli(
            "install",
            "--target",
            "mcp",
            "--mcp-package",
            str(mcp_pkg),
            "--canvas",
            str(canvas),
            "--claude-config",
            str(fresh_config),
            "--apply",
            "--json",
        )
        self.assertEqual(applied.returncode, 0, applied.stderr)
        action = json.loads(applied.stdout)["actions"][0]
        self.assertIsNone(action["backup_path"])
        self.assertFalse(fresh_config.with_name(f"{fresh_config.name}.paperstream-bak").exists())
        self.assertTrue(fresh_config.is_file())
        self.assertIn("paperstream", json.loads(fresh_config.read_text(encoding="utf-8"))["mcpServers"])

    def test_install_cli_uv_pipx_force_flags_and_windows_shim_guard(self):
        fake_bin = self.root / "fake_tools"
        fake_bin.mkdir()
        for tool in ("uv", "pipx"):
            exe = fake_bin / tool
            exe.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            exe.chmod(0o755)

        fake_env = {**self.base_env, "PATH": f"{fake_bin}{os.pathsep}{self.base_env.get('PATH', '')}"}
        for installer in ("uv", "pipx"):
            res = setup_mod.run_install(
                ["cli"],
                apply=False,
                installer=installer,
                repo_root=REPO_ROOT,
                env=fake_env,
                home=self.home,
            )
            cmd = res["actions"][0]["command"]
            self.assertEqual(cmd[0], installer)
            self.assertIn("--force", cmd)
            self.assertIn("--editable", cmd)

        with self.assertRaises(setup_mod.SetupError):
            setup_mod.run_install(
                ["cli"],
                apply=False,
                installer="shim",
                repo_root=REPO_ROOT,
                env=fake_env,
                home=self.home,
                platform_name="win32",
            )

        with patch("importlib.util.find_spec", return_value=None):
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.run_install(
                    ["cli"],
                    apply=False,
                    installer="auto",
                    repo_root=REPO_ROOT,
                    env={"PATH": ""},
                    home=self.home,
                    platform_name="win32",
                )

    def _build_release_fixtures(self, archive_dir: Path, *, with_checksums: bool = True) -> dict[str, bytes]:
        archive_dir.mkdir(parents=True, exist_ok=True)
        launcher_py = (
            "from pathlib import Path\n"
            "import json, sys\n"
            "cmd, path = sys.argv[1], Path(sys.argv[2])\n"
            "if cmd == 'init': path.write_text('{\"nodes\":[],\"edges\":[]}', encoding='utf-8')\n"
            "elif cmd == 'add-node': pass\n"
            "elif cmd == 'validate': print(json.dumps({'ok': True, 'valid': True}))\n"
        )

        def write_zip(name: str, prefix: str, files: dict[str, str | bytes]) -> Path:
            dest = archive_dir / name
            with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for rel, body in files.items():
                    data = body.encode("utf-8") if isinstance(body, str) else body
                    zf.writestr(f"{prefix}/{rel}", data)
            return dest

        archives = [
            write_zip("paperstream-serve-v0.1.0.zip", "paperstream-serve", {"app.html": "<!doctype html>serve"}),
            write_zip(
                "paperstream-mcp-v0.1.0.zip",
                "paperstream-mcp",
                {
                    "dist/server.mjs": "console.log('mcp');\n",
                    "dist/app.html": "<!doctype html>mcp",
                    "LICENSE": "MIT",
                    "THIRD_PARTY_NOTICES.md": "Notices",
                },
            ),
            write_zip(
                "paperstream-claude-0.1.0.zip",
                "paperstream",
                {
                    ".claude-plugin/plugin.json": '{"name":"paperstream","version":"0.1.0"}',
                    "app/app.html": "<!doctype html>claude",
                    "scripts/paperstream.py": launcher_py,
                    "skills/paperstream/SKILL.md": "# Skill\n",
                    "skills/paperstream/references/api.md": "# API\n",
                    "LICENSE": "MIT",
                    "THIRD_PARTY_NOTICES.md": "Notices",
                },
            ),
            write_zip(
                "paperstream-codex-v0.1.0.zip",
                "paperstream-codex",
                {
                    ".codex-plugin/plugin.json": '{"name":"paperstream","version":"0.1.0"}',
                    "dist/server.mjs": "console.log('codex');\n",
                    "dist/app.html": "<!doctype html>codex",
                    "scripts/paperstream.py": launcher_py,
                    "skills/paperstream/SKILL.md": "# Skill\n",
                    "skills/paperstream/references/api.md": "# API\n",
                    "LICENSE": "MIT",
                    "THIRD_PARTY_NOTICES.md": "Notices",
                },
            ),
            write_zip("paperstream-web-static-v0.1.0.zip", "paperstream-web", {"index.html": "<!doctype html>web"}),
        ]

        dsh_tgz = archive_dir / "dsh-paperstream-0.1.0.tgz"
        dsh_files = {
            "package/package.json": '{"name":"dsh-paperstream","version":"0.1.0"}',
            "package/lib/index.js": "export const id = 'paperstream';\n",
            "package/lib/client.js": "export default function register() {}\n",
            "package/LICENSE": "MIT",
            "package/THIRD_PARTY_NOTICES.md": "Notices",
        }
        with tarfile.open(dsh_tgz, "w:gz") as tf:
            for member_name, body in dsh_files.items():
                raw = body.encode("utf-8")
                info = tarfile.TarInfo(member_name)
                info.size = len(raw)
                tf.addfile(info, io.BytesIO(raw))
        archives.append(dsh_tgz)

        payloads: dict[str, bytes] = {}
        sums_lines: list[str] = []
        for path in archives:
            raw = path.read_bytes()
            payloads[path.name] = raw
            digest = hashlib.sha256(raw).hexdigest()
            sums_lines.append(f"{digest}  {path.name}\n")
        if with_checksums:
            sums_bytes = "".join(sums_lines).encode("utf-8")
            (archive_dir / "SHA256SUMS.txt").write_bytes(sums_bytes)
            payloads["SHA256SUMS.txt"] = sums_bytes
        return payloads

    def test_fetch_from_dir_stages_all_targets_and_rejects_bad_archives(self):
        fake_repo = self.root / "repo"
        fake_repo.mkdir()
        release_dir = self.root / "releases"
        self._build_release_fixtures(release_dir)

        fetched = setup_mod.run_fetch(["all"], from_dir=release_dir, repo_root=fake_repo)
        self.assertTrue(fetched["ok"])
        self.assertEqual(fetched["source"], "local-dir")
        self.assertTrue(all(fetched["built_artifacts"].values()))
        self.assertEqual((fake_repo / "dist" / "serve" / "app.html").read_text(encoding="utf-8"), "<!doctype html>serve")
        self.assertTrue((fake_repo / "mcp" / "dist" / "package" / "dist" / "server.mjs").is_file())
        self.assertTrue((fake_repo / "claude" / "dist" / "plugin" / ".claude-plugin" / "plugin.json").is_file())
        self.assertTrue((fake_repo / "claude" / "dist" / "paperstream-claude-0.1.0.zip").is_file())
        self.assertTrue((fake_repo / "codex" / "dist" / "plugin" / ".codex-plugin" / "plugin.json").is_file())
        self.assertTrue((fake_repo / "web" / "dist" / "index.html").is_file())
        self.assertTrue((fake_repo / "dsh" / "dist" / "dsh-paperstream-0.1.0.tgz").is_file())

        # Checksum mismatch refuses extraction and leaves existing staged bundle intact.
        bad_sha_dir = self.root / "bad_sha"
        self._build_release_fixtures(bad_sha_dir)
        (bad_sha_dir / "SHA256SUMS.txt").write_text(
            f"{'0' * 64}  paperstream-serve-v0.1.0.zip\n", encoding="utf-8"
        )
        with self.assertRaises(setup_mod.SetupError) as ctx:
            setup_mod.run_fetch(["serve"], from_dir=bad_sha_dir, repo_root=fake_repo)
        self.assertIn("checksum mismatch", str(ctx.exception))
        self.assertEqual((fake_repo / "dist" / "serve" / "app.html").read_text(encoding="utf-8"), "<!doctype html>serve")

        # Reject path traversal and symlink entries inside archives.
        for label, make_bad_zip in (
            ("traversal", lambda zf: zf.writestr("paperstream-serve/../../evil.txt", b"bad")),
            (
                "symlink",
                lambda zf: zf.writestr(
                    zipfile.ZipInfo("paperstream-serve/link.html").__class__("paperstream-serve/link.html")
                    if False
                    else zipfile.ZipInfo("paperstream-serve/link.html"),
                    b"/etc/passwd",
                ),
            ),
        ):
            evil_dir = self.root / f"evil_{label}"
            evil_dir.mkdir()
            zip_path = evil_dir / "paperstream-serve-v0.1.0.zip"
            with zipfile.ZipFile(zip_path, "w") as zf:
                if label == "symlink":
                    zi = zipfile.ZipInfo("paperstream-serve/link.html")
                    zi.external_attr = (stat.S_IFLNK | 0o777) << 16
                    zf.writestr(zi, b"/etc/passwd")
                else:
                    make_bad_zip(zf)
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.run_fetch(["serve"], from_dir=evil_dir, repo_root=fake_repo)

    def test_fetch_github_release_via_mocked_https_and_fallback_hints(self):
        fake_repo = self.root / "repo_https"
        fake_repo.mkdir()
        payloads = self._build_release_fixtures(self.root / "http_fixtures")

        doctor_report = setup_mod.run_doctor(repo_root=fake_repo, env={"PATH": ""}, home=self.home)
        self.assertEqual(doctor_report["install_methods"]["recommended"], "release")
        self.assertIn("serve", doctor_report["recommended_targets"])

        class _FakeResponse:
            def __init__(self, url: str, data: bytes):
                self._url = url
                self._buf = io.BytesIO(data)

            def geturl(self) -> str:
                return self._url

            def read(self, n: int = -1) -> bytes:
                return self._buf.read(n)

            def __enter__(self):
                return self

            def __exit__(self, *_exc):
                return False

        def fake_urlopen(req, timeout=60):
            url = req.full_url
            name = url.rsplit("/", 1)[-1]
            if name not in payloads:
                raise urllib.error.URLError(f"unexpected URL {url}")
            return _FakeResponse(url, payloads[name])

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            res = setup_mod.run_fetch(["serve"], tag="v0.1.0", repo_root=fake_repo)
        self.assertEqual(res["source"], "github-release")
        self.assertEqual((fake_repo / "dist" / "serve" / "app.html").read_text(encoding="utf-8"), "<!doctype html>serve")
        self.assertTrue(res["fetched"][0]["checksum_verified"])

        # Network error surfaces build fallback hint; build error surfaces fetch fallback hint.
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("offline")):
            with self.assertRaises(setup_mod.SetupError) as fetch_err:
                setup_mod.run_fetch(["serve"], repo_root=fake_repo)
        self.assertIn("scripts/setup.py build --target serve", str(fetch_err.exception))

        with self.assertRaises(setup_mod.SetupError) as build_err:
            setup_mod.run_build(["serve"], repo_root=fake_repo, env={"PATH": ""})
        self.assertIn("scripts/setup.py fetch --target serve", str(build_err.exception))

    def test_install_and_verify_dsh_claude_codex_from_prebuilt_packages(self):
        fake_repo = self.root / "repo_hosts"
        fake_repo.mkdir()
        release_dir = self.root / "host_releases"
        self._build_release_fixtures(release_dir)
        setup_mod.run_fetch(["claude", "codex", "dsh"], from_dir=release_dir, repo_root=fake_repo)

        fake_bin = self.root / "host_bin"
        fake_bin.mkdir()
        call_log = self.root / "cli_calls.jsonl"
        for host_cmd in ("claude", "codex", "dsh"):
            exe = fake_bin / host_cmd
            exe.write_text(
                "\n".join([
                    f"#!{sys.executable}",
                    "import json, sys",
                    f"with open({repr(str(call_log))}, 'a', encoding='utf-8') as fh:",
                    f"    fh.write(json.dumps({{'cli': {repr(host_cmd)}, 'args': sys.argv[1:]}}) + '\\n')",
                    "",
                ]),
                encoding="utf-8",
            )
            exe.chmod(0o755)

        # Explicitly omit node from PATH: fetched dsh .tgz must install and verify without Node.js.
        no_node_env = {**self.base_env, "PATH": str(fake_bin)}
        dsh_dry = setup_mod.run_install(["dsh"], apply=False, repo_root=fake_repo, env=no_node_env, home=self.home)
        self.assertEqual(dsh_dry["actions"][0]["source_mode"], "tgz")
        self.assertFalse(call_log.exists())

        dsh_apply = setup_mod.run_install(["dsh"], apply=True, repo_root=fake_repo, env=no_node_env, home=self.home)
        self.assertTrue(dsh_apply["actions"][0]["applied"])
        dsh_verify = setup_mod.run_verify(["dsh"], repo_root=fake_repo, env=no_node_env)
        self.assertEqual(dsh_verify["results"][0]["status"], "passed")
        self.assertEqual(dsh_verify["results"][0]["mode"], "tgz")

        # Install & verify Claude and Codex from fetched repo dirs AND explicit external unpacked dirs.
        hosts_apply = setup_mod.run_install(
            ["claude", "codex"], apply=True, repo_root=fake_repo, env=no_node_env, home=self.home
        )
        self.assertEqual(hosts_apply["actions"][0]["source_mode"], "repo-dist")
        self.assertEqual(hosts_apply["actions"][1]["source_mode"], "repo-dist")
        hosts_verify = setup_mod.run_verify(["claude", "codex"], repo_root=fake_repo, env=no_node_env)
        self.assertEqual([r["status"] for r in hosts_verify["results"]], ["passed", "passed"])

        ext_claude = self.root / "ext_claude"
        with zipfile.ZipFile(release_dir / "paperstream-claude-0.1.0.zip") as zf:
            zf.extractall(ext_claude)
        ext_codex = self.root / "ext_codex"
        with zipfile.ZipFile(release_dir / "paperstream-codex-v0.1.0.zip") as zf:
            zf.extractall(ext_codex)

        ext_apply = setup_mod.run_install(
            ["claude", "codex"],
            apply=True,
            claude_package=ext_claude,
            codex_package=ext_codex,
            repo_root=fake_repo,
            env=no_node_env,
            home=self.home,
        )
        self.assertEqual(ext_apply["actions"][0]["source_mode"], "external-package")
        self.assertEqual(ext_apply["actions"][1]["source_mode"], "external-package")
        self.assertTrue((self.data_dir / "plugins" / "claude" / ".claude-plugin" / "marketplace.json").is_file())
        self.assertTrue((self.data_dir / "plugins" / "codex" / ".agents" / "plugins" / "marketplace.json").is_file())

        ext_verify = setup_mod.run_verify(
            ["claude", "codex", "dsh"],
            claude_package=ext_claude,
            codex_package=ext_codex,
            dsh_package=release_dir / "dsh-paperstream-0.1.0.tgz",
            repo_root=fake_repo,
            env=no_node_env,
        )
        self.assertEqual([r["status"] for r in ext_verify["results"]], ["passed", "passed", "passed"])
        logged = [json.loads(line) for line in call_log.read_text(encoding="utf-8").splitlines()]
        self.assertTrue(any(row["cli"] == "dsh" and row["args"][:3] == ["plugin", "--profile", "web"] for row in logged))
        self.assertTrue(any(row["cli"] == "claude" and row["args"][:2] == ["plugin", "validate"] for row in logged))
        self.assertTrue(any(row["cli"] == "codex" and row["args"][:2] == ["plugin", "marketplace"] for row in logged))


if __name__ == "__main__":
    unittest.main()
