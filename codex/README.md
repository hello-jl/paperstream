# Paperstream for ChatGPT desktop / Codex

Local MCP Apps file editor for `.canvas` files. The desktop host provides the
opened resource, read/write permissions, version tokens and update notifications.
The plugin reuses the project's React Flow editor, with React, CSS and all browser
code bundled into one HTML resource. No API key, OpenAI API call, Vite server or
HTTP server is required for the file-editor UI. Node 22.18+ is required for the
stdio server. The bundled agent Skill and Python CLI additionally require
Python 3.10+; they do not call a model API.

## Build and check

From the repository root:

```sh
npm ci --prefix web
npm ci --prefix codex
npm --prefix codex run typecheck
npm --prefix codex run build
npm --prefix codex test
```

The installable package is `codex/dist/plugin/`; it has no `node_modules`
dependency. `codex/.agents/plugins/marketplace.json` points to that package.
`package-lock.json` pins the dependencies. The Zod override selects the patched
4.6.6 release because MCP Extensions 0.2.1 pins an older vulnerable version.

The package also carries `skills/paperstream/`, its API reference, and
`scripts/paperstream.py` with the standard-library Python implementation. An
agent can use the installed launcher from another working directory to read or
edit a known local file. The MCP server itself exposes the file-editor UI, not
general-purpose graph CRUD tools. Default `serve` is rejected here because this
package's HTML requires the native host; use the separate browser adapter for
HTTP editing. Third-party notices and license texts are included in the package.

## Local installation

```sh
codex plugin marketplace add /absolute/path/to/dsh-paperstream/codex
codex plugin add paperstream@paperstream-local
codex plugin marketplace list
```

Restart ChatGPT desktop after installing or updating the plugin, then open an
existing `.canvas` file in the conversation's file panel. Use a new chat if the
existing chat has not picked up the plugin. Local installation and protocol
tests do not themselves prove the desktop UI works; test in the target desktop
version. The supported surface is the file editor, not a terminal canvas or an
ordinary chatgpt.com browser conversation.

OpenAI's current [desktop product guide](https://learn.chatgpt.com/docs/use-chatgpt#compare-work-mode-and-codex-on-desktop)
describes Chat, Work and Codex as desktop entry points sharing the
[plugin system](https://learn.chatgpt.com/docs/plugins). This package targets the
desktop **file editor** extension in a session that exposes `openai/resource`.
An app name or bundle ID alone does not establish that capability. It is not an
`@paperstream` chat tool, and no separate browser is required for the packaged UI.
Cloud sessions and standard remote MCP apps are not covered by this local stdio
adapter; changing transport alone does not provide host file access.

Native acceptance on 2026-11-13 used a separate test copy in the local Codex
desktop conversation. Editing, undo/redo, saving through the host and reading
back from disk passed. Clean external updates appeared automatically. With an
unsaved edit, two consecutive saves refused a newer disk version and retained
the local draft; the external file's SHA-256 stayed unchanged. This covers that
tested desktop session, not every Chat/Work entry point or platform version.

For native acceptance, open `examples/resnet.canvas` in the conversation's right
file panel after restarting. Confirm that it shows the graph rather than JSON,
edit a label, undo to the clean original, then save a separate test copy and
check external-update/conflict behavior. A CLI installation record, an open-file
request, or the browser harness is not evidence that the native graph rendered.
Local personal testing follows the marketplace installation above; the
[approved-partner requirement](https://developers.openai.com/plugins/deploy/desktop-only)
concerns public distribution of local MCP plugins.

## Save and update behavior

The URI is opaque and never interpreted as a local path. Save is enabled only
when the host explicitly reports `writable: true` and provides a nonempty `etag`.
Every save includes `ifMatch`. A conflict keeps the unsaved graph and old version
token; repeated Save cannot silently replace the newer file. Clean external
updates reload automatically; dirty graphs remain open with a notice. Reloading
a dirty graph requires explicit discard, and reload is blocked during a save.
Edits made after a reload begins are retained instead of being discarded by its
late response. Missing version metadata on a later read revokes writing even
when local edits retain an older baseline. File subscriptions are changed in
order so reopening a file cannot lose its external-update notifications.
File read/parse errors, write failures and host size limits retain the editor's
current document. There is no automatic browser draft recovery for host files.

Linked local attachments require a separate host-relative resource adapter and
are not provided by this first file adapter. HTTP images are subject to the host
CSP; the plugin requests no external resource or connection domains. The source
data is retained when such images cannot be displayed. External paper links use
the host's open-link API.

## Browser integration harness

```sh
npm --prefix codex run preview
```

Open `http://127.0.0.1:4318`. This development-only test host runs the real bundled
app and official `AppBridge` protocol in an iframe. It simulates an opaque host
resource **in memory**, exposes read-only, conflict and external-update controls,
and never changes the example file. Use it for interaction checks; it is not a
ChatGPT desktop substitute and is excluded from the packaged plugin.

`Pause next read` and `Pause next write` hold one operation until
`Release pending operation` is clicked. Use a clean document to start a delayed
reload, edit before releasing it, and check that the new text remains. During a
delayed save, inline inputs should become read-only and the details controls should
block document edits; both should become editable again after release.

The design and desktop validation record live in
[`docs/mechanisms/paperstream-design.md`](../docs/mechanisms/paperstream-design.md).
The harness displays `resizeWarnings` for browser ResizeObserver loop events;
it counts rather than suppresses them. A nonzero count is diagnostic evidence,
not by itself evidence of a blank canvas or a failed save.
The integration follows OpenAI's
[file editor extensions](https://developers.openai.com/plugins/build/extensions)
and [local plugin packaging](https://developers.openai.com/plugins/build/plugins).
