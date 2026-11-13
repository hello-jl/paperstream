#!/usr/bin/env python3
"""Run the packaged document CLI without installing Python packages globally."""

from pathlib import Path
import json
import os
import sys


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    if not (root / "paperstream" / "__main__.py").is_file():
        print(
            "The self-contained Paperstream plugin is not built. "
            "Build it and run dist/plugin/scripts/paperstream.py instead.",
            file=sys.stderr,
        )
        return 1
    # Plugin caches may be read-only. CLI use must not generate files there.
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root))
    if len(sys.argv) > 1 and sys.argv[1] == "serve" and not os.environ.get("PAPERSTREAM_APP_PATH"):
        print(json.dumps({
            "ok": False,
            "error": "ValidationError",
            "message": "This package contains the native host editor, not a browser HTTP editor. "
                       "Use the Claude/browser package for serve, or explicitly set PAPERSTREAM_APP_PATH "
                       "to its compatible HTTP editor bundle.",
        }), file=sys.stderr)
        return 1
    from paperstream.__main__ import main as run

    return run()


if __name__ == "__main__":
    raise SystemExit(main())
