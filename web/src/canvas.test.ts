import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addEdge, addNode, CanvasError, createCanvas, createEdge, createPaperNode,
  parseCanvas, patchEdge, patchNode, readPaper, removeEdge, removeNode,
  serializeCanvas, updatePaper, validateCanvas,
} from "./canvas.ts";
import type { CanvasNode, JSONCanvasDocument } from "./canvas.ts";

const paper = (id: string): CanvasNode => createPaperNode({
  alias: "示例论文", takeaway: "一个可以验证的结论", name: "A Full Original Title",
  url: "https://example.org/paper%20one", year: 2024,
}, { id, x: -40, y: 120 });

const textNode = (id: string, text = "# Ordinary note"): CanvasNode => ({
  id, type: "text", x: 0, y: 0, width: 200, height: 100, text,
});

function fixture(): JSONCanvasDocument {
  return {
    nodes: [paper("one"), paper("two"), textNode("note")],
    edges: [{ id: "relation", fromNode: "one", toNode: "two", label: "推广方法" }],
  };
}

function deepFreeze(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}

test("papers round-trip Unicode, Markdown punctuation, quotes, and optional metadata", () => {
  const fields = {
    alias: "方法 A: \"文字\"", takeaway: "第一行 **重要**\n第二行 `code` / \\ 和 %%",
    name: "论文原名 — Quantum ‘Study’ 🧪", url: "https://example.org/a%20b?q=中文#section", year: 9999,
  };
  const node = createPaperNode(fields, { id: "paper" });
  const restored = parseCanvas(serializeCanvas(addNode(createCanvas(), node)));
  assert.deepEqual(readPaper(restored.nodes[0]), fields);
  assert.equal(restored.nodes[0].id, "paper");
});

test("omitted optional fields read as null without guessing a title or year", () => {
  const node = textNode("old", '```json\n{"paperstream":1,"alias":"Old","takeaway":"Known result"}\n```');
  const restored = parseCanvas(JSON.stringify({ nodes: [node] }));
  assert.deepEqual(restored.edges, []);
  assert.deepEqual(readPaper(restored.nodes[0]), {
    alias: "Old", takeaway: "Known result", name: null, url: null, year: null,
  });
  assert.equal(restored.nodes[0].text, node.text);
});

test("unknown fields survive targeted edits and serialization at every document level", () => {
  const document = fixture();
  document.plugin = { nested: [null, { enabled: true }], source: "another editor" };
  document.nodes[0].styleAttributes = { shape: "pill", custom: [1, "two"] };
  document.edges[0].routing = { bendPoints: [{ x: 31, y: 44 }] };
  const originalPayload = { paperstream: 1, alias: "A", takeaway: "B", external: { doi: "10/example", verified: false } };
  document.nodes[0].text = `\`\`\`json\n${JSON.stringify(originalPayload)}\n\`\`\``;
  deepFreeze(document);

  const updated = updatePaper(document, "one", { alias: "Changed", name: "Full title" });
  const restored = parseCanvas(serializeCanvas(updated));
  assert.deepEqual(restored.plugin, document.plugin);
  assert.deepEqual(restored.nodes[0].styleAttributes, document.nodes[0].styleAttributes);
  assert.deepEqual(restored.edges, document.edges);
  assert.deepEqual(restored.nodes.slice(1), document.nodes.slice(1));
  const payload = JSON.parse(restored.nodes[0].text!.slice(8, -4));
  assert.deepEqual(payload.external, originalPayload.external);
  assert.equal(payload.alias, "Changed");
  assert.equal(payload.takeaway, "B");
  assert.equal(document.nodes[0].text, `\`\`\`json\n${JSON.stringify(originalPayload)}\n\`\`\``);
});

test("moving a card preserves its exact text and all unrelated objects", () => {
  const document = fixture();
  const before = JSON.stringify(document);
  deepFreeze(document);
  const moved = patchNode(document, "one", { x: 480, y: -320, width: 440 });
  assert.equal(moved.nodes[0].text, document.nodes[0].text);
  assert.equal(moved.nodes[0].id, "one");
  assert.deepEqual(moved.edges, document.edges);
  assert.deepEqual(moved.nodes.slice(1), document.nodes.slice(1));
  assert.equal(moved.nodes[0].x, 480);
  assert.equal(JSON.stringify(document), before);
});

