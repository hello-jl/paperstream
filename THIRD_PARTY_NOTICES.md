# Third-party notices

Paperstream bundles third-party software in its browser editor and host adapters.
Paperstream's original code and documentation are licensed under the
[MIT License](LICENSE), Copyright (c) 2026 Paperstream contributors.
The original Web/DSH/Claude/Codex inventory records locked versions checked on
2026-11-13; the standard MCP adapter was checked on 2026-11-17. This inventory is
separate from that license and does not change any upstream license.
The original license files, including copyright statements, are preserved under
[`licenses/third-party/`](licenses/third-party/).

The table was checked against esbuild output inputs with `bytesInOutput > 0`
and the `web/package-lock.json`, `codex/package-lock.json`, and
`mcp/package-lock.json` lockfiles, including CSS. `Web` is the
standalone editor, `DSH` the browser bundle, `Claude` the portable browser app,
and `Codex UI` / `Codex server` the two parts of the local file-editor plugin.
`MCP UI` / `MCP server` are the two bundles of the separate standard MCP Apps
adapter. Its artifact membership was measured from
`mcp/dist/bundle-inputs.json`; installed packages that contribute no output,
including its unused React 19 peer dependency, are not included. The MCP UI
bundles React 18 from the shared editor's locked dependencies.
React, React DOM, and their scheduler are provided by DSH and are not bundled in
its client. Node.js and Python are required runtimes, not included distributions.
Build and test dependencies that are absent from runtime output are not listed.

