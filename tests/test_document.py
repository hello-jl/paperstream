"""Contract tests for maintaining user-owned Mermaid graph documents."""

from pathlib import Path
import json
import os
import tempfile
import unittest
from unittest import mock

from paperstream import (
    ConflictError,
    FormatError,
    Graph,
    PaperstreamError,
    ValidationError,
)


FIXTURE = '''flowchart TD
    %% Keep this research note and its spacing.

    paper_001["`**基础方法**
原始要点。`"]

    %% A note belonging to the next paper.
    paper_002["`**后续工作**
第一行认识。
第二行认识。`"]

    paper_001 relation_001@-->|"沿用基础方法"| paper_002
'''


class DocumentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "papers.mmd"

    def load_fixture(self, text=FIXTURE):
        self.path.write_bytes(text.encode("utf-8"))
        return Graph.load(self.path)

    def assert_fields(self, node, alias, takeaway):
        self.assertEqual(node.alias, alias)
        self.assertEqual(node.takeaway, takeaway)

    def test_current_example_can_be_read_without_modifying_it(self):
        path = Path(__file__).resolve().parents[1] / "examples" / "paperstream.mmd"
        original = path.read_bytes()
        graph = Graph.load(path)
        graph.validate()
        self.assertEqual(len(graph.nodes()), 4)
        self.assertEqual(len(graph.edges()), 4)
        self.assert_fields(graph.nodes()[0], "基础方法", "提出这组工作的共同出发点。")
        self.assertEqual(path.read_bytes(), original)

    def test_create_add_and_reload_with_parallel_relations(self):
        graph = Graph.create(self.path, direction="LR")
        first = graph.add_node("基础方法", "一个结论。")
        second = graph.add_node("后续方法", "另一个结论。")
        one = graph.add_edge(first.id, second.id, "沿用方法")
        two = graph.add_edge(first.id, second.id, "拓展适用条件")
        self.assertNotEqual(one.id, two.id)
        self.assertFalse(self.path.exists(), "Edits should stay in memory until save")
        graph.save()
        loaded = Graph.load(self.path)
        loaded.validate()
        self.assertEqual(loaded.nodes(), graph.nodes())
        self.assertEqual(loaded.edges(), graph.edges())
        self.assertIn("flowchart LR", self.path.read_text())

    def test_node_update_preserves_everything_outside_target_text(self):
        graph = self.load_fixture()
        updated = graph.update_node("paper_001", alias="改名后的方法", takeaway="新的要点。")
        self.assertEqual(updated.id, "paper_001")
        self.assertEqual(self.path.read_text(), FIXTURE)
        graph.save()
        expected = FIXTURE.replace("**基础方法**", "**改名后的方法**").replace(
            "原始要点。", "新的要点。"
        )
        self.assertEqual(self.path.read_bytes(), expected.encode("utf-8"))

    def test_edge_update_preserves_node_text_and_comments(self):
        graph = self.load_fixture()
        updated = graph.update_edge("relation_001", relation="改进基础方法")
        self.assertEqual(updated.id, "relation_001")
        graph.save()
        expected = FIXTURE.replace('"沿用基础方法"', '"改进基础方法"')
        self.assertEqual(self.path.read_bytes(), expected.encode("utf-8"))

    def test_alias_update_preserves_multiline_takeaway_and_crlf(self):
        original = FIXTURE.replace("\n", "\r\n")
        graph = self.load_fixture(original)
        graph.update_node("paper_002", alias="新名称")
        graph.save()
        expected = original.replace("**后续工作**", "**新名称**")
        self.assertEqual(self.path.read_bytes(), expected.encode("utf-8"))
        reloaded = Graph.load(self.path)
        self.assertEqual(reloaded.nodes()[1].takeaway, "第一行认识。\n第二行认识。")

    def test_save_without_changes_keeps_original_bytes(self):
        graph = self.load_fixture()
        before = self.path.read_bytes()
        graph.save()
        self.assertEqual(self.path.read_bytes(), before)

    def test_special_characters_and_unicode_roundtrip(self):
        graph = Graph.create(self.path)
        alias = '中文 "quote" & <tag> `code` | #35; **bold** %% 字面量'
        takeaway = '第一行 "引号" & <tag> | `code`\n第二行 **文字** 与 #quot; 字面量。\n%% 这不是 Mermaid 注释'
        relation = '使用 "A" & <B> | `C` #35; %% 字面量'
        first = graph.add_node(alias, takeaway)
        second = graph.add_node("对照论文", "保持原始结论。")
        graph.add_edge(first.id, second.id, relation)
        graph.save()
        self.assertNotIn("%%", self.path.read_text(), "Literal comment markers need encoding")
        loaded = Graph.load(self.path)
        self.assert_fields(loaded.nodes()[0], alias, takeaway)
        self.assertEqual(loaded.edges()[0].relation, relation)
        replacement = '修改后 "名称" < > & ` | #amp;'
        loaded.update_node(first.id, alias=replacement)
        loaded.save()
        self.assert_fields(Graph.load(self.path).nodes()[0], replacement, takeaway)

    def test_node_removal_requires_explicit_cascade(self):
        graph = self.load_fixture()
        before_nodes, before_edges = graph.nodes(), graph.edges()
        with self.assertRaises(ValidationError):
            graph.remove_node("paper_001")
        self.assertEqual(graph.nodes(), before_nodes)
        self.assertEqual(graph.edges(), before_edges)
        self.assertEqual(self.path.read_text(), FIXTURE)
        graph.remove_node("paper_001", cascade=True)
        self.assertEqual([node.id for node in graph.nodes()], ["paper_002"])
        self.assertEqual(graph.edges(), [])
        graph.save()
        Graph.load(self.path).validate()

    def test_cascade_preserves_unrelated_relations(self):
        graph = self.load_fixture()
        third = graph.add_node("第三篇", "另一个要点。")
        removed = graph.add_edge("paper_001", third.id, "另一路延伸")
        retained = graph.add_edge("paper_002", third.id, "与后续工作相关")
        graph.remove_node("paper_001", cascade=True)
        self.assertEqual([edge.id for edge in graph.edges()], [retained.id])
        self.assertNotIn(removed.id, [edge.id for edge in graph.edges()])
        graph.save()
        self.assertEqual(Graph.load(self.path).edges(), [retained])

    def test_deleted_ids_are_not_reused_after_reload(self):
        graph = Graph.create(self.path)
        first = graph.add_node("第一篇", "第一条认识。")
        last = graph.add_node("第二篇", "第二条认识。")
        old_edge = graph.add_edge(first.id, last.id, "关系一")
        graph.remove_edge(old_edge.id)
        graph.remove_node(last.id)
        graph.save()
        loaded = Graph.load(self.path)
        new_node = loaded.add_node("新增论文", "新的认识。")
        new_edge = loaded.add_edge(first.id, new_node.id, "新的关系")
        self.assertNotEqual(new_node.id, last.id)
        self.assertNotEqual(new_edge.id, old_edge.id)

    def test_invalid_mutations_leave_graph_unchanged(self):
        graph = self.load_fixture()
        before_nodes, before_edges = graph.nodes(), graph.edges()
        operations = [
            lambda: graph.add_node("", "要点"),
            lambda: graph.add_node("名称", " \n "),
            lambda: graph.add_node("名称", "要点", node_id="bad id"),
            lambda: graph.add_node("重复", "要点", node_id="paper_001"),
            lambda: graph.update_node("paper_001", alias=" "),
            lambda: graph.update_node("missing", alias="名称"),
            lambda: graph.add_edge("paper_001", "missing", "关系"),
            lambda: graph.add_edge("paper_001", "paper_002", " "),
            lambda: graph.add_edge("paper_001", "paper_002", "关系", edge_id="relation_001"),
            lambda: graph.update_edge("relation_001", target="missing"),
            lambda: graph.update_edge("relation_001", relation=""),
            lambda: graph.remove_edge("missing"),
        ]
        for operation in operations:
            with self.subTest(operation=operation):
                with self.assertRaises(PaperstreamError):
                    operation()
                self.assertEqual(graph.nodes(), before_nodes)
                self.assertEqual(graph.edges(), before_edges)
                self.assertEqual(self.path.read_text(), FIXTURE)

    def test_invalid_existing_documents_fail_closed(self):
        broken = {
            "duplicate node": FIXTURE + '\n    paper_001["`**重复**\n要点。`"]\n',
            "duplicate edge": FIXTURE + '\n    paper_001 relation_001@-->|"重复"| paper_002\n',
            "unknown endpoint": FIXTURE.replace('| paper_002', '| paper_999'),
            "blank alias": FIXTURE.replace("**基础方法**", "****"),
            "blank takeaway": FIXTURE.replace("原始要点。", " "),
            "blank relation": FIXTURE.replace('"沿用基础方法"', '" "'),
            "unterminated label": FIXTURE.replace('原始要点。`"]', '原始要点。'),
        }
        for name, document in broken.items():
            with self.subTest(name=name):
                self.path.write_bytes(document.encode("utf-8"))
                with self.assertRaises(PaperstreamError):
                    Graph.load(self.path)
                self.assertEqual(self.path.read_bytes(), document.encode("utf-8"))

    def test_unsupported_mermaid_syntax_is_not_silently_dropped(self):
        original = FIXTURE + '\n    extra(("unmanaged node"))\n'
        self.path.write_text(original)
        with self.assertRaises(FormatError):
            Graph.load(self.path)
        self.assertEqual(self.path.read_text(), original)

    def test_external_edit_is_preserved_on_save_conflict(self):
        graph = self.load_fixture()
        graph.update_node("paper_001", takeaway="API 的修改。")
        external = FIXTURE + "\n    %% A later edit by the user.\n"
        self.path.write_text(external)
        with self.assertRaises(ConflictError):
            graph.save()
        self.assertEqual(self.path.read_text(), external)
        current = Graph.load(self.path)
        current.update_node("paper_001", takeaway="重新读取后合并的修改。")
        current.save()
        self.assertIn("A later edit by the user.", self.path.read_text())

    def test_two_loaded_writers_do_not_overwrite_each_other(self):
        first = self.load_fixture()
        second = Graph.load(self.path)
        first.update_node("paper_001", alias="先保存的名称")
        first.save()
        written = self.path.read_bytes()
        second.update_node("paper_002", alias="过期文档上的名称")
        with self.assertRaises(ConflictError):
            second.save()
        self.assertEqual(self.path.read_bytes(), written)

    def test_new_graph_cannot_overwrite_existing_file(self):
        self.path.write_text("User content that must be preserved.\n")
        original = self.path.read_bytes()
        with self.assertRaises(PaperstreamError):
            graph = Graph.create(self.path)
            graph.add_node("新论文", "新要点。")
            graph.save()
        self.assertEqual(self.path.read_bytes(), original)

    def test_failed_atomic_replace_preserves_original_and_allows_retry(self):
        graph = self.load_fixture()
        graph.update_node("paper_001", takeaway="写入失败后重试。")
        original = self.path.read_bytes()
        with mock.patch("os.replace", side_effect=OSError("simulated write failure")):
            with self.assertRaises((OSError, PaperstreamError)):
                graph.save()
        self.assertEqual(self.path.read_bytes(), original)
        graph.save()
        self.assertEqual(Graph.load(self.path).nodes()[0].takeaway, "写入失败后重试。")

    def test_update_edge_changes_only_its_requested_fields(self):
        graph = self.load_fixture()
        third = graph.add_node("第三篇", "第三条认识。")
        graph.save()
        original = self.path.read_text()
        updated = graph.update_edge("relation_001", source=third.id, target="paper_001")
        self.assertEqual(updated.source, third.id)
        self.assertEqual(updated.target, "paper_001")
        self.assertEqual(updated.relation, "沿用基础方法")
        graph.save()
        expected = original.replace(
            'paper_001 relation_001@-->|"沿用基础方法"| paper_002',
            f'{third.id} relation_001@-->|"沿用基础方法"| paper_001',
        )
        self.assertEqual(self.path.read_text(), expected)

    def test_context_manager_commits_success_but_not_exceptions(self):
        self.load_fixture()
        with Graph.load(self.path) as graph:
            graph.update_node("paper_001", takeaway="成功退出时保存。")
        successful = self.path.read_bytes()
        self.assertEqual(Graph.load(self.path).nodes()[0].takeaway, "成功退出时保存。")
        with self.assertRaisesRegex(RuntimeError, "abort"):
            with Graph.load(self.path) as graph:
                graph.update_node("paper_001", takeaway="不应保存的修改。")
                raise RuntimeError("abort")
        self.assertEqual(self.path.read_bytes(), successful)

    def test_cooperative_writer_is_rejected_during_active_save(self):
        first = self.load_fixture()
        second = Graph.load(self.path)
        first.update_node("paper_001", takeaway="先取得锁的修改。")
        second.update_node("paper_002", takeaway="另一个写入者的修改。")
        replace = os.replace

        def competing_replace(source, destination):
            with self.assertRaises(ConflictError):
                second.save()
            return replace(source, destination)

        with mock.patch("os.replace", side_effect=competing_replace):
            first.save()
        loaded = Graph.load(self.path)
        self.assertEqual(loaded.nodes()[0].takeaway, "先取得锁的修改。")
        self.assertEqual(loaded.nodes()[1].takeaway, "第一行认识。\n第二行认识。")

    def test_deleted_ids_cannot_be_explicitly_reintroduced(self):
        graph = self.load_fixture()
        graph.remove_edge("relation_001")
        graph.remove_node("paper_002")
        graph.save()
        loaded = Graph.load(self.path)
        with self.assertRaises(ValidationError):
            loaded.add_node("新名称", "新认识。", node_id="paper_002")
        replacement = loaded.add_node("替代论文", "其他认识。")
        with self.assertRaises(ValidationError):
            loaded.add_edge("paper_001", replacement.id, "新关系", edge_id="relation_001")

    def test_single_line_fields_reject_newlines(self):
        graph = self.load_fixture()
        for operation in (
            lambda: graph.update_node("paper_001", alias="两行\n名称"),
            lambda: graph.update_edge("relation_001", relation="两行\n关系"),
        ):
            with self.assertRaises(ValidationError):
                operation()
        self.assertEqual(self.path.read_text(), FIXTURE)

    def test_alias_only_update_preserves_takeaway_source_spelling(self):
        original = FIXTURE.replace("原始要点。", "**保留原文格式** 与 #quot;引号#quot;。")
        graph = self.load_fixture(original)
        graph.update_node("paper_001", alias="新的名称")
        graph.save()
        self.assertEqual(self.path.read_text(), original.replace("**基础方法**", "**新的名称**"))

    def test_takeaway_only_update_preserves_alias_source_spelling(self):
        original = FIXTURE.replace("**基础方法**", "**基础 #quot;名称#quot;**")
        graph = self.load_fixture(original)
        graph.update_node("paper_001", takeaway="新的核心认识。")
        graph.save()
        self.assertEqual(self.path.read_text(), original.replace("原始要点。", "新的核心认识。"))

    def test_raw_comment_markers_in_labels_are_rejected(self):
        for original in (
            FIXTURE.replace("原始要点。", "%% 原文可能被 Mermaid 当作注释。"),
            FIXTURE.replace("沿用基础方法", "关系 %% 原始百分号"),
        ):
            with self.subTest(document=original):
                self.path.write_text(original)
                with self.assertRaises(FormatError):
                    Graph.load(self.path)
                self.assertEqual(self.path.read_text(), original)

    def test_legacy_document_has_no_inferred_original_title(self):
        graph = self.load_fixture()
        self.assertTrue(all(node.name is None for node in graph.nodes()))
        graph.save()
        self.assertEqual(self.path.read_bytes(), FIXTURE.encode("utf-8"))

    def test_original_title_roundtrips_independently_from_alias(self):
        graph = Graph.create(self.path)
        title = '原始标题 "Quoted" \\ path & <tag> `code` %% #quot;: A Study'
        node = graph.add_node("短名称", "核心认识。", name=title)
        self.assertEqual(node.name, title)
        self.assertEqual(node.alias, "短名称")
        graph.save()
        source = self.path.read_text()
        encoded_title = json.dumps(title, ensure_ascii=False).replace("%", r"\u0025")
        record = f"%% paperstream: name {node.id} {encoded_title}"
        self.assertIn(record, source)
        self.assertLess(source.index(record), source.index(f'{node.id}["`'))
        loaded = Graph.load(self.path)
        self.assertEqual(loaded.nodes()[0].name, title)
        self.assert_fields(loaded.nodes()[0], "短名称", "核心认识。")

    def test_adding_title_to_existing_node_preserves_crlf_and_other_source(self):
        original = FIXTURE.replace("\n", "\r\n")
        graph = self.load_fixture(original)
        title = "Complete Original Paper Title"
        updated = graph.update_node("paper_002", name=title)
        self.assertEqual(updated.name, title)
        graph.save()
        record = '    %% paperstream: name paper_002 "Complete Original Paper Title"\r\n'
        expected = original.replace('    paper_002["`', record + '    paper_002["`')
        self.assertEqual(self.path.read_bytes(), expected.encode("utf-8"))
        self.assertEqual(Graph.load(self.path).nodes()[1].name, title)

    def test_updating_title_changes_only_json_value(self):
        old_json = r'"Original \"Quoted\" Title"'
        record = f'\t%% paperstream: name paper_001   {old_json}   \r\n'
        original = FIXTURE.replace("\n", "\r\n").replace(
            '    paper_001["`', record + '    paper_001["`'
        )
        graph = self.load_fixture(original)
        new_title = '新原文标题 "Quoted" \\ Supplement'
        graph.update_node("paper_001", name=new_title)
        graph.save()
        expected = original.replace(old_json, json.dumps(new_title, ensure_ascii=False))
        self.assertEqual(self.path.read_bytes(), expected.encode("utf-8"))
        self.assertEqual(Graph.load(self.path).nodes()[0].name, new_title)

    def test_alias_edit_preserves_existing_title_json_spelling(self):
        record = '    %% paperstream: name paper_001 "\\u4e2d\\u6587 title"\n'
        original = FIXTURE.replace('    paper_001["`', record + '    paper_001["`')
        graph = self.load_fixture(original)
        self.assertEqual(graph.nodes()[0].name, "中文 title")
        graph.update_node("paper_001", alias="修改后的简称")
        graph.save()
        expected = original.replace("**基础方法**", "**修改后的简称**")
        self.assertEqual(self.path.read_text(), expected)

    def test_removing_node_removes_its_title_but_preserves_other_titles(self):
        one = '    %% paperstream: name paper_001 "First Original Title"\n'
        two = '    %% paperstream: name paper_002 "Second Original Title"\n'
        original = FIXTURE.replace('    paper_001["`', one + '    paper_001["`').replace(
            '    paper_002["`', two + '    paper_002["`'
        )
        graph = self.load_fixture(original)
        graph.remove_node("paper_001", cascade=True)
        graph.save()
        source = self.path.read_text()
        self.assertNotIn(one, source)
        self.assertIn(two, source)
        self.assertIn("%% A note belonging to the next paper.", source)
        loaded = Graph.load(self.path)
        self.assertEqual([node.name for node in loaded.nodes()], ["Second Original Title"])

    def test_invalid_title_update_is_transactional(self):
        graph = self.load_fixture()
        before = graph.nodes()
        for name in ("", " \t ", "Two\nLines", "Two\r\nLines", "Null\x00Byte", 12):
            with self.subTest(name=name):
                with self.assertRaises(ValidationError):
                    graph.update_node("paper_001", alias="不应应用", name=name)
                self.assertEqual(graph.nodes(), before)
                self.assertEqual(self.path.read_text(), FIXTURE)
        with self.assertRaises(ValidationError):
            graph.update_node("paper_001", takeaway="", name="Should Not Be Inserted")
        self.assertEqual(graph.nodes(), before)
        graph.save()
        self.assertEqual(self.path.read_text(), FIXTURE)

    def test_invalid_original_title_records_are_not_ignored(self):
        valid = '    %% paperstream: name paper_001 "Title"\n'
        cases = {
            "duplicate record": valid + valid,
            "unknown node": '    %% paperstream: name paper_999 "Title"\n',
            "edge is not a node": '    %% paperstream: name relation_001 "Title"\n',
            "no JSON value": '    %% paperstream: name paper_001\n',
            "non-string JSON": '    %% paperstream: name paper_001 42\n',
            "malformed JSON": '    %% paperstream: name paper_001 "Unclosed\n',
            "trailing garbage": '    %% paperstream: name paper_001 "Title" ignored\n',
            "empty title": '    %% paperstream: name paper_001 ""\n',
            "escaped newline": '    %% paperstream: name paper_001 "Line 1\\nLine 2"\n',
            "invalid escape": r'    %% paperstream: name paper_001 "Bad\q"' + "\n",
        }
        for name, record in cases.items():
            with self.subTest(name=name):
                original = FIXTURE + record
                self.path.write_text(original)
                with self.assertRaises(PaperstreamError):
                    Graph.load(self.path)
                self.assertEqual(self.path.read_text(), original)

    def test_titles_attach_by_id_and_shared_title_text_is_allowed(self):
        title = "Shared Original Title"
        records = (
            f'    %% paperstream: name paper_002 "{title}"\n'
            f'    %% paperstream: name paper_001 "{title}"\n'
        )
        graph = self.load_fixture(FIXTURE + records)
        self.assertEqual([node.name for node in graph.nodes()], [title, title])
        graph.update_node("paper_002", name="Updated Second Title")
        graph.save()
        loaded = Graph.load(self.path)
        self.assertEqual([node.name for node in loaded.nodes()], [title, "Updated Second Title"])

    def test_title_directive_text_is_escaped_and_raw_directive_is_rejected(self):
        title = 'A Study of %%{init: {"theme": "dark"}}%% in Paper Titles'
        graph = Graph.create(self.path)
        graph.add_node("短标题", "这是论文标题的文字内容。", name=title)
        graph.save()
        source = self.path.read_text()
        self.assertNotIn("%%{", source)
        self.assertIn(r"\u0025\u0025{", source)
        self.assertEqual(Graph.load(self.path).nodes()[0].name, title)

        raw_record = f"    %% paperstream: name paper_001 {json.dumps(title, ensure_ascii=False)}\n"
        original = FIXTURE + raw_record
        self.path.write_text(original)
        with self.assertRaises(FormatError):
            Graph.load(self.path)
        self.assertEqual(self.path.read_text(), original)

        ordinary_title = "An Ordinary 100%% Paper Title"
        ordinary_record = f'    %% paperstream: name paper_001 "{ordinary_title}"\n'
        ordinary_source = FIXTURE + ordinary_record
        self.path.write_text(ordinary_source)
        loaded = Graph.load(self.path)
        self.assertEqual(loaded.nodes()[0].name, ordinary_title)
        loaded.save()
        self.assertEqual(self.path.read_text(), ordinary_source)


if __name__ == "__main__":
    unittest.main()