test("paper patches preserve omitted fields and explicitly clear optional fields with null", () => {
  const document = fixture();
  const changed = updatePaper(document, "one", { url: "https://example.org/new", year: 2016 });
  assert.deepEqual(readPaper(changed.nodes[0]), {
    ...readPaper(document.nodes[0]), url: "https://example.org/new", year: 2016,
  });
  const cleared = updatePaper(changed, "one", { name: null, url: null, year: null });
  assert.deepEqual(readPaper(cleared.nodes[0]), {
    alias: "示例论文", takeaway: "一个可以验证的结论", name: null, url: null, year: null,
  });
});

test("ordinary text, file, link, group, and their native properties are preserved", () => {
  const nodes: CanvasNode[] = [
    textNode("text"),
    { id: "file", type: "file", x: 20, y: 20, width: 300, height: 200, file: "notes/paper.md", subpath: "#Result", custom: 3 },
    { id: "link", type: "link", x: 40, y: 40, width: 300, height: 200, url: "https://example.org" },
    { id: "group", type: "group", x: -20, y: -20, width: 900, height: 800, label: "Related work", background: "images/background.png", backgroundStyle: "ratio" },
  ];
  const document = { nodes, edges: [{ id: "plain", fromNode: "text", toNode: "file", fromEnd: "arrow" as const, toEnd: "none" as const }] };
  assert.deepEqual(parseCanvas(serializeCanvas(document)), document);
  for (const node of nodes) assert.equal(readPaper(node), null);
  assert.throws(() => updatePaper(document, "text", { alias: "Do not convert" }), CanvasError);
});

test("only strict numeric paperstream version 1 identifies a paper", () => {
  for (const version of [2, true, "1", null]) {
    const node = textNode("future", `\`\`\`json\n${JSON.stringify({ paperstream: version, futureData: 42 })}\n\`\`\``);
    const document = parseCanvas(JSON.stringify({ nodes: [node] }));
    assert.equal(readPaper(document.nodes[0]), null);
    assert.throws(() => updatePaper(document, "future", { alias: "Wrong" }), CanvasError);
    assert.equal(patchNode(document, "future", { x: 10 }).nodes[0].text, node.text);
  }
});

test("CRLF fences and surrounding whitespace identify papers without rewriting their source", () => {
  const node = textNode("windows", '\r\n ```json\r\n{"paperstream":1,"alias":"A","takeaway":"B"}\r\n``` \r\n');
  const document = parseCanvas(JSON.stringify({ nodes: [node], edges: [] }));
  assert.equal(readPaper(document.nodes[0])!.alias, "A");
  assert.equal(document.nodes[0].text, node.text);
});

test("invalid paper metadata and damaged paper JSON fail closed, ordinary examples remain text", () => {
  for (const text of [
    '```json\n{"paperstream":1,"alias":"","takeaway":"B"}\n```',
    '```json\n{"paperstream":1,"alias":"A","takeaway":"B","year":true}\n```',
    '```json\n{"paperstream":1, broken}\n```',
  ]) assert.throws(() => parseCanvas(JSON.stringify({ nodes: [textNode("bad", text)] })), CanvasError);
  const ordinary = textNode("example", '```json\n{"unfinished":\n```');
  assert.equal(readPaper(parseCanvas(JSON.stringify({ nodes: [ordinary] })).nodes[0]), null);
});

test("new takeaway and edited takeaway normalize CRLF while names stay single-line", () => {
  const node = createPaperNode({ alias: "A", takeaway: "First\r\nSecond\r\nThird" }, { id: "one" });
  assert.equal(readPaper(node)!.takeaway, "First\nSecond\nThird");
  const updated = updatePaper({ nodes: [node], edges: [] }, "one", { takeaway: "New\r\nResult" });
  assert.equal(readPaper(updated.nodes[0])!.takeaway, "New\nResult");
  assert.throws(() => updatePaper(updated, "one", { name: "Two\nlines" }), CanvasError);
});

test("bad paper edits never mutate the original graph", () => {
  const document = fixture();
  const before = serializeCanvas(document);
  deepFreeze(document);
  const patches = [
    { alias: "  " }, { alias: "Two\nlines" }, { takeaway: "\t" }, { name: "" },
    { takeaway: "bare\rcarriage" }, { takeaway: "bad\u0000control" }, { name: "bad\ud800surrogate" },
    { url: "relative/path" }, { url: "ftp://example.org" }, { url: "https://example.org/a b" },
    { url: "https://example.org\\evil" }, { url: "https://example.org:99999" },
    { url: "https://example.org:abc" }, { url: "https:///" },
    { year: 0 }, { year: 10000 }, { year: 2024.5 }, { year: true },
  ];
  for (const patch of patches) {
    assert.throws(() => updatePaper(document, "one", patch as never), CanvasError, JSON.stringify(patch));
    assert.equal(serializeCanvas(document), before);
  }
});