| Package | Version | Declared license | Bundled in | Preserved license |
| --- | --- | --- | --- | --- |
| [@cfworker/json-schema](https://github.com/cfworker/cfworker) | 4.1.6 | MIT | Codex server | [Text](licenses/third-party/cfworker-json-schema-4.1.6-LICENSE.txt) |
| [@modelcontextprotocol/core](https://github.com/modelcontextprotocol/typescript-sdk) | 2.4.0 | Apache-2.0; see transition notice | Codex server | [Text](licenses/third-party/modelcontextprotocol-core-2.4.0-LICENSE.txt) |
| [@modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps) | 1.7.5 | MIT; see transition notice | Codex UI, MCP UI, MCP server | [Text](licenses/third-party/modelcontextprotocol-ext-apps-1.7.5-LICENSE.txt) |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | 1.29.0 | MIT | MCP UI, MCP server | [Text](licenses/third-party/modelcontextprotocol-sdk-1.29.0-LICENSE.txt) |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | 1.32.2 | MIT | Codex UI | [Text](licenses/third-party/modelcontextprotocol-sdk-1.32.2-LICENSE.txt) |
| [@modelcontextprotocol/server](https://github.com/modelcontextprotocol/typescript-sdk) | 2.4.0 | Apache-2.0; see transition notice | Codex server | [Text](licenses/third-party/modelcontextprotocol-server-2.4.0-LICENSE.txt) |
| [@openai/mcp-extensions](https://github.com/openai/mcp-extensions) | 0.2.1 | Apache-2.0 | Codex UI, Codex server | [Text](licenses/third-party/openai-mcp-extensions-0.2.1-LICENSE.txt) |
| [@xyflow/react](https://github.com/xyflow/xyflow) | 12.12.1 | MIT | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/xyflow-react-12.12.1-LICENSE.txt) |
| [@xyflow/system](https://github.com/xyflow/xyflow) | 0.0.84 | MIT | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/xyflow-system-0.0.84-LICENSE.txt) |
| [ajv](https://github.com/ajv-validator/ajv) | 8.20.0 | MIT | MCP server | [Text](licenses/third-party/ajv-8.20.0-LICENSE.txt) |
| [ajv-formats](https://github.com/ajv-validator/ajv-formats) | 3.0.1 | MIT | MCP server | [Text](licenses/third-party/ajv-formats-3.0.1-LICENSE.txt) |
| [classcat](https://github.com/jorgebucaran/classcat) | 5.0.5 | MIT | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/classcat-5.0.5-LICENSE.txt) |
| [d3-color](https://github.com/d3/d3-color) | 3.1.1 | ISC | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/d3-color-3.1.1-LICENSE.txt) |
| [d3-dispatch](https://github.com/d3/d3-dispatch) | 3.0.2 | ISC | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/d3-dispatch-3.0.2-LICENSE.txt) |
| [d3-drag](https://github.com/d3/d3-drag) | 3.0.1 | ISC | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/d3-drag-3.0.1-LICENSE.txt) |
| [d3-ease](https://github.com/d3/d3-ease) | 3.0.2 | BSD-3-Clause | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/d3-ease-3.0.2-LICENSE.txt) |
| [d3-interpolate](https://github.com/d3/d3-interpolate) | 3.0.2 | ISC | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/d3-interpolate-3.0.2-LICENSE.txt) |
| [d3-selection](https://github.com/d3/d3-selection) | 3.0.1 | ISC | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/d3-selection-3.0.1-LICENSE.txt) |
| [d3-timer](https://github.com/d3/d3-timer) | 3.0.2 | ISC | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/d3-timer-3.0.2-LICENSE.txt) |
| [d3-transition](https://github.com/d3/d3-transition) | 3.0.2 | ISC | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/d3-transition-3.0.2-LICENSE.txt) |
| [d3-zoom](https://github.com/d3/d3-zoom) | 3.0.1 | ISC | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/d3-zoom-3.0.1-LICENSE.txt) |
| [elkjs](https://github.com/kieler/elkjs) | 0.12.1 | EPL-2.0 OR GPL-3.0-or-later | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/elkjs-0.12.1-LICENSE.txt) |
| [fast-deep-equal](https://github.com/epoberezkin/fast-deep-equal) | 3.1.3 | MIT | MCP server | [Text](licenses/third-party/fast-deep-equal-3.1.3-LICENSE.txt) |
| [fast-uri](https://github.com/fastify/fast-uri) | 3.1.9 | BSD-3-Clause | MCP server | [Text](licenses/third-party/fast-uri-3.1.9-LICENSE.txt) |
| [json-schema-traverse](https://github.com/epoberezkin/json-schema-traverse) | 1.0.0 | MIT | MCP server | [Text](licenses/third-party/json-schema-traverse-1.0.0-LICENSE.txt) |
| [react](https://github.com/facebook/react) | 18.3.1 | MIT | Web, Claude, Codex UI, MCP UI | [Text](licenses/third-party/react-18.3.1-LICENSE.txt) |
| [react-dom](https://github.com/facebook/react) | 18.3.1 | MIT | Web, Claude, Codex UI, MCP UI | [Text](licenses/third-party/react-dom-18.3.1-LICENSE.txt) |
| [scheduler](https://github.com/facebook/react) | 0.23.2 | MIT | Web, Claude, Codex UI, MCP UI | [Text](licenses/third-party/scheduler-0.23.2-LICENSE.txt) |
| [use-sync-external-store](https://github.com/react/react) | 1.7.0 | MIT | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/use-sync-external-store-1.7.0-LICENSE.txt) |
| [zod](https://github.com/colinhacks/zod) | 4.6.6 | MIT | Codex UI, Codex server, MCP UI, MCP server | [Text](licenses/third-party/zod-4.6.6-LICENSE.txt) |
| [zod-to-json-schema](https://github.com/StefanTerdell/zod-to-json-schema) | 3.25.2 | ISC | Codex UI, MCP UI, MCP server | [Text](licenses/third-party/zod-to-json-schema-3.25.2-LICENSE.txt) |
| [zustand](https://github.com/pmndrs/zustand) | 4.5.7 | MIT | Web, DSH, Claude, Codex UI, MCP UI | [Text](licenses/third-party/zustand-4.5.7-LICENSE.txt) |

## Upstream notices that need particular care

- `elkjs` declares `EPL-2.0 OR GPL-3.0-or-later`; it must not be described as MIT.
  Its original EPL-2.0 text is included. The published 0.12.1 package identifies
  source revision [`624ae90aa37110033a8af59c5ccbb292708b4317`](https://github.com/kieler/elkjs/tree/624ae90aa37110033a8af59c5ccbb292708b4317).
  Its generated bundle includes the ELK worker and browser wrapper; source and
  build inputs are described in that revision's [`build.gradle`](https://github.com/kieler/elkjs/blob/624ae90aa37110033a8af59c5ccbb292708b4317/build.gradle)
  and [`package.json`](https://github.com/kieler/elkjs/blob/624ae90aa37110033a8af59c5ccbb292708b4317/package.json).
  Paperstream imports the published bundle without editing its source; bundling
  and minification are performed by its build tools. The original source notice
  is also preserved in [`elkjs-0.12.1-SOURCE_NOTICE.txt`](licenses/third-party/elkjs-0.12.1-SOURCE_NOTICE.txt).
  The package inventory is not an independent audit of every component inside
  that upstream generated bundle.
- `@modelcontextprotocol/ext-apps` declares MIT in package metadata, while its
  supplied LICENSE describes the MCP project's transition from MIT to
  Apache-2.0 and retains both texts plus its documentation statement. The
  `core` and `server` packages declare Apache-2.0 and contain that transition
  statement too. Each supplied file is retained in full rather than simplified.
  Paperstream does not distribute their documentation sites.
- `@cfworker/json-schema` 4.1.6 declares MIT but its npm package omits a LICENSE
  file. The license and [upstream third-party notices](licenses/third-party/cfworker-json-schema-4.1.6-THIRD_PARTY_NOTICES.md)
  were retrieved from the exact npm `gitHead`,
  [`1a0aa37471850c28a4673e12e871e010ea6c26e0`](https://github.com/cfworker/cfworker/tree/1a0aa37471850c28a4673e12e871e010ea6c26e0).
  Those notices identify code derived from punycode.js and ajv; preserving them
  does not claim that complete separate installations of either package ship.

## Distribution and maintenance

Include this file and the entire `licenses/third-party/` directory alongside
released Web, DSH, Codex, Claude, and standard MCP artifacts. Also include
Paperstream's own MIT LICENSE. Keep the build's existing
legal comments; comments alone are not a substitute for these license files.
This document records upstream declarations and provenance, not a legal
compatibility opinion or a blanket compliance certification.

[`inventory.json`](licenses/third-party/inventory.json) records exact versions,
artifact membership, copied-file SHA-256 values, and provenance. When lockfiles,
entry points, or bundling rules change, regenerate and review this inventory
before distributing updated artifacts. Dependency package metadata and license
files, rather than a global assumed license, remain the source of truth.

## Illustrations and historical portraits

The MIT license for Paperstream's original code and documentation does not
replace the separate licenses of third-party images or grant rights to community
character designs, brand marks, or the people depicted. In the source repository,
historical portraits retain the individual credits and license terms recorded
in `docs/research/computing-ai-history-sources.md` and
`docs/research/deep-learning-history-sources.md`, with machine-readable attribution
in `assets/history/`. When sharing those
example canvases or their image exports, include the corresponding source and
attribution records. The generated classroom illustration's references and
character-design boundary are recorded in the source repository's
`docs/assets/paperstream-classroom-promo-v4-prompt.md`, which links the earlier
character-reference record. The architecture diagram also embeds generated
chibi portraits of these community characters, based on ApprenTice's published
Q-version adaptations (CC BY-NC-SA 4.0). Their prompt, reference sources and
attribution are recorded in `docs/assets/paperstream-agent-avatars-prompt.md`;
the project's MIT license does not replace those non-commercial, attribution
and share-alike terms. The downloaded reference originals are not redistributed.
These example assets are
not bundled in the editor plugin packages.
