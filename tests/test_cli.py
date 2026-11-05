"""End-to-end checks for agent-facing JSON commands and safe failures."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class CommandLineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "papers.mmd"

    def run_cli(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-m", "paperstream", *map(str, arguments)],
            cwd=PROJECT_ROOT,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=False,
        )

    def success(self, *arguments: str) -> dict:
        completed = self.run_cli(*arguments)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stderr, "")
        value = json.loads(completed.stdout)
        self.assertTrue(value["ok"])
        return value

    def failure(self, *arguments: str, code: int = 1) -> dict:
        completed = self.run_cli(*arguments)
        self.assertEqual(completed.returncode, code, completed.stderr)
        self.assertEqual(completed.stdout, "")
        value = json.loads(completed.stderr)
        self.assertFalse(value["ok"])
        self.assertIn("message", value)
        return value

    def create_pair(self) -> None:
        self.success("init", self.path)
        for identifier, alias in (("paper_001", "基础"), ("paper_002", "改进")):
            self.success(
                "add-node", self.path, "--id", identifier,
                "--alias", alias, "--takeaway", "第一行\n第二行",
            )

    def test_complete_editing_workflow_and_read_only_commands(self) -> None:
        self.create_pair()
        added = self.success(
            "add-edge", self.path, "paper_001", "paper_002",
            "--id", "relation_001", "--relation", "减少计算步骤",
        )
        self.assertEqual(added["edge"]["relation"], "减少计算步骤")
        self.success("update-node", self.path, "paper_001", "--alias", "新的简称")
        self.success(
            "update-edge", self.path, "relation_001", "--relation", "更明确的关系"
        )
        before = self.path.read_bytes()
        shown = self.success("show", self.path)
        nodes = {node["id"]: node for node in shown["nodes"]}
        self.assertEqual(nodes["paper_001"]["alias"], "新的简称")
        self.assertEqual(nodes["paper_001"]["takeaway"], "第一行\n第二行")
        self.assertIsNone(nodes["paper_001"]["name"])
        self.assertIsNone(nodes["paper_002"]["name"])
        self.assertIsNone(nodes["paper_001"]["url"])
        self.assertIsNone(nodes["paper_001"]["year"])
        self.assertIsNone(nodes["paper_002"]["url"])
        self.assertIsNone(nodes["paper_002"]["year"])
        self.assertEqual(shown["edges"][0]["relation"], "更明确的关系")
        self.assertTrue(self.success("validate", self.path)["valid"])
        self.assertEqual(self.path.read_bytes(), before)
        self.success("remove-edge", self.path, "relation_001")
        self.success("remove-node", self.path, "paper_002")
        remaining = self.success("show", self.path)
        self.assertEqual(len(remaining["nodes"]), 1)
        self.assertEqual(remaining["edges"], [])

    def test_existing_file_and_invalid_relation_never_overwrite(self) -> None:
        self.create_pair()
        before = self.path.read_bytes()
        self.failure("init", self.path)
        self.assertEqual(self.path.read_bytes(), before)
        self.failure(
            "add-edge", self.path, "paper_001", "paper_999", "--relation", "关联"
        )
        self.assertEqual(self.path.read_bytes(), before)

    def test_connected_node_requires_explicit_cascade(self) -> None:
        self.create_pair()
        self.success(
            "add-edge", self.path, "paper_001", "paper_002", "--relation", "关联"
        )
        before = self.path.read_bytes()
        self.failure("remove-node", self.path, "paper_001")
        self.assertEqual(self.path.read_bytes(), before)
        self.success("remove-node", self.path, "paper_001", "--cascade")
        result = self.success("show", self.path)
        self.assertEqual([node["id"] for node in result["nodes"]], ["paper_002"])
        self.assertEqual(result["edges"], [])

    def test_usage_errors_are_json_and_checked_before_file_access(self) -> None:
        for command, identifier in (
            ("update-node", "paper_001"), ("update-edge", "relation_001")
        ):
            error = self.failure(command, self.path, identifier, code=2)
            self.assertEqual(error["error"], "UsageError")
        self.failure("add-node", self.path, "--alias", "缺少 takeaway", code=2)
        self.failure("unknown-command", code=2)
        self.assertFalse(self.path.exists())

    def test_malformed_document_is_not_changed(self) -> None:
        self.path.write_text("flowchart TD\nthis is not a valid node\n", encoding="utf-8")
        before = self.path.read_bytes()
        self.failure("validate", self.path)
        self.failure(
            "add-node", self.path, "--alias", "新增", "--takeaway", "应当失败"
        )
        self.assertEqual(self.path.read_bytes(), before)

    def test_writer_lock_failure_preserves_document_and_existing_lock(self) -> None:
        self.create_pair()
        before = self.path.read_bytes()
        lock = self.path.with_name(f".{self.path.name}.paperstream.lock")
        lock.write_text("another writer", encoding="utf-8")
        error = self.failure(
            "update-node", self.path, "paper_001", "--alias", "不应写入"
        )
        self.assertEqual(error["error"], "ConflictError")
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(lock.read_text(encoding="utf-8"), "another writer")
        lock.unlink()
        self.success("update-node", self.path, "paper_001", "--alias", "锁释放后修改")

    def test_invalid_utf8_returns_json_without_rewriting_bytes(self) -> None:
        before = b"flowchart TD\n\xff\xfe"
        self.path.write_bytes(before)
        error = self.failure("show", self.path)
        self.assertEqual(error["error"], "FormatError")
        error = self.failure(
            "add-node", self.path, "--alias", "新增", "--takeaway", "应当失败"
        )
        self.assertEqual(error["error"], "FormatError")
        self.assertEqual(self.path.read_bytes(), before)

    def test_original_title_is_separate_from_alias_and_takeaway(self) -> None:
        self.success("init", self.path)
        added = self.success(
            "add-node", self.path, "--id", "paper_001",
            "--alias", "简短名称", "--takeaway", "第一行\n第二行",
            "--name", 'An Original "Full" Paper Title: 方法介绍',
        )
        self.assertEqual(added["node"]["name"], 'An Original "Full" Paper Title: 方法介绍')
        shown = self.success("show", self.path)
        self.assertEqual(shown["nodes"][0], added["node"])
        updated = self.success(
            "update-node", self.path, "paper_001", "--name", "Corrected Original Title"
        )
        self.assertEqual(updated["node"], {
            "id": "paper_001", "alias": "简短名称", "takeaway": "第一行\n第二行",
            "name": "Corrected Original Title", "url": None, "year": None,
        })
        self.success("update-node", self.path, "paper_001", "--alias", "另一个简称")
        reloaded = self.success("show", self.path)["nodes"][0]
        self.assertEqual(reloaded["name"], "Corrected Original Title")
        self.assertEqual(reloaded["alias"], "另一个简称")
        self.assertEqual(reloaded["takeaway"], "第一行\n第二行")

    def test_invalid_names_never_change_file(self) -> None:
        self.create_pair()
        before = self.path.read_bytes()
        for invalid in ("", "   ", "Title\nAnother line"):
            with self.subTest(name=repr(invalid)):
                error = self.failure(
                    "add-node", self.path, "--alias", "不应创建", "--takeaway", "不应写入",
                    "--name", invalid,
                )
                self.assertEqual(error["error"], "ValidationError")
                self.assertEqual(self.path.read_bytes(), before)
                error = self.failure(
                    "update-node", self.path, "paper_001", "--name", invalid
                )
                self.assertEqual(error["error"], "ValidationError")
                self.assertEqual(self.path.read_bytes(), before)

    def test_url_and_year_can_be_updated_independently(self) -> None:
        self.success("init", self.path)
        added = self.success(
            "add-node", self.path, "--id", "paper_001",
            "--alias", "简称", "--takeaway", "要点", "--name", "Full Paper Title",
            "--url", "https://example.org/paper?id=1&version=2", "--year", "2024",
        )["node"]
        self.assertEqual(added, {
            "id": "paper_001", "alias": "简称", "takeaway": "要点", "name": "Full Paper Title",
            "url": "https://example.org/paper?id=1&version=2", "year": 2024,
        })
        self.assertEqual(self.success("show", self.path)["nodes"][0], added)
        changed_url = self.success(
            "update-node", self.path, "paper_001", "--url", "http://example.org/new-paper"
        )["node"]
        self.assertEqual(changed_url, {**added, "url": "http://example.org/new-paper"})
        changed_year = self.success(
            "update-node", self.path, "paper_001", "--year", "2025"
        )["node"]
        self.assertEqual(changed_year, {**changed_url, "year": 2025})
        self.assertEqual(self.success("show", self.path)["nodes"][0], changed_year)

    def test_invalid_urls_and_year_ranges_never_change_file(self) -> None:
        self.create_pair()
        before = self.path.read_bytes()
        invalid_values = [
            ("--url", ""), ("--url", "relative/paper"), ("--url", "ftp://example.org/paper"),
            ("--url", "https:///paper"), ("--url", "https://example.org/a b"),
            ("--url", "https://example.org/a\nb"), ("--url", "https://example.org/a\\b"),
            ("--year", "0"), ("--year", "-1"), ("--year", "10000"),
        ]
        for option, invalid in invalid_values:
            with self.subTest(option=option, value=repr(invalid)):
                error = self.failure(
                    "add-node", self.path, "--alias", "不应创建", "--takeaway", "不应写入",
                    option, invalid,
                )
                self.assertEqual(error["error"], "ValidationError")
                self.assertEqual(self.path.read_bytes(), before)
                error = self.failure("update-node", self.path, "paper_001", option, invalid)
                self.assertEqual(error["error"], "ValidationError")
                self.assertEqual(self.path.read_bytes(), before)

    def test_noninteger_year_is_json_usage_error_and_does_not_write(self) -> None:
        self.create_pair()
        before = self.path.read_bytes()
        for invalid in ("2024.5", "true", "unknown"):
            with self.subTest(year=invalid):
                error = self.failure(
                    "update-node", self.path, "paper_001", "--year", invalid, code=2
                )
                self.assertEqual(error["error"], "UsageError")
                self.assertEqual(self.path.read_bytes(), before)
                error = self.failure(
                    "add-node", self.path, "--alias", "不应创建", "--takeaway", "不应写入",
                    "--year", invalid, code=2,
                )
                self.assertEqual(error["error"], "UsageError")
                self.assertEqual(self.path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