test("node and edge ids are unique within their own namespaces", () => {
  const document = fixture();
  assert.throws(() => addNode(document, paper("one")), CanvasError);
  assert.throws(() => addEdge(document, { ...document.edges[0] }), CanvasError);
  assert.doesNotThrow(() => addEdge(document, createEdge("one", "two", "Other relation", { id: "one" })));
});

test("new ids are opaque and stable across edits, and callers cannot replace ids", () => {
  const first = createPaperNode({ alias: "A", takeaway: "B" });
  const second = createPaperNode({ alias: "A", takeaway: "B" });
  assert.match(first.id, /^[0-9a-f]{32}$/);
  assert.notEqual(first.id, second.id);
  const document = addNode(createCanvas(), first);
  assert.equal(updatePaper(document, first.id, { alias: "New" }).nodes[0].id, first.id);
  assert.throws(() => patchNode(document, first.id, { id: "replacement" }), CanvasError);
  assert.throws(() => patchEdge(fixture(), "relation", { id: "replacement" }), CanvasError);
});

test("missing endpoints are rejected on load, addition, and retargeting", () => {
  const document = fixture();
  const before = serializeCanvas(document);
  assert.throws(() => parseCanvas(JSON.stringify({ ...document, edges: [{ id: "bad", fromNode: "one", toNode: "missing" }] })), CanvasError);
  assert.throws(() => addEdge(document, createEdge("missing", "one", "引用")), CanvasError);
  assert.throws(() => patchEdge(document, "relation", { toNode: "missing" }), CanvasError);
  assert.equal(serializeCanvas(document), before);
});

test("edge labels and endpoint edits preserve unknown attributes and original objects", () => {
  const document = fixture();
  document.edges[0].custom = { weight: 0.5, notes: ["external"] };
  document.edges[0].fromSide = "left";
  deepFreeze(document);
  const changed = patchEdge(document, "relation", { label: "采用相同方法", toNode: "note" });
  assert.equal(changed.edges[0].label, "采用相同方法");
  assert.equal(changed.edges[0].toNode, "note");
  assert.equal(changed.edges[0].fromSide, "left");
  assert.deepEqual(changed.edges[0].custom, document.edges[0].custom);
  assert.equal(document.edges[0].label, "推广方法");
});

test("blank relations can be created and cleared while native multiline labels survive", () => {
  const document = fixture();
  document.edges[0].label = "line one\nline two";
  assert.equal(parseCanvas(serializeCanvas(document)).edges[0].label, document.edges[0].label);
  for (const label of ["two\nlines", "\r", "\u0000"]) {
    assert.throws(() => createEdge("one", "two", label), CanvasError);
    assert.throws(() => patchEdge(document, "relation", { label }), CanvasError);
  }
  document.edges[0].custom = { kept: true };
  for (const label of ["", "  "]) {
    assert.equal(createEdge("one", "two", label).label, label);
    const changed = patchEdge(document, "relation", { label });
    assert.equal(parseCanvas(serializeCanvas(changed)).edges[0].label, label);
    assert.deepEqual(changed.edges[0].custom, { kept: true });
  }
});

test("removing a connected node requires explicit cascade and retains unrelated objects", () => {
  const document = fixture();
  document.edges.push({ id: "unrelated", fromNode: "two", toNode: "note", label: "记录" });
  deepFreeze(document);
  assert.throws(() => removeNode(document, "one"), CanvasError);
  const removed = removeNode(document, "one", { cascade: true });
  assert.deepEqual(removed.nodes.map((node) => node.id), ["two", "note"]);
  assert.deepEqual(removed.edges.map((edge) => edge.id), ["unrelated"]);
  assert.equal(document.nodes.length, 3);
  assert.equal(document.edges.length, 2);
});

