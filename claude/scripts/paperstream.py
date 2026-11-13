#!/usr/bin/env python3
"""Run the packaged paperstream CLI independently of the source checkout."""

from pathlib import Path
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
    # Installed plugin caches may be read-only. Nothing generated belongs here.
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root))
    os.environ.setdefault("PAPERSTREAM_APP_PATH", str(root / "app" / "app.html"))
    from paperstream.__main__ import main as run

    return run()


if __name__ == "__main__":
    raise SystemExit(main())
