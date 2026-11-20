"""Single-file preview HTTP boundaries and disk-integrity regression checks."""

from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
import hashlib
from http.client import HTTPConnection
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from paperstream import CanvasGraph, PaperstreamError, ValidationError
from paperstream.preview import MAX_BODY_BYTES, create_preview_server


class PreviewTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.directory = self.root / "selected"
        self.directory.mkdir()
        self.path = self.directory / "论文.canvas"
        graph = CanvasGraph.create(self.path)
        first = graph.add_node("Alpha", "First takeaway", node_id="alpha")
        second = graph.add_node("Beta", "Second takeaway", node_id="beta")
        graph.add_edge(first.id, second.id, "Builds on", edge_id="relation")
        self.original = graph.to_dict()
        self.original["future"] = {"nested": [None, True, "retained"]}
        self.original["nodes"].insert(0, {"id": "group", "type": "group", "label": "Keep me",
                                           "x": -50, "y": -50, "width": 900, "height": 900})
        self.original["nodes"][1]["futureNode"] = {"x": [1, 2]}
        graph.set_document(self.original)
        graph.save()
        self.before = self.path.read_bytes()
        self.app = self.root / "app.html"
        self.app.write_text("<!doctype html><title>Paperstream test</title>", encoding="utf-8")
        self.server = self.start_server()

    def start_server(self, *, read_only=False):
        server = create_preview_server(self.path, self.app, read_only=read_only)
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        thread.start()

        def close():
            server.shutdown()
            server.server_close()
            thread.join(2)

        self.addCleanup(close)
        return server

    def request(self, method="GET", route="/api/canvas", *, body=None, headers=None, server=None):
        server = server or self.server
        values = {"Authorization": f"Bearer {server.token}"}
        if method == "PUT":
            values.update({"Origin": server.origin, "Content-Type": "application/json",
                           "If-Match": (headers or {}).get("If-Match", f'"{hashlib.sha256(self.before).hexdigest()}"')})
        values.update(headers or {})
        values = {key: value for key, value in values.items() if value is not None}
        if body is not None and not isinstance(body, bytes):
            body = body.encode("utf-8")
        connection = HTTPConnection("127.0.0.1", server.server_port, timeout=3)
        try:
            connection.request(method, route, body=body, headers=values)
            response = connection.getresponse()
            data = response.read()
            return response.status, dict(response.getheaders()), data
        finally:
            connection.close()

    def get_envelope(self):
        status, headers, body = self.request()
        self.assertEqual(status, 200, body)
        return json.loads(body), headers

    def update(self):
        changed = deepcopy(self.original)
        changed["edges"][0]["label"] = "Revised relation"
        return json.dumps(changed, ensure_ascii=False)

    def test_loopback_binding_and_static_routes_expose_only_fixed_bundle(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")
        self.assertEqual(self.server.file_name, "论文.canvas")
        self.assertIn("/#token=", self.server.url)
        for route in ("/", "/index.html"):
            status, headers, body = self.request(route=route, headers={"Authorization": None})
            self.assertEqual(status, 200)
            self.assertEqual(body, self.app.read_bytes())
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        status, headers, body = self.request("HEAD", "/")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertEqual(int(headers["Content-Length"]), self.app.stat().st_size)
        for route in ("/../selected/private.canvas", "/%2e%2e/selected", "/api/canvas?path=elsewhere", "/app.html", "/favicon.ico"):
            with self.subTest(route=route):
                self.assertEqual(self.request(route=route)[0], 404)

    def test_get_has_exact_loaded_revision_and_preserves_unknown_document_data(self):
        envelope, headers = self.get_envelope()
        expected = f'"{hashlib.sha256(self.before).hexdigest()}"'
        self.assertEqual(envelope["etag"], expected)
        self.assertEqual(headers["ETag"], expected)
        self.assertEqual(envelope["name"], "论文.canvas")
        self.assertTrue(envelope["writable"])
        self.assertEqual(json.loads(envelope["text"]), self.original)
        self.assertEqual(self.path.read_bytes(), self.before)

    def test_token_host_and_origin_checks_do_not_allow_cross_origin_access(self):
        cases = ({"Authorization": None}, {"Authorization": "Bearer wrong"},
                 {"Host": "localhost:" + str(self.server.server_port)},
                 {"Origin": "https://other.example"}, {"Origin": "null"})
        for headers in cases:
            with self.subTest(headers=headers):
                status, response_headers, _ = self.request(headers=headers)
                self.assertEqual(status, 403)
                self.assertNotIn("Access-Control-Allow-Origin", response_headers)
        for headers in ({"Origin": None}, {"Origin": "https://other.example"}, {"Authorization": None}):
            self.assertEqual(self.request("PUT", body=self.update(), headers=headers)[0], 403)
        self.assertEqual(self.path.read_bytes(), self.before)

    def test_put_preserves_unknown_fields_order_and_advances_disk_revision(self):
        envelope, _ = self.get_envelope()
        status, headers, body = self.request("PUT", body=self.update(), headers={"If-Match": envelope["etag"]})
        self.assertEqual(status, 200, body)
        saved = json.loads(body)
        self.assertNotEqual(saved["etag"], envelope["etag"])
        self.assertEqual(saved["etag"], f'"{hashlib.sha256(self.path.read_bytes()).hexdigest()}"')
        actual = CanvasGraph.load(self.path).to_dict()
        expected = deepcopy(self.original)
        expected["edges"][0]["label"] = "Revised relation"
        self.assertEqual(actual, expected)
        self.assertEqual(json.loads(saved["text"]), expected)
        # Re-saving this same document does not rewrite or re-version the file.
        before = self.path.read_bytes()
        status, _, body = self.request("PUT", body=saved["text"], headers={"If-Match": saved["etag"]})
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body)["etag"], saved["etag"])
        self.assertEqual(self.path.read_bytes(), before)

    def test_external_update_rejects_old_revision_repeatedly_without_overwrite(self):
        envelope, _ = self.get_envelope()
        external = CanvasGraph.load(self.path)
        external.update_node("alpha", takeaway="New external content")
        external.save()
        external_bytes = self.path.read_bytes()
        for _ in range(2):
            status, _, body = self.request("PUT", body=self.update(), headers={"If-Match": envelope["etag"]})
            self.assertEqual(status, 409, body)
            self.assertEqual(json.loads(body)["etag"], f'"{external.source_revision}"')
            self.assertEqual(self.path.read_bytes(), external_bytes)

    def test_update_between_bridge_load_and_save_is_not_retried(self):
        envelope, _ = self.get_envelope()
        original_save = CanvasGraph.save
        external_bytes = []

        def competing_save(graph):
            external = CanvasGraph.load(self.path)
            external.update_node("alpha", takeaway="Writer arrived during save")
            original_save(external)
            external_bytes.append(self.path.read_bytes())
            original_save(graph)

        with patch.object(CanvasGraph, "save", competing_save):
            status, _, body = self.request("PUT", body=self.update(), headers={"If-Match": envelope["etag"]})
        self.assertEqual(status, 409, body)
        self.assertEqual(len(external_bytes), 1)
        self.assertEqual(self.path.read_bytes(), external_bytes[0])

    def test_two_browser_writers_cannot_both_save_the_same_revision(self):
        envelope, _ = self.get_envelope()
        barrier = threading.Barrier(2)

        def save():
            barrier.wait(timeout=3)
            return self.request("PUT", body=self.update(), headers={"If-Match": envelope["etag"]})

        with ThreadPoolExecutor(max_workers=2) as writers:
            results = list(writers.map(lambda _: save(), range(2)))
        self.assertEqual(sorted(result[0] for result in results), [200, 409])
        accepted = next(json.loads(result[2]) for result in results if result[0] == 200)
        conflict = next(json.loads(result[2]) for result in results if result[0] == 409)
        self.assertEqual(conflict["etag"], accepted["etag"])
        self.assertEqual(CanvasGraph.load(self.path).to_dict()["edges"][0]["label"], "Revised relation")

    def test_bad_json_geometry_and_utf8_do_not_touch_original_file(self):
        invalid = ('{"nodes":[],"nodes":[]}', '{"number":NaN}', '{bad',
                   '{"nodes":[{"id":"bad","type":"text","text":"x","x":0,"y":0,"width":0,"height":20}]}',
                   b"\xff")
        for body in invalid:
            with self.subTest(body=body):
                status, _, response = self.request("PUT", body=body)
                self.assertEqual(status, 422, response)
                self.assertEqual(self.path.read_bytes(), self.before)

    def test_required_write_headers_and_size_limits_fail_before_any_write(self):
        cases = (({"If-Match": None}, 428), ({"If-Match": "*"}, 400),
                 ({"Content-Type": "text/plain"}, 400),
                 ({"Transfer-Encoding": "chunked"}, 400),
                 ({"Content-Length": str(MAX_BODY_BYTES + 1)}, 413),
                 ({"Content-Length": "-1"}, 400))
        for headers, expected in cases:
            with self.subTest(headers=headers):
                status, _, body = self.request("PUT", body=b"{}", headers=headers)
                self.assertEqual(status, expected, body)
                self.assertEqual(self.path.read_bytes(), self.before)

    def test_missing_and_ambiguous_headers_are_rejected_without_waiting_for_a_body(self):
        common = [("Host", self.server.origin.removeprefix("http://")),
                  ("Authorization", f"Bearer {self.server.token}"),
                  ("Origin", self.server.origin), ("Content-Type", "application/json"),
                  ("If-Match", f'"{hashlib.sha256(self.before).hexdigest()}"')]
        cases = (([], 400), ([("Content-Length", "0"), ("Content-Length", "0")], 400),
                 ([("Content-Length", "0"), ("Host", "other.example")], 403),
                 ([("Content-Length", "0"), ("Origin", self.server.origin)], 403),
                 ([("Content-Length", "0"), ("Authorization", f"Bearer {self.server.token}")], 403))
        for additions, expected in cases:
            with self.subTest(additions=additions):
                connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
                try:
                    connection.putrequest("PUT", "/api/canvas", skip_host=True, skip_accept_encoding=True)
                    for key, value in common + additions:
                        connection.putheader(key, value)
                    connection.endheaders()
                    response = connection.getresponse()
                    body = response.read()
                    self.assertEqual(response.status, expected, body)
                finally:
                    connection.close()
        self.assertEqual(self.path.read_bytes(), self.before)

    def test_read_only_server_and_unsupported_methods_cannot_modify_document(self):
        read_only = self.start_server(read_only=True)
        status, _, body = self.request(server=read_only)
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["writable"])
        self.assertEqual(self.request("PUT", body=self.update(), server=read_only)[0], 403)
        for method in ("POST", "DELETE", "PATCH", "OPTIONS"):
            self.assertEqual(self.request(method, body=b"{}")[0], 405)
        self.assertEqual(self.path.read_bytes(), self.before)

    def test_atomic_save_failure_keeps_original_and_cleans_only_owned_lock(self):
        with patch("paperstream.canvas.os.replace", side_effect=OSError("injected replace failure")):
            status, _, body = self.request("PUT", body=self.update())
        self.assertEqual(status, 500, body)
        self.assertEqual(self.path.read_bytes(), self.before)
        lock = self.path.with_name(f".{self.path.name}.paperstream.lock")
        self.assertFalse(lock.exists())
        self.assertEqual(list(self.directory.glob("*.tmp")), [])
        lock.write_text("other writer", encoding="utf-8")
        status, _, body = self.request("PUT", body=self.update())
        self.assertEqual(status, 409, body)
        self.assertEqual(lock.read_text(), "other writer")
        self.assertEqual(self.path.read_bytes(), self.before)

    def test_new_symlink_is_rejected_without_revealing_or_changing_other_canvas(self):
        other = self.root / "other.canvas"
        with CanvasGraph.create(other) as graph:
            graph.add_node("Private outside selection", "Do not expose")
        other_bytes = other.read_bytes()
        self.path.unlink()
        self.path.symlink_to(other)
        status, _, body = self.request()
        self.assertEqual(status, 409)
        self.assertNotIn(b"Private outside", body)
        # Supply the known old version rather than reading through our test helper.
        status, _, body = self.request("PUT", body=self.update(), headers={"If-Match": f'"{hashlib.sha256(self.before).hexdigest()}"'})
        self.assertEqual(status, 409, body)
        self.assertEqual(other.read_bytes(), other_bytes)

    def test_symlink_appearing_during_load_is_not_published(self):
        other = self.root / "other.canvas"
        with CanvasGraph.create(other) as graph:
            graph.add_node("Private content during race", "Do not expose")
        other_bytes = other.read_bytes()
        original_load = CanvasGraph.load

        def redirected_load(path):
            self.path.unlink()
            self.path.symlink_to(other)
            return original_load(path)

        with patch.object(CanvasGraph, "load", redirected_load):
            status, _, body = self.request()
        self.assertEqual(status, 409)
        self.assertNotIn(b"Private content", body)
        self.assertEqual(other.read_bytes(), other_bytes)

    def test_replaced_parent_directory_is_rejected(self):
        original_directory = self.root / "moved"
        self.directory.rename(original_directory)
        self.directory.mkdir()
        with CanvasGraph.from_dict(self.path, self.original) as graph:
            graph.update_node("alpha", alias="Replacement directory secret")
        replacement_bytes = self.path.read_bytes()
        status, _, body = self.request()
        self.assertEqual(status, 409)
        self.assertNotIn(b"Replacement directory secret", body)
        self.assertEqual(self.request("PUT", body=self.update())[0], 409)
        self.assertEqual(self.path.read_bytes(), replacement_bytes)
        self.assertEqual((original_directory / self.path.name).read_bytes(), self.before)

    def test_missing_bundle_invalid_file_and_weak_explicit_token_fail_at_startup(self):
        with self.assertRaises(PaperstreamError):
            create_preview_server(self.path, self.root / "missing.html")
        with self.assertRaises(ValidationError):
            create_preview_server(self.app, self.app)
        with self.assertRaises(ValidationError):
            create_preview_server(self.path, self.app, token="guessable")
        with self.assertRaises(FileNotFoundError):
            create_preview_server(self.root / "missing.canvas", self.app)

    def test_resolve_preview_app_priority_and_explicit_override(self):
        import io
        import os
        from contextlib import redirect_stderr
        from paperstream.__main__ import main as cli_main, resolve_preview_app

        repo = self.root / "repo"
        serve_app = repo / "dist" / "serve" / "app.html"
        claude_app = repo / "claude" / "dist" / "app.html"
        data_dir = self.root / "data_dir"
        data_app = data_dir / "app.html"
        xdg_dir = self.root / "xdg_data"
        xdg_app = xdg_dir / "paperstream" / "app.html"

        for path in (serve_app, claude_app, data_app, xdg_app):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("<html></html>", encoding="utf-8")

        clean_env = {k: v for k, v in os.environ.items()
                     if k not in ("PAPERSTREAM_APP_PATH", "PAPERSTREAM_DATA_DIR", "XDG_DATA_HOME")}

        with patch.dict(os.environ, {**clean_env, "PAPERSTREAM_APP_PATH": str(self.root / "missing.html")}, clear=True):
            self.assertEqual(resolve_preview_app(repo), self.root / "missing.html")

        with patch.dict(os.environ, {**clean_env, "PAPERSTREAM_DATA_DIR": str(data_dir)}, clear=True):
            self.assertEqual(resolve_preview_app(repo), serve_app)
            serve_app.unlink()
            self.assertEqual(resolve_preview_app(repo), claude_app)
            claude_app.unlink()
            self.assertEqual(resolve_preview_app(repo), data_app)
            data_app.unlink()
            self.assertEqual(resolve_preview_app(repo), serve_app)

        with patch.dict(os.environ, {**clean_env, "XDG_DATA_HOME": str(xdg_dir)}, clear=True):
            self.assertEqual(resolve_preview_app(repo), xdg_app)

        err = io.StringIO()
        with patch.dict(os.environ, {**clean_env, "PAPERSTREAM_APP_PATH": str(self.root / "absent.html")}, clear=True):
            with redirect_stderr(err):
                code = cli_main(["serve", str(self.path)])
        self.assertEqual(code, 1)
        payload = json.loads(err.getvalue())
        self.assertEqual(payload["error"], "ValidationError")
        self.assertIn("Browser editor not built", payload["message"])


if __name__ == "__main__":
    unittest.main()