test("edge removal and unconnected node removal leave the remaining graph intact", () => {
  const document = fixture();
  const withoutEdge = removeEdge(document, "relation");
  assert.deepEqual(withoutEdge.nodes, document.nodes);
  assert.deepEqual(withoutEdge.edges, []);
  assert.deepEqual(removeNode(withoutEdge, "one").nodes, document.nodes.slice(1));
  assert.throws(() => removeEdge(document, "missing"), CanvasError);
  assert.throws(() => removeNode(document, "missing"), CanvasError);
  assert.throws(() => patchNode(document, "missing", { x: 20 }), CanvasError);
  assert.throws(() => patchEdge(document, "missing", { label: "unknown" }), CanvasError);
});

test("geometry rejects non-finite, fractional, unsafe, and nonpositive dimensions", () => {
  const document = fixture();
  for (const patch of [{ x: Infinity }, { y: NaN }, { x: 1.2 }, { y: 2 ** 54 }, { width: 0 }, { height: -1 }]) {
    assert.throws(() => patchNode(document, "one", patch), CanvasError);
  }
  assert.equal(patchNode(document, "one", { x: -100, y: -200 }).nodes[0].x, -100);
});

test("invalid root shapes, required fields, and optional endpoint values fail closed", () => {
  for (const source of ["null", "[]", "{} trailing", '{"nodes":null}', '{"edges":{}}']) {
    assert.throws(() => parseCanvas(source), CanvasError);
  }
  for (const node of [
    { ...textNode("x"), type: "unknown" }, { ...textNode("x"), type: ["text"] }, { ...textNode("x"), id: "" },
    { ...textNode("x"), text: null }, { ...textNode("x"), x: "0" },
  ]) assert.throws(() => parseCanvas(JSON.stringify({ nodes: [node] })), CanvasError);
  assert.throws(() => addEdge(fixture(), { id: "bad", fromNode: "one", toNode: "two", toEnd: "triangle" } as never), CanvasError);
});

test("omitted arrays are normalized while unknown root values are retained", () => {
  assert.deepEqual(parseCanvas('{"settings":{"theme":"dark"}}'), {
    settings: { theme: "dark" }, nodes: [], edges: [],
  });
});

test("serialization refuses values JSON would silently discard or transform", () => {
  for (const extra of [undefined, () => 1, BigInt(1), Infinity, new Date("2020-01-01")]) {
    assert.throws(() => serializeCanvas({ ...fixture(), extra }), CanvasError);
  }
  const circular = fixture();
  circular.extra = circular;
  assert.throws(() => validateCanvas(circular), CanvasError);
});

test("duplicate JSON keys cannot silently discard root or nested extension data", () => {
  for (const source of [
    '{"nodes":[],"nodes":[]}',
    '{"nodes":[{"id":"a","id":"b"}]}',
    '{"external":{"key":"first","key":"second"}}',
    '{"external":{"key":"first","\\u006bey":"second"}}',
    '{"external":[{"key":1,"key":2}]}',
  ]) assert.throws(() => parseCanvas(source), CanvasError);
  assert.deepEqual(parseCanvas('{"external":{"a":[true,null,{"key":"escaped \\\" quote"}],"b":{"key":2}}}').external,
    { a: [true, null, { key: 'escaped " quote' }], b: { key: 2 } });
  const duplicatePaper = textNode("bad", '```json\n{"paperstream":1,"alias":"first","alias":"second","takeaway":"result"}\n```');
  assert.throws(() => parseCanvas(JSON.stringify({ nodes: [duplicatePaper] })), CanvasError);
});

test("large integers and decimal precision loss fail closed even in unknown fields", () => {
  for (const number of ["9007199254740993", "9007199254740992", "9007199254740990.1", "0.10000000000000000001", "1e-400", "1e400"]) {
    assert.throws(() => parseCanvas(`{"extension":{"preciseId":${number}}}`), CanvasError, number);
    const rawPaper = textNode("paper", `\`\`\`json\n{"paperstream":1,"alias":"A","takeaway":"B","extension":${number}}\n\`\`\``);
    assert.throws(() => parseCanvas(JSON.stringify({ nodes: [rawPaper] })), CanvasError, number);
  }
  assert.deepEqual(parseCanvas('{"extension":[0.1,1.2300,123e-2,-1.25E+2,9007199254740991]}').extension,
    [0.1, 1.23, 1.23, -125, Number.MAX_SAFE_INTEGER]);
  assert.throws(() => serializeCanvas({ ...fixture(), extension: { unsafe: 2 ** 54 } }), CanvasError);
});
