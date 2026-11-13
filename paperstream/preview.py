"""A loopback-only editor bridge for one explicitly selected Canvas file.

The frontend is one prebuilt HTML file. No route accepts a filesystem path and
all document updates use CanvasGraph's validation and atomic save machinery.
This is a local development interface, not a filesystem isolation boundary for
other processes already able to alter the selected directory.
"""

from __future__ import annotations

import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import secrets
import stat
import threading
from urllib.parse import quote

from .canvas import CanvasGraph
from .document import ConflictError, FormatError, PaperstreamError, ValidationError


MAX_BODY_BYTES = 64 * 1024 * 1024


class PreviewPathError(PaperstreamError):
    """The selected file or a parent directory no longer has its safe shape."""


def _directory_identity(path: Path) -> tuple[int, int]:
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode):
        raise PreviewPathError("The Canvas parent directory was replaced.")
    return info.st_dev, info.st_ino


class PreviewServer(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False

    def __init__(self, path: Path, app: bytes, port: int, token: str, read_only: bool):
        self.canvas_path = path
        self.file_name = path.name
        self.token = token
        self.read_only = read_only
        self.app = app
        self.document_lock = threading.Lock()
        self.parent_identities = {parent: _directory_identity(parent) for parent in path.parents}
        super().__init__(("127.0.0.1", port), PreviewHandler)
        self.origin = f"http://127.0.0.1:{self.server_port}"
        self.url = f"{self.origin}/#token={quote(token, safe='')}"

    def check_path(self) -> None:
        try:
            for parent, identity in self.parent_identities.items():
                if _directory_identity(parent) != identity:
                    raise PreviewPathError("The Canvas parent directory was replaced.")
            if not stat.S_ISREG(self.canvas_path.lstat().st_mode):
                raise PreviewPathError("The Canvas must remain a regular file, not a symlink.")
            if self.canvas_path.resolve(strict=True) != self.canvas_path:
                raise PreviewPathError("The Canvas path no longer points to the selected file.")
        except OSError as exc:
            raise PreviewPathError("The selected Canvas file is no longer available.") from exc

    def load_graph(self) -> CanvasGraph:
        self.check_path()
        graph = CanvasGraph.load(self.canvas_path)
        # CanvasGraph resolves filenames. Do not publish a document read from a
        # symlink that appeared between our initial guard and that load.
        self.check_path()
        if graph.path != self.canvas_path:
            raise PreviewPathError("The Canvas path changed while reading.")
        return graph

    def envelope(self, graph: CanvasGraph) -> dict:
        return {"name": self.file_name, "text": graph.to_json(),
                "etag": f'"{graph.source_revision}"', "writable": not self.read_only}


class PreviewHandler(BaseHTTPRequestHandler):
    server: PreviewServer
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        # Tokens, document titles and contents do not enter access logs.
        pass

    def _respond(self, status: int, data: bytes, content_type: str, *, etag: str | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Connection", "close")
        if etag is not None:
            self.send_header("ETag", etag)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)
        self.close_connection = True

    def _json(self, status: int, value: dict) -> None:
        data = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self._respond(status, data, "application/json; charset=utf-8", etag=value.get("etag"))

    def _error(self, status: int, message: str, *, etag: str | None = None) -> None:
        value = {"error": "PreviewError", "message": message}
        if etag is not None:
            value["etag"] = etag
        self._json(status, value)

    def _guard(self, *, document: bool = False, write: bool = False) -> bool:
        if self.headers.get_all("Host") != [self.server.origin.removeprefix("http://")]:
            self._error(403, "Only the loopback preview host is allowed.")
            return False
        origins = self.headers.get_all("Origin")
        if (origins is not None and origins != [self.server.origin]) or (write and origins is None):
            self._error(403, "The request must come from the preview page.")
            return False
        if document:
            authorization = self.headers.get_all("Authorization")
            expected = f"Bearer {self.server.token}"
            if (authorization is None or len(authorization) != 1
                    or not hmac.compare_digest(authorization[0].encode("utf-8"), expected.encode("utf-8"))):
                self._error(403, "A valid preview token is required.")
                return False
        return True

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        if not self._guard(document=self.path == "/api/canvas"):
            return
        if self.path in ("/", "/index.html"):
            self._respond(200, self.server.app, "text/html; charset=utf-8")
            return
        if self.path != "/api/canvas":
            self._error(404, "Unknown preview route.")
            return
        try:
            with self.server.document_lock:
                self._json(200, self.server.envelope(self.server.load_graph()))
        except PreviewPathError as exc:
            self._error(409, str(exc))
        except (FormatError, ValidationError) as exc:
            self._error(422, str(exc))
        except (PaperstreamError, OSError):
            self._error(500, "The selected Canvas could not be read.")

    def do_PUT(self) -> None:
        if not self._guard(document=True, write=True):
            return
        if self.path != "/api/canvas":
            self._error(404, "Unknown preview route.")
            return
        if self.server.read_only:
            self._error(403, "This preview is read-only.")
            return
        if self.headers.get_all("Transfer-Encoding") is not None:
            self._error(400, "Transfer-Encoding is not supported.")
            return
        lengths = self.headers.get_all("Content-Length")
        if (lengths is None or len(lengths) != 1 or len(lengths[0]) > 20
                or not re.fullmatch(r"[0-9]+", lengths[0])):
            self._error(400, "One valid Content-Length is required.")
            return
        length = int(lengths[0])
        if length > MAX_BODY_BYTES:
            self._error(413, "The Canvas exceeds the preview's 64 MiB limit.")
            return
        content_types = self.headers.get_all("Content-Type")
        if (content_types is None or len(content_types) != 1
                or content_types[0].split(";", 1)[0].strip().lower() != "application/json"):
            self._error(400, "Content-Type must be application/json.")
            return
        versions = self.headers.get_all("If-Match")
        if versions is None:
            self._error(428, "If-Match is required before saving.")
            return
        if len(versions) != 1 or not re.fullmatch(r'"[0-9a-f]{64}"', versions[0]):
            self._error(400, "If-Match must contain one exact Canvas revision.")
            return
        try:
            body = self.rfile.read(length)
            if len(body) != length:
                self._error(400, "The request body was incomplete.")
                return
            text = body.decode("utf-8-sig")
            with self.server.document_lock:
                graph = self.server.load_graph()
                current = f'"{graph.source_revision}"'
                if versions[0] != current:
                    self._error(409, "The Canvas changed; reload before saving.", etag=current)
                    return
                graph.set_json(text)
                self.server.check_path()
                graph.save()
                self.server.check_path()
                self._json(200, self.server.envelope(graph))
        except (UnicodeDecodeError, FormatError, ValidationError) as exc:
            self._error(422, str(exc))
        except ConflictError as exc:
            # A lock or external writer won. Never retry using a new version.
            try:
                with self.server.document_lock:
                    current = f'"{self.server.load_graph().source_revision}"'
            except (PaperstreamError, OSError):
                current = None
            self._error(409, str(exc), etag=current)
        except PreviewPathError as exc:
            self._error(409, str(exc))
        except (PaperstreamError, OSError):
            self._error(500, "The Canvas could not be saved; current edits remain in the editor.")

    def do_POST(self) -> None:
        if self._guard():
            self._error(405, "Only GET, HEAD and PUT are supported.")

    do_DELETE = do_POST
    do_OPTIONS = do_POST
    do_PATCH = do_POST


def create_preview_server(path: str | Path, app_path: str | Path, port: int = 0,
                          token: str | None = None, read_only: bool = False) -> PreviewServer:
    """Prepare a single-document server; the caller owns serve/stop lifecycle."""
    target = Path(path).expanduser().resolve(strict=True)
    if target.suffix.lower() != ".canvas" or not stat.S_ISREG(target.lstat().st_mode):
        raise ValidationError("Preview requires an existing regular .canvas file.")
    app = Path(app_path).expanduser()
    if not app.is_file():
        raise PaperstreamError("The preview bundle is missing; build the local frontend first.")
    if token is None:
        token = secrets.token_urlsafe(32)
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{24,}", token):
        raise ValidationError("The preview token must contain at least 24 URL-safe characters.")
    server = PreviewServer(target, app.read_bytes(), port, token, read_only)
    try:
        server.load_graph()
    except BaseException:
        server.server_close()
        raise
    return server
