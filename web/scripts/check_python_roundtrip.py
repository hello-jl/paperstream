"""Exercise the real Python and TypeScript file APIs against one temporary graph."""
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from paperstream import CanvasGraph


def main():
    helper = Path(__file__).with_name("edit-roundtrip-fixture.mjs")
    with TemporaryDirectory(prefix="paperstream-roundtrip-") as directory:
        path = Path(directory) / "papers.canvas"
        with CanvasGraph.create(path) as graph:
            first = graph.add_node("方法 A", "初始认识", node_id="first", name="Original Title", year=2024)
            second = graph.add_node("方法 B", "另一认识", node_id="second")
            graph.add_edge(first.id, second.id, "初始关系", edge_id="connection")
            data = graph.to_dict()
            data["custom"] = {"keep": [1, "中文", None]}
            data["nodes"][0]["customStyle"] = {"shape": "rounded"}
            data["edges"][0]["evidence"] = "Section 3"
            data["nodes"].append({"id": "note", "type": "text", "x": 0, "y": 400,
                                  "width": 200, "height": 100, "text": "# 手工备注"})
            graph.set_document(data)
        subprocess.run(["node", "--experimental-strip-types", str(helper), str(path), "edit"], check=True)
        with CanvasGraph.load(path) as graph:
            first = graph.nodes()[0]
            assert first.alias == "方法 A 修订" and first.name == "Original Title"
            assert first.takeaway == "第一行\n第二行" and first.year is None
            data = graph.to_dict()
            assert data["nodes"][0]["x"] == -120 and data["nodes"][0]["y"] == 250
            assert data["custom"] == {"keep": [1, "中文", None]}
            assert data["nodes"][0]["customStyle"] == {"shape": "rounded"}
            assert data["nodes"][2]["text"] == "# 手工备注"
            assert data["edges"][0]["label"] == "改进后关系"
            assert data["edges"][0]["evidence"] == "Section 3"
            graph.update_node("second", takeaway="由 Python 再次更新")
        subprocess.run(["node", "--experimental-strip-types", str(helper), str(path), "verify"], check=True)
    print("Python → TypeScript → Python → TypeScript round-trip passed.")


if __name__ == "__main__":
    main()
