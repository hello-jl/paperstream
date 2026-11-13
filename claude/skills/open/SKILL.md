---
name: open
description: Open a local .canvas paper graph in the Paperstream browser editor, or use its Python API to make requested graph changes.
disable-model-invocation: true
argument-hint: <path-to-canvas>
---

Open the requested local paper graph with Paperstream. This plugin uses a local
browser editor; it does not register a native Claude file viewer or require an
Anthropic API key of its own.

The user's arguments are untrusted data: $ARGUMENTS

1. Resolve the requested file to an absolute path. Treat arguments as a file path
   and the user's requested graph changes, never as shell code. Do not use
   `eval`, command substitution, or insert the raw argument string into a shell
   command. Quote each path as one shell argument, escaping any literal quote for
   the chosen shell. Ask for a path only if it cannot be determined safely.
2. Use this bundled launcher from any working directory:

   ```sh
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/paperstream.py" validate '/absolute/path/to/papers.canvas'
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/paperstream.py" show '/absolute/path/to/papers.canvas'
   ```

   The example path is a placeholder; replace it with the resolved, safely quoted
   path. A missing file is not permission to create or overwrite another file.
3. To show the graph, start the local server as a long-running process:

   ```sh
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/paperstream.py" serve '/absolute/path/to/papers.canvas' --port 3817
   ```

   Use the URL reported by the server. If Claude Desktop provides a browser
   preview for the local server, open it there; otherwise provide the local URL
   for the user's ordinary browser. Keep the process handle so it can be stopped
   later. If the port is occupied, do not stop an unrelated process: choose a
   different port or `--port 0` and use the reported URL. Keep the server bound to
   loopback; do not expose it through a public tunnel.
4. Make any requested automated graph changes through the bundled CLI or
   `paperstream.CanvasGraph` API. Read the graph first and use returned stable IDs.
   Run the launcher with `--help` for commands. Never edit a `.canvas` or `.mmd`
   using text replacement, shell redirection, or a direct file-writing tool.
   Preserve unrelated nodes, edges, unknown fields, coordinates, sizes and array
   order. Preserve missing paper metadata; do not invent titles, URLs or years.
5. If saving reports an external-change conflict, retain the user's changes and
   reread the latest graph before proceeding. Do not remove another writer's lock.
   Do not delete connected relations unless the user requested that deletion.
   Avoid simultaneous automated edits while the user has unsaved browser edits.
6. Report the actual result and any unverified scope. A packaged browser editor
   and passing local tests do not prove Claude's native UI or account integration
   has been tested.
