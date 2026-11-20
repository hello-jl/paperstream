"""Isolated unit and smoke tests for scripts/setup.py."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

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


if __name__ == "__main__":
    unittest.main()
