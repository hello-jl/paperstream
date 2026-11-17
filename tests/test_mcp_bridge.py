"""MCP worker transactions, explicit-file guards, and failure integrity."""

from copy import deepcopy
import json
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from paperstream import CanvasGraph, ValidationError
from paperstream.mcp_bridge import BridgeError, handle


class McpBridgeTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name).resolve()
        self.path = self.directory / "selected.canvas"
        graph = CanvasGraph.create(self.path)
        graph.add_node("First", "Original takeaway", node_id="first", year=2020)
        graph.add_node("Second", "Other takeaway", node_id="second")
        graph.add_edge("first", "second", "", edge_id="link")
        data = graph.to_dict()
        fields = json.loads(data["nodes"][0]["text"][8:-3])
        fields["figure"] = {"src": "data:image/png;base64,not-a-real-image", "width": 120, "frame": {"positionX": 25}}
        fields["futurePaperField"] = [True, None, {"keep": 12}]
        data["nodes"][0]["text"] = "```json\n" + json.dumps(fields) + "\n```"
        data["nodes"][0]["futureNode"] = {"keep": [1, 2]}
        data["nodes"].append({"id": "note", "type": "text", "text": "Do not lose this note", "x": -20, "y": 400, "width": 200, "height": 180})
        data["edges"][0]["custom"] = {"keep": "edge"}
        data["futureDocument"] = {"keep": "document"}
        graph.set_document(data)
        graph.save()
        self.original = self.path.read_bytes()
        self.guards = []
        for parent in self.path.parents:
            info = parent.lstat()
            self.guards.append({"path": str(parent), "dev": str(info.st_dev), "ino": str(info.st_ino)})

    def request(self, action="read_canvas", **fields):
        return {"path": str(self.path), "guards": self.guards, "action": action, "readOnly": False, **fields}

    def revision(self):
        return handle(self.request())["revision"]

    def test_read_graph_keeps_all_cards_layout_and_unknown_fields_without_image_payload(self):
        response = handle(self.request("read_graph"))
        self.assertEqual(len(response["graph"]["nodes"]), 3)
        first, _, note = response["graph"]["nodes"]
        fields = json.loads(first["text"][8:-3])
        self.assertEqual(first["id"], "first")
        self.assertEqual(fields["figure"]["src"], "[image source omitted]")
        self.assertEqual(fields["figure"]["frame"], {"positionX": 25})
        self.assertEqual(note["text"], "Do not lose this note")
        self.assertEqual(note["x"], -20)
        self.assertEqual(response["graph"]["edges"][0]["custom"], {"keep": "edge"})
        self.assertEqual(response["graph"]["futureDocument"], {"keep": "document"})
        self.assertNotIn("base64", json.dumps(response))
        self.assertEqual(self.path.read_bytes(), self.original)

    def test_graph_summary_uses_canvas_parser_for_ecma_whitespace_and_crlf_fences(self):
        with CanvasGraph.load(self.path) as graph:
            data = graph.to_dict()
            text = data["nodes"][0]["text"].replace("\n", "\r\n")
            data["nodes"][0]["text"] = "\ufeff\u2028\r\n\t" + text + "\r\n\ufeff\u2007"
            data["nodes"][0]["paper"] = {"src": "unrelated metadata", "nested": [1, True, None]}
            data["futureDocument"]["src"] = "ordinary unknown metadata"
            data["nodes"][0]["paperstreamCard"] = {"figures": [
                {"id": "remote", "src": "https://example.org/diagram.png", "unknown": {"src": "citation"}}]}
            graph.set_document(data)
        response = handle(self.request("read_graph"))
        fields = json.loads(response["graph"]["nodes"][0]["text"][8:-3])
        self.assertEqual(fields["futurePaperField"], [True, None, {"keep": 12}])
        self.assertEqual(response["graph"]["nodes"][0]["paper"], {"src": "unrelated metadata", "nested": [1, True, None]})
        self.assertEqual(response["graph"]["futureDocument"]["src"], "ordinary unknown metadata")
        figure = response["graph"]["nodes"][0]["paperstreamCard"]["figures"][0]
        self.assertEqual(figure["src"], "[image source omitted]")
        self.assertEqual(figure["unknown"]["src"], "citation")

    def test_multiple_semantic_operations_preserve_images_unknown_data_and_order(self):
        before = CanvasGraph.load(self.path).to_dict()
        response = handle(self.request("apply_changes", expectedRevision=self.revision(), changes=[
            {"op": "update_node", "node_id": "first", "alias": "Updated"},
            {"op": "move_node", "node_id": "note", "x": 12, "y": 34},
            {"op": "resize_node", "node_id": "note", "width": 400, "height": 220},
            {"op": "update_edge", "edge_id": "link", "relation": "Builds on"},
            {"op": "clear_node_fields", "node_id": "first", "fields": ["year"]},
            {"op": "add_node", "node_id": "new", "alias": "New", "takeaway": "Addition"},
            {"op": "add_edge", "edge_id": "new-link", "source": "second", "target": "new", "relation": ""},
        ]))
        self.assertEqual(response["outcome"], "saved")
        after = CanvasGraph.load(self.path).to_dict()
        self.assertEqual([row["id"] for row in after["nodes"]], ["first", "second", "note", "new"])
        self.assertEqual(after["nodes"][1], before["nodes"][1])
        old_fields = json.loads(before["nodes"][0]["text"][8:-3])
        new_fields = json.loads(after["nodes"][0]["text"][8:-3])
        self.assertEqual(new_fields["figure"], old_fields["figure"])
        self.assertEqual(new_fields["futurePaperField"], old_fields["futurePaperField"])
        self.assertEqual(after["nodes"][0]["futureNode"], before["nodes"][0]["futureNode"])
        self.assertEqual(after["edges"][0]["custom"], before["edges"][0]["custom"])
        self.assertEqual(after["futureDocument"], before["futureDocument"])
        self.assertIsNone(new_fields["year"])
        self.assertEqual(len(response["changes"]), 7)

    def test_transaction_failure_never_saves_earlier_changes(self):
        with self.assertRaises(ValidationError):
            handle(self.request("apply_changes", expectedRevision=self.revision(), changes=[
                {"op": "update_node", "node_id": "first", "alias": "Must not save"},
                {"op": "add_edge", "source": "first", "target": "missing", "relation": "Invalid"},
            ]))
        self.assertEqual(self.path.read_bytes(), self.original)

    def test_conflicts_repeatedly_refuse_the_same_old_snapshot(self):
        old = self.revision()
        with CanvasGraph.load(self.path) as graph:
            graph.update_node("second", alias="External writer")
        latest = self.path.read_bytes()
        for _ in range(2):
            result = handle(self.request("apply_changes", expectedRevision=old, changes=[
                {"op": "update_node", "node_id": "first", "alias": "Stale"}]))
            self.assertEqual(result["outcome"], "conflict")
            self.assertNotEqual(result["revision"], old)
            self.assertEqual(self.path.read_bytes(), latest)

    def test_whole_editor_write_is_revision_checked_and_validated(self):
        revision = self.revision()
        data = CanvasGraph.load(self.path).to_dict()
        data["nodes"][2]["text"] = "Editor draft"
        result = handle(self.request("write_canvas", expectedRevision=revision, text=json.dumps(data)))
        self.assertEqual(result["outcome"], "saved")
        saved = self.path.read_bytes()
        conflict = handle(self.request("write_canvas", expectedRevision=revision, text=self.original.decode()))
        self.assertEqual(conflict["outcome"], "conflict")
        self.assertEqual(self.path.read_bytes(), saved)
        with self.assertRaises(ValidationError):
            handle(self.request("write_canvas", expectedRevision=result["revision"], text='{"nodes": [{"id": "bad"}]}'))
        self.assertEqual(self.path.read_bytes(), saved)

    def test_read_only_and_missing_revision_refuse_writes(self):
        for action in ["write_canvas", "apply_changes"]:
            with self.assertRaises(BridgeError) as caught:
                handle(self.request(action, readOnly=True, expectedRevision=self.revision(), text="{}", changes=[]))
            self.assertEqual(caught.exception.code, "read_only")
        with self.assertRaises(ValidationError):
            handle(self.request("apply_changes", changes=[{"op": "move_node", "node_id": "first", "x": 0, "y": 0}]))
        self.assertEqual(self.path.read_bytes(), self.original)

    def test_deletion_document_replacement_and_extra_fields_are_not_model_ops(self):
        for change in [{"op": "remove_node", "node_id": "first"}, {"op": "set_document", "data": {}},
                       {"op": "update_node", "node_id": "first", "alias": "bad", "path": "/etc/passwd"}]:
            with self.assertRaises(ValidationError):
                handle(self.request("apply_changes", expectedRevision=self.revision(), changes=[change]))
        self.assertEqual(self.path.read_bytes(), self.original)

    def test_existing_writer_lock_is_not_deleted_or_retried(self):
        lock = self.path.with_name(f".{self.path.name}.paperstream.lock")
        lock.write_text("another writer", encoding="utf-8")
        result = handle(self.request("apply_changes", expectedRevision=self.revision(), changes=[
            {"op": "update_node", "node_id": "first", "alias": "Must not save"}]))
        self.assertEqual(result["outcome"], "conflict")
        self.assertEqual(lock.read_text(), "another writer")
        self.assertEqual(self.path.read_bytes(), self.original)

    def test_replacing_selected_file_with_symlink_never_reads_target(self):
        other = self.directory / "other.canvas"
        self.path.rename(other)
        self.path.symlink_to(other)
        with self.assertRaises(BridgeError) as caught:
            handle(self.request())
        self.assertEqual(caught.exception.code, "unsafe_path")
        self.assertEqual(other.read_bytes(), self.original)

    def test_replaced_parent_and_incomplete_guards_are_refused(self):
        wrong = deepcopy(self.guards)
        wrong[0]["ino"] = str(int(wrong[0]["ino"]) + 1)
        for guards in [wrong, self.guards[:-1]]:
            with self.assertRaises(BridgeError):
                handle(self.request(guards=guards))

    def test_post_load_guard_catches_symlink_appearing_during_read(self):
        original_load = CanvasGraph.load
        other = self.directory / "other.canvas"
        def swapped(path):
            graph = original_load(path)
            self.path.rename(other)
            self.path.symlink_to(other)
            return graph
        with patch("paperstream.mcp_bridge.CanvasGraph.load", side_effect=swapped):
            with self.assertRaises(BridgeError):
                handle(self.request())

    def test_script_mode_uses_one_structured_reply_and_no_shell(self):
        worker = Path(__file__).resolve().parents[1] / "paperstream" / "mcp_bridge.py"
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        process = subprocess.run([sys.executable, str(worker)], input=json.dumps(self.request()),
                                 capture_output=True, text=True, cwd=self.directory, env=env, check=False)
        self.assertEqual(process.returncode, 0, process.stderr)
        response = json.loads(process.stdout)
        self.assertTrue(response["ok"])
        self.assertEqual(json.loads(response["text"])["nodes"][2]["id"], "note")
        failed = subprocess.run([sys.executable, str(worker)], input='{"path": "../no.canvas"}',
                                capture_output=True, text=True, env=env, check=False)
        self.assertEqual(failed.returncode, 1)
        self.assertEqual(json.loads(failed.stdout)["code"], "unsafe_path")


if __name__ == "__main__":
    unittest.main()
