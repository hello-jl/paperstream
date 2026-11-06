"""JSON Canvas contract, portability, and failure-integrity checks."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from paperstream import CanvasGraph, ConflictError, FormatError, Graph, PaperstreamError, ValidationError, export_canvas


class CanvasTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "papers.canvas"

    def pair(self):
        graph = CanvasGraph.create(self.path)
        first = graph.add_node("基础", "第一行\n第二行", name="Original title", year=2020,
                               url="https://example.org/paper", node_id="0-first")
        second = graph.add_node("改进", "降低成本")
        graph.add_edge(first.id, second.id, "简化计算")
        return graph, first, second

    def test_live_editing_can_clear_paper_text_without_losing_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "live.canvas"
            graph = CanvasGraph.create(path)
            node = graph.add_node("A", "Notes", year=2020)
            graph.update_node(node.id, alias="", takeaway="")
            graph.save()
            restored = CanvasGraph.load(path).nodes()[0]
            self.assertEqual(restored.alias, "")
            self.assertEqual(restored.takeaway, "")
            self.assertEqual(restored.year, 2020)

    def test_empty_relation_creation_and_clearing_preserve_other_edge_fields(self):
        graph, first, second = self.pair()
        added = graph.add_edge(first.id, second.id, "")
        data = graph.to_dict()
        data["edges"][0]["custom"] = {"keep": [1, 2]}
        graph.set_document(data)
        existing_id = graph.edges()[0].id
        graph.update_edge(existing_id, relation="")
        graph.save()
        loaded = CanvasGraph.load(self.path)
        self.assertEqual([edge.relation for edge in loaded.edges()], ["", ""])
        self.assertEqual(loaded.edges()[1].id, added.id)
        self.assertEqual(loaded.to_dict()["edges"][0]["custom"], {"keep": [1, 2]})
        for invalid in ["\n", "\x00", None]:
            with self.assertRaises(ValidationError):
                graph.add_edge(first.id, second.id, invalid)

    def test_roundtrip_crud_geometry_and_optional_clear(self):
        graph, first, second = self.pair()
        self.assertFalse(self.path.exists())
        graph.move_node(first.id, -30, 80)
        graph.resize_node(first.id, 420, 280)
        graph.update_node(first.id, alias="新简称", takeaway='Contains "quotes", `ticks`, \\ and %%{')
        graph.clear_node_fields(first.id, ["year", "url"])
        edge = graph.edges()[0]
        graph.update_edge(edge.id, source=second.id, target=first.id, relation="重新比较")
        graph.save()
        loaded = CanvasGraph.load(self.path)
        self.assertEqual(loaded.nodes(), graph.nodes())
        self.assertEqual(loaded.edges(), graph.edges())
        self.assertEqual(loaded.nodes()[0].name, "Original title")
        self.assertIsNone(loaded.nodes()[0].year)
        self.assertIsNone(loaded.nodes()[0].url)
        row = loaded.to_dict()["nodes"][0]
        self.assertEqual((row["x"], row["y"], row["width"], row["height"]), (-30, 80, 420, 280))
        self.assertEqual(row["text"].count('"alias"'), 1)
        self.assertNotIn("paperstream", row)
        with self.assertRaises(ValidationError):
            loaded.remove_node(first.id)
        loaded.remove_node(first.id, cascade=True)
        self.assertEqual([node.id for node in loaded.nodes()], [second.id])
        self.assertEqual(loaded.edges(), [])

    def test_unknown_fields_native_cards_and_array_order_survive_targeted_edit(self):
        graph, first, second = self.pair()
        data = graph.to_dict()
        data["future"] = {"nested": [1, True, None]}
        data["nodes"][0]["color"] = "4"
        data["nodes"][0]["pluginData"] = {"nested": ["kept"]}
        fields = json.loads(data["nodes"][0]["text"][8:-4])
        fields["futurePaperField"] = {"kept": True}
        data["nodes"][0]["text"] = "```json\n" + json.dumps(fields) + "\n```"
        ordinary = {"id": "ordinary", "type": "text", "text": "A plain note", "x": 0, "y": 500,
                    "width": 100, "height": 100, "custom": ["unchanged"]}
        group = {"id": "group", "type": "group", "label": "Research", "x": -10, "y": -10,
                 "width": 900, "height": 900}
        data["nodes"].insert(0, group)
        data["nodes"].append(ordinary)
        native_edge = {"id": "native-edge", "fromNode": second.id, "toNode": "ordinary",
                       "fromSide": "bottom", "color": "2", "extra": {"keep": 1}}
        data["edges"].append(native_edge)
        graph.set_document(data)
        graph.update_node(first.id, takeaway="Revised")
        graph.update_edge(graph.edges()[0].id, relation="Updated")
        graph.save()
        actual = CanvasGraph.load(self.path).to_dict()
        self.assertEqual(actual["future"], data["future"])
        self.assertEqual([row["id"] for row in actual["nodes"]], [row["id"] for row in data["nodes"]])
        self.assertEqual(actual["nodes"][0], group)
        self.assertEqual(actual["nodes"][-1], ordinary)
        self.assertEqual(actual["edges"][-1], native_edge)
        paper = actual["nodes"][1]
        self.assertEqual(paper["pluginData"], {"nested": ["kept"]})
        self.assertEqual(paper["color"], "4")
        self.assertIn('"futurePaperField"', paper["text"])
        self.assertEqual(len(graph.nodes()), 2)
        self.assertEqual(graph.edges()[-1].relation, "")

    def test_empty_standard_document_and_noop_preserve_bytes(self):
        before = b'{ "custom": 1 }\n'
        self.path.write_bytes(before)
        graph = CanvasGraph.load(self.path)
        self.assertEqual(graph.nodes(), [])
        self.assertEqual(graph.edges(), [])
        graph.save()
        self.assertEqual(self.path.read_bytes(), before)
        graph.add_node("A", "B")
        self.assertNotIn("edges", graph.to_dict())
        self.assertEqual(graph.to_dict()["custom"], 1)

    def test_failed_mutations_do_not_change_memory_or_disk(self):
        graph, first, second = self.pair()
        graph.save()
        before = graph.to_dict()
        saved = self.path.read_bytes()
        operations = [
            lambda: graph.update_node(first.id, alias="Changed", year=True),
            lambda: graph.update_node(first.id, name=""),
            lambda: graph.update_node(first.id, url="https://example.org\\bad"),
            lambda: graph.add_node("A", "B", x=1.5),
            lambda: graph.move_node(first.id, True, 0),
            lambda: graph.resize_node(first.id, 0, 100),
            lambda: graph.clear_node_fields(first.id, ["alias"]),
            lambda: graph.add_edge(first.id, "missing", "relation"),
            lambda: graph.update_edge(graph.edges()[0].id, relation="\n"),
        ]
        for operation in operations:
            with self.subTest(operation=operation):
                with self.assertRaises(ValidationError):
                    operation()
                self.assertEqual(graph.to_dict(), before)
                self.assertEqual(self.path.read_bytes(), saved)

    def test_whole_document_update_is_transactional_and_defensively_copied(self):
        graph, first, _ = self.pair()
        before = graph.to_dict()
        broken = deepcopy(before)
        broken["edges"][0]["toNode"] = "missing"
        with self.assertRaises(ValidationError):
            graph.set_document(broken)
        self.assertEqual(graph.to_dict(), before)
        copy = graph.to_dict()
        copy["nodes"].clear()
        self.assertEqual(len(graph.nodes()), 2)
        fresh = CanvasGraph.from_dict(self.path, before)
        before["nodes"].clear()
        self.assertEqual(len(fresh.nodes()), 2)

    def test_external_change_lock_and_atomic_replace_failures_preserve_data(self):
        graph, first, _ = self.pair()
        graph.save()
        stale = CanvasGraph.load(self.path)
        graph.update_node(first.id, alias="New on disk")
        graph.save()
        current = self.path.read_bytes()
        stale.update_node(first.id, takeaway="Stale change")
        with self.assertRaises(ConflictError):
            stale.save()
        self.assertEqual(self.path.read_bytes(), current)
        graph.update_node(first.id, takeaway="Pending")
        lock = self.path.with_name(f".{self.path.name}.paperstream.lock")
        lock.write_text("other writer")
        with self.assertRaises(ConflictError):
            graph.save()
        self.assertEqual(lock.read_text(), "other writer")
        lock.unlink()
        with patch("paperstream.canvas.os.replace", side_effect=OSError("replace failed")):
            with self.assertRaises(PaperstreamError):
                graph.save()
        self.assertEqual(self.path.read_bytes(), current)
        self.assertFalse(lock.exists())
        self.assertEqual(list(self.path.parent.glob("*.tmp")), [])
        graph.save()
        self.assertEqual(CanvasGraph.load(self.path).nodes()[0].takeaway, "Pending")

    def test_creation_collision_and_context_exception_do_not_overwrite(self):
        graph = CanvasGraph.create(self.path)
        self.path.write_text("another file")
        with self.assertRaises(ConflictError):
            graph.save()
        self.assertEqual(self.path.read_text(), "another file")
        with self.assertRaises(ConflictError):
            CanvasGraph.from_dict(self.path, {})
        other = self.path.with_name("unsaved.canvas")
        with self.assertRaises(RuntimeError):
            with CanvasGraph.create(other) as pending:
                pending.add_node("A", "B")
                raise RuntimeError("abort")
        self.assertFalse(other.exists())

    def test_reject_ambiguous_invalid_json_and_known_fields(self):
        for text in ('{"nodes": [], "nodes": []}', '{"number": NaN}', '[]', '{bad'):
            with self.subTest(text=text):
                with self.assertRaises((FormatError, ValidationError)):
                    CanvasGraph.from_json(self.path, text)
        graph, _, _ = self.pair()
        for key, value in (("width", True), ("height", -1), ("x", 1.5)):
            data = graph.to_dict()
            data["nodes"][0][key] = value
            with self.assertRaises(ValidationError):
                graph.set_document(data)
        data = graph.to_dict()
        data["edges"][0]["fromSide"] = {}
        with self.assertRaises(ValidationError):
            graph.set_document(data)
        data = graph.to_dict()
        data["nodes"][0]["text"] = '```json\n{"paperstream": 1, "alias": "A"}\n```'
        with self.assertRaises(ValidationError):
            graph.set_document(data)

    def test_native_nonpaper_types_and_other_template_versions_remain_native(self):
        nodes = [
            {"id": "file", "type": "file", "file": "notes/paper.md"},
            {"id": "link", "type": "link", "url": "https://example.org"},
            {"id": "note", "type": "text", "text": "```json\n{\"paperstream\": 2}\n```"},
        ]
        for row in nodes:
            row.update(x=0, y=0, width=100, height=100)
        graph = CanvasGraph.from_dict(self.path, {"nodes": nodes})
        self.assertEqual(graph.nodes(), [])
        graph.move_node("file", 5, 10)
        with self.assertRaises(ValidationError):
            graph.remove_node("file")
        self.assertEqual(graph.to_dict()["nodes"][0]["file"], "notes/paper.md")

    def test_non_json_python_values_are_rejected_without_coercion(self):
        graph, _, _ = self.pair()
        before = graph.to_dict()
        cycle = []
        cycle.append(cycle)
        for invalid in ((1, 2), {1: "integer key"}, {None: "null key"}, b"bytes",
                        {"nested": [float("inf")]}, float("nan"), object(), cycle):
            with self.subTest(value=type(invalid).__name__):
                data = graph.to_dict()
                data["unknown"] = invalid
                with self.assertRaises(FormatError):
                    graph.set_document(data)
                self.assertEqual(graph.to_dict(), before)
        large = 9007199254740993
        data = graph.to_dict()
        data["unknown"] = {"exact_integer": large, "decimal": 0.25, "values": [None, False, "text"]}
        graph.set_document(data)
        graph.save()
        self.assertEqual(CanvasGraph.load(self.path).to_dict()["unknown"], data["unknown"])

    def test_standard_optional_fields_and_node_types_are_validated(self):
        graph, _, _ = self.pair()
        before = graph.to_dict()
        invalid = [("type", "future-type"), ("color", 1), ("label", []),
                   ("background", None), ("subpath", "heading"), ("subpath", 1),
                   ("backgroundStyle", "stretch"), ("backgroundStyle", {})]
        for key, value in invalid:
            with self.subTest(field=key, value=value):
                data = graph.to_dict()
                data["nodes"][0][key] = value
                with self.assertRaises(ValidationError):
                    graph.set_document(data)
                self.assertEqual(graph.to_dict(), before)
        data = graph.to_dict()
        data["edges"][0]["color"] = False
        with self.assertRaises(ValidationError):
            graph.set_document(data)
        data = graph.to_dict()
        data["nodes"][0].update(color="5", label="label", background="image.png",
                                subpath="#heading", backgroundStyle="ratio")
        graph.set_document(data)
        self.assertEqual(graph.to_dict(), data)

    def test_geometry_requires_javascript_safe_integers(self):
        graph, first, _ = self.pair()
        limit = 9007199254740991
        graph.move_node(first.id, -limit, limit)
        before = graph.to_dict()
        for x, y in ((limit + 1, 0), (0, -limit - 1)):
            with self.assertRaises(ValidationError):
                graph.move_node(first.id, x, y)
            self.assertEqual(graph.to_dict(), before)
        with self.assertRaises(ValidationError):
            graph.resize_node(first.id, limit + 1, 200)
        self.assertEqual(graph.to_dict(), before)

    def test_paper_fence_whitespace_matches_javascript_trim(self):
        graph, first, _ = self.pair()
        data = graph.to_dict()
        original = data["nodes"][0]["text"]
        data["nodes"][0]["text"] = "\ufeff\u00a0 \r\n" + original + "\u3000\n"
        graph.set_document(data)
        self.assertEqual(graph.nodes()[0].id, first.id)
        graph.save()
        self.assertEqual(CanvasGraph.load(self.path).to_dict()["nodes"][0]["text"], data["nodes"][0]["text"])
        # Python str.strip regards this control character as whitespace; JS
        # trim does not, so this is an ordinary card in both implementations.
        data["nodes"][0]["text"] = "\u001c" + original
        graph.set_document(data)
        self.assertNotIn(first.id, [node.id for node in graph.nodes()])

    def test_json_decimal_precision_loss_is_rejected_before_editing(self):
        for number in ("9007199254740990.1", "1e-400", "0.123456789012345678901", "1e-999999999999999999999"):
            with self.subTest(number=number):
                with self.assertRaises(FormatError):
                    CanvasGraph.from_json(self.path, '{"unknown":' + number + '}')
        graph = CanvasGraph.from_json(self.path, '{"unknown":0.125}')
        self.assertEqual(graph.to_dict()["unknown"], 0.125)

    def test_mermaid_export_preserves_fields_ids_source_and_existing_destination(self):
        source = self.path.with_suffix(".mmd")
        with Graph.create(source) as graph:
            a = graph.add_node("Alias", "Takeaway", name="Original title", year=2021)
            b = graph.add_node("Other", "Second", url="https://example.org/second")
            graph.add_edge(a.id, b.id, "Extends")
        before = source.read_bytes()
        exported = export_canvas(source, self.path)
        self.assertEqual(exported.nodes(), Graph.load(source).nodes())
        self.assertEqual(exported.edges(), Graph.load(source).edges())
        self.assertEqual(source.read_bytes(), before)
        saved = self.path.read_bytes()
        with self.assertRaises(ConflictError):
            export_canvas(source, self.path)
        self.assertEqual(self.path.read_bytes(), saved)
        self.assertEqual(source.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
