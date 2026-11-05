"""End-to-end Canvas commands and compatibility with existing Mermaid CLI."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class CanvasCommandTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "papers.canvas"

    def run_cli(self, *arguments, code=0):
        result = subprocess.run([sys.executable, "-m", "paperstream", *map(str, arguments)],
                                cwd=PROJECT_ROOT, text=True, encoding="utf-8", capture_output=True)
        self.assertEqual(result.returncode, code, result.stderr)
        self.assertEqual(result.stderr if code == 0 else result.stdout, "")
        return json.loads(result.stdout if code == 0 else result.stderr)

    def test_canvas_edit_geometry_clear_and_readonly_roundtrip(self):
        self.run_cli("init", self.path)
        first = self.run_cli("add-node", self.path, "--alias", "A", "--takeaway", "B",
                             "--name", "Original title", "--year", "2020", "--x", "-10")["node"]
        second = self.run_cli("add-node", self.path, "--alias", "C", "--takeaway", "D")["node"]
        edge = self.run_cli("add-edge", self.path, first["id"], second["id"], "--relation", "extends")["edge"]
        self.run_cli("move-node", self.path, first["id"], "--x", "80", "--y", "90")
        self.run_cli("resize-node", self.path, first["id"], "--width", "400", "--height", "250")
        self.run_cli("clear-node-fields", self.path, first["id"], "name", "year")
        self.run_cli("update-node", self.path, first["id"], "--takeaway", "Changed")
        before = self.path.read_bytes()
        shown = self.run_cli("show", self.path, "--raw")
        self.assertEqual(shown["nodes"][0]["takeaway"], "Changed")
        self.assertIsNone(shown["nodes"][0]["name"])
        self.assertIsNone(shown["nodes"][0]["year"])
        self.assertEqual(shown["document"]["nodes"][0]["x"], 80)
        self.assertEqual(shown["document"]["nodes"][0]["width"], 400)
        self.assertTrue(self.run_cli("validate", self.path)["valid"])
        self.assertEqual(self.path.read_bytes(), before)
        self.run_cli("remove-edge", self.path, edge["id"])
        self.run_cli("remove-node", self.path, second["id"])
        self.assertEqual(len(self.run_cli("show", self.path)["nodes"]), 1)

    def test_invalid_inputs_are_json_errors_and_do_not_change_file(self):
        self.run_cli("init", self.path)
        node = self.run_cli("add-node", self.path, "--alias", "A", "--takeaway", "B")["node"]
        before = self.path.read_bytes()
        for args, code in [
            (("resize-node", self.path, node["id"], "--width", "0", "--height", "200"), 1),
            (("move-node", self.path, node["id"], "--x", "2.5", "--y", "0"), 2),
            (("update-node", self.path, node["id"], "--year", "abc"), 2),
            (("update-node", self.path, node["id"], "--url", "relative"), 1),
            (("clear-node-fields", self.path, node["id"], "alias"), 2),
            (("init", self.path), 1),
        ]:
            with self.subTest(args=args):
                self.assertFalse(self.run_cli(*args, code=code)["ok"])
                self.assertEqual(self.path.read_bytes(), before)

    def test_export_command_leaves_mermaid_usable_and_source_unchanged(self):
        source = self.path.with_suffix(".mmd")
        self.run_cli("init", source)
        self.run_cli("add-node", source, "--alias", "Original", "--takeaway", "Meaning")
        before = source.read_bytes()
        self.run_cli("export-canvas", source, self.path)
        self.assertEqual(self.path.read_bytes()[:1], b"{")
        self.assertEqual(self.run_cli("show", source)["nodes"], self.run_cli("show", self.path)["nodes"])
        self.assertEqual(source.read_bytes(), before)
        self.run_cli("export-canvas", source, self.path, code=1)
        self.run_cli("move-node", source, "paper_001", "--x", "0", "--y", "0", code=1)
        self.assertEqual(source.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
