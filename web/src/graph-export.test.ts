import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addEdge, addNode, createCanvas, createEdge, createPaperNode } from './canvas.ts';
import type { CanvasNode, JSONCanvasDocument } from './canvas.ts';
import { buildExportScene, downloadGraph, exportGraphSvg, wrapExportText } from './graph-export.ts';
import { createRelationNode } from './graph-relations.ts';
import { figureLayout } from './figure-layout.ts';

// Complete RGBA PNGs with valid IHDR/IDAT/IEND chunks and CRCs, not placeholder bytes.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGMwmJDwH4QBEOMEP0iNvQ8AAAAASUVORK5CYII=';
const TALL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAEElEQVR4nGMwmJDwnwFEAAATAwQ/Rjt83AAAAABJRU5ErkJggg==';

function sample(): JSONCanvasDocument {
  let graph = createCanvas();
  const first = createPaperNode({ alias: 'A < B & "C"', takeaway: '- 第一项\n- second <script>bad</script>', name: 'Full title', year: 1998, url: 'https://example.org/?a=1&b=2' }, { id: 'first', x: -450, y: -180, width: 300, height: 210 });
  const second = createPaperNode({ alias: 'Next', takeaway: 'Another paper', year: 2020 }, { id: 'second', x: -450, y: 240, width: 300, height: 210 });
  first.paperstreamStyle = { strokeWidth: 5 };
  graph = addNode(addNode(graph, first), second);
  const edge = createEdge(first.id, second.id, 'Shared <relation> & comparison');
  edge.fromEnd = 'arrow'; edge.toEnd = 'arrow'; edge.paperstreamStyle = { strokeWidth: 2.5, lineStyle: 'dashed' };
  return addEdge(graph, edge);
}
type Rect = { x: number; y: number; width: number; height: number };
function contains(outer: Rect, inner: Rect, label: string) {
  const epsilon = 1e-7;
  assert.ok(inner.x >= outer.x - epsilon && inner.y >= outer.y - epsilon
    && inner.x + inner.width <= outer.x + outer.width + epsilon
    && inner.y + inner.height <= outer.y + outer.height + epsilon,
  `${label}: ${JSON.stringify(inner)} must fit in ${JSON.stringify(outer)}`);
}
function assertSceneContainsContent(scene: ReturnType<typeof buildExportScene>) {
  for (const node of scene.nodes) {
    for (const block of [node, node.kind, node.title, node.body, ...node.figures, ...node.captions, node.year]) {
      if (block?.height) contains(scene.bounds, block, node.id);
    }
  }
}

test('compact shared relations export only centered text inside the original 44px card', () => {
  const node = createRelationNode('共享的研究关系', { id: 'relation', x: -90, y: -60, width: 220, height: 44 });
  const graph = addNode(createCanvas(), node), before = JSON.stringify(graph);
  const scene = buildExportScene(graph, { padding: 0 }), exported = scene.nodes[0];
  assert.equal(exported.title, undefined);
  assert.equal(exported.kind, undefined);
  assert.equal(exported.body.align, 'center');
  assert.equal(exported.body.y, node.y + 13);
  assert.equal(exported.body.x + exported.body.width / 2, node.x + node.width / 2);
  assert.equal(exported.body.lines.length, 1);
  contains(node, exported.body, 'short relation text');
  assertSceneContainsContent(scene);
  const svg = exportGraphSvg(graph, { padding: 0 });
  assert.match(svg, /text-anchor="middle"/);
  assert.doesNotMatch(svg, />关系<\/tspan>/);
  assert.equal(JSON.stringify(graph), before);
});

test('long and multiline shared labels expand export bounds without moving cards or routed anchors', () => {
  for (const label of ['共享的研究关系需要完整保留且不能静默裁切'.repeat(6), '第一行\n第二行\n第三行\n第四行']) {
    let graph = addNode(createCanvas(), createRelationNode(label, { id: 'relation', x: -520, y: -330, width: 130, height: 44 }));
    graph = addNode(graph, createPaperNode({ alias: 'Target', takeaway: '' }, { id: 'target', x: -100, y: -330, width: 100, height: 44 }));
    graph = addEdge(graph, { ...createEdge('relation', 'target', ''), fromSide: 'right', toSide: 'left', paperstreamStyle: { waypoints: [{ x: -200, y: -400 }] } });
    graph.nodes[0].unknown = { preserve: ['all', 'fields'] };
    const before = JSON.stringify(graph), scene = buildExportScene(graph, { padding: 0 }), exported = scene.nodes[0];
    assert.ok(exported.body.lines.length >= 4);
    assert.ok(exported.body.y + exported.body.height > exported.y + exported.height);
    assert.equal(exported.height, 44);
    assert.deepEqual(scene.edges[0].points[0], { x: -455, y: -330 }, 'shared labels use the port facing the first waypoint');
    assert.deepEqual(scene.edges[0].points.at(-1), { x: -100, y: -280 }, 'the target port follows its visible minimum-height border');
    assert.ok(scene.edges[0].points.some(point => point.x === -200 && point.y === -400));
    assertSceneContainsContent(scene);
    const svg = exportGraphSvg(graph, { padding: 0 });
    const viewBox = /viewBox="([^\"]+)" role="img"/.exec(svg)![1].split(' ').map(Number);
    contains({ x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] }, exported.body, 'SVG multiline label');
    assert.equal(JSON.stringify(graph), before);
  }
});

test('short cards expand their export border around full media, captions and a bottom-attached year', () => {
  const node = createPaperNode({ alias: 'Paper', takeaway: 'A useful result', year: 2025 }, { id: 'media', x: -620, y: -480, width: 220, height: 90 });
  node.paperstreamCard = { unknown: 'keep', figures: [{ id: 'image', src: TALL_PNG, widthPercent: 50,
    naturalWidth: 1, naturalHeight: 2, aspectRatio: 99, inset: true,
    caption: '这是一段必须按图片宽度换行的完整图注\n第二段图注' }] };
  const graph = addNode(createCanvas(), node), before = JSON.stringify(graph);
  const scene = buildExportScene(graph, { padding: 0 }), exported = scene.nodes[0], figure = exported.figures[0], caption = exported.captions[0];
  assert.equal(exported.title!.y, node.y + 17);
  assert.ok(exported.body.y >= exported.title!.y + exported.title!.height + 9);
  assert.equal(figure.width, 91);
  assert.equal(figure.height, 182);
  assert.equal(figure.x, node.x + 19, 'content inset includes the actual card border');
  assert.equal(caption.x, figure.x);
  assert.equal(caption.width, figure.width);
  assert.ok(caption.lines.length >= 3);
  assert.equal(caption.y, figure.y + figure.height + 5);
  assert.ok(exported.year!.y >= caption.y + caption.height + 10);
  assert.ok(exported.height > node.height);
  for (const block of [exported.title!, exported.body, figure, caption, exported.year!]) contains(exported, block, 'content inside border');
  assert.equal(exported.year!.y + exported.year!.height, exported.y + exported.height - 16);
  assertSceneContainsContent(scene);
  assert.equal(JSON.stringify(graph), before);
});

test('legacy filename captions stay stored but are absent from image exports', () => {
  const node = createPaperNode({ alias: 'Figure paper', takeaway: '' }, { id: 'figures' });
  node.paperstreamCard = { figures: ['screen shot.PNG', '结果.jpeg', 'A useful comparison', '使用 result.png\n观察模型变化'].map((caption, index) => ({
    id: `fig-${index}`, src: PNG, caption, widthPercent: 100, naturalWidth: 2, naturalHeight: 1,
  })) };
  const graph = { nodes: [node], edges: [] }, before = JSON.stringify(graph);
  const scene = buildExportScene(graph);
  assert.equal(scene.nodes[0].figures.length, 4);
  assert.equal(scene.nodes[0].captions.length, 2);
  assert.match(scene.nodes[0].captions[0].lines.join(' '), /useful comparison/);
  assert.match(scene.nodes[0].captions[1].lines.join(' '), /result\.png/);
  const svg = exportGraphSvg(graph);
  assert.ok(!svg.includes('screen shot.PNG'));
  assert.ok(!svg.includes('结果.jpeg'));
  assert.equal(JSON.stringify(graph), before);
});

test('centered portrait frames and full-width captions export the same crop rectangle as the UI', () => {
  const node = createPaperNode({ alias: 'Portrait', takeaway: 'Two contributors' }, { id: 'portrait', x: 20, y: 30, width: 400, height: 400 });
  const figure = { id: 'photo', src: TALL_PNG, naturalWidth: 1, naturalHeight: 2, widthPercent: 30,
    caption: 'A name long enough to use the whole card', align: 'center',
    frame: { aspectRatio: .75, fit: 'cover', positionX: 20, positionY: 30, zoom: 1.5 } };
  node.paperstreamCard = { figures: [figure] };
  const graph = { nodes: [node], edges: [] }, before = JSON.stringify(graph), scene = buildExportScene(graph);
  const exported = scene.nodes[0], photo = exported.figures[0], caption = exported.captions[0];
  const shared = figureLayout(figure, photo.width);
  assert.equal(photo.x + photo.width / 2, node.x + node.width / 2);
  assert.equal(photo.height, photo.width / .75);
  assert.deepEqual(photo.image, { ...shared.image, x: photo.x + shared.image.x, y: photo.y + shared.image.y });
  assert.equal(caption.align, 'center'); assert.equal(caption.x, node.x + 19); assert.equal(caption.width, node.width - 38);
  const svg = exportGraphSvg(graph);
  assert.match(svg, /<clipPath id="figure-0-0" clipPathUnits="userSpaceOnUse"><rect[^>]+rx="6"/);
  assert.match(svg, /preserveAspectRatio="none" clip-path="url\(#figure-0-0\)"/);
  assert.ok(svg.includes(TALL_PNG), 'the embedded original bytes are unchanged');
  assert.equal(JSON.stringify(graph), before);
});

test('right aligned complete frames preserve the entire source and missing dimensions use raster headers', () => {
  const node = createPaperNode({ alias: 'Figure', takeaway: '' }, { id: 'figure', x: -20, y: -30, width: 400, height: 400 });
  node.paperstreamCard = { figures: [{ id: 'photo', src: PNG, widthPercent: 25, caption: 'Complete source', align: 'right',
    frame: { aspectRatio: 1, fit: 'contain' } }] };
  const graph = { nodes: [node], edges: [] }, scene = buildExportScene(graph), exported = scene.nodes[0], photo = exported.figures[0];
  assert.equal(photo.x + photo.width, node.x + node.width - 19);
  assert.equal(photo.height, photo.width);
  assert.equal(photo.image.width, photo.width); assert.equal(photo.image.height, photo.height / 2);
  assert.equal(photo.image.y, photo.y + photo.height / 4);
  assert.equal(exported.captions[0].align, 'right'); assert.equal(exported.captions[0].width, photo.width);
  assertSceneContainsContent(scene);
});

test('unknown frame formats remain natural and every exported image receives its own rounded clip', () => {
  const graph = sample();
  for (const node of graph.nodes) node.paperstreamCard = { figures: [{ id: 'same-id', src: PNG, caption: '', widthPercent: 20,
    frame: { future: true }, aspectRatio: 99 }] };
  const before = JSON.stringify(graph), scene = buildExportScene(graph), svg = exportGraphSvg(graph);
  for (const node of scene.nodes) assert.equal(node.figures[0].height, node.figures[0].width / 2);
  assert.match(svg, /clipPath id="figure-0-0"/); assert.match(svg, /clipPath id="figure-1-0"/);
  assert.equal(JSON.stringify(graph), before);
});

test('paper, note, page, group, file and link retain their distinct content without inventing metadata titles', () => {
  const base = { x: -200, y: -100, width: 180, height: 70 };
  const nodes: CanvasNode[] = [
    createPaperNode({ alias: 'Paper alias', takeaway: 'Paper content' }, { ...base, id: 'paper' }),
    { ...base, id: 'note', type: 'text', label: 'Note title', text: 'Note content', paperstreamCard: { kind: 'note', title: 'Unknown extension' } },
    { ...base, id: 'page', type: 'text', text: 'Page content', paperstreamCard: { kind: 'page' } },
    { ...base, id: 'group', type: 'group', label: 'A group' },
    { ...base, id: 'file', type: 'file', file: 'research/paper.pdf' },
    { ...base, id: 'link', type: 'link', url: 'https://example.org' },
  ];
  const graph = { nodes, edges: [], unknown: { preserved: true } }, before = JSON.stringify(graph);
  const scene = buildExportScene(graph, { padding: 0 });
  assert.deepEqual(scene.nodes.map(node => node.title!.lines.join('')), ['Paper alias', 'Note title', '插页', 'A group', 'research/paper.pdf', 'https://example.org']);
  assert.deepEqual(scene.nodes.map(node => node.kind?.lines.join('')), [undefined, 'NOTE', '插页', '分组', '文件', '链接']);
  assert.deepEqual(scene.nodes.map(node => node.body.lines.join('')), ['Paper content', 'Note content', 'Page content', '', '', '']);
  assert.equal(scene.nodes[3].group, true);
  assert.equal(scene.nodes[5].url, 'https://example.org');
  assertSceneContainsContent(scene);
  exportGraphSvg(graph);
  assert.equal(JSON.stringify(graph), before);
});

test('SVG includes negative-coordinate cards, links, bullets and both independent strokes without mutating input', () => {
  const graph = sample(), before = JSON.stringify(graph), scene = buildExportScene(graph), svg = exportGraphSvg(graph);
  assert.equal(JSON.stringify(graph), before);
  assert.ok(scene.bounds.x < -450 && scene.bounds.y < -180);
  assert.ok(scene.bounds.height > 630);
  assert.match(svg, /A &lt; B &amp; &quot;C&quot;/);
  assert.match(svg, /• 第一项/);
  assert.match(svg, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /https:\/\/example.org\/\?a=1&amp;b=2/);
  assert.match(svg, /stroke-width="5"/);
  assert.match(svg, /stroke-width="2.5"/);
  assert.match(svg, /marker-start="url\(#arrow-0\)"/);
  assert.match(svg, /marker-end="url\(#arrow-0\)"/);
  assert.match(svg, /stroke-dasharray="7 5"/);
  assert.doesNotMatch(svg, /foreignObject/);
});

test('empty graphs, unlabeled edges and long unbroken text have usable exports', () => {
  const empty = buildExportScene(createCanvas());
  assert.ok(empty.bounds.width > 0 && empty.bounds.height > 0);
  const graph = sample(); graph.edges[0].label = '';
  const svg = exportGraphSvg(graph);
  assert.doesNotMatch(svg, /data-edge-id=/);
  assert.ok(wrapExportText('abcdefghijklmnopqrstuvwxyz', 35, 13).length > 1);
  assert.deepEqual(wrapExportText('- one\n- 二', 300, 13), ['• one', '• 二']);
});

test('unsupported export formats fail before browser allocation or file download', async () => {
  for (const format of ['pptx', 'pdf', '', undefined]) {
    await assert.rejects(downloadGraph(createCanvas(), format as never, 'papers.canvas'), /请选择 SVG 或 PNG/);
  }
});

test('oversized graphs reject PNG before raster allocation while remaining exportable as SVG', async () => {
  const graph = { nodes: [createPaperNode({ alias: 'Wide graph', takeaway: '' }, { id: 'wide', width: 20_000, height: 100 })], edges: [] };
  const before = JSON.stringify(graph);
  await assert.rejects(downloadGraph(graph, 'png', 'papers.canvas'), /图片过大.*SVG/);
  assert.match(exportGraphSvg(graph), /data-node-id="wide"/);
  assert.equal(JSON.stringify(graph), before);
});

test('SVG ignores legacy presentation metadata and preserves every unknown field', () => {
  const graph = { ...sample(), paperstreamPresentation: { version: 1, pages: [
    { id: 'old-page', title: 'Old page', nodeIds: ['first'], unknown: { nested: [7, 'keep'] } },
  ], future: { enabled: true } } }, before = JSON.stringify(graph);
  const scene = buildExportScene(graph), svg = exportGraphSvg(graph);
  assert.deepEqual(scene.nodes.map(node => node.id), ['first', 'second']);
  assert.match(svg, /data-node-id="first"/);
  assert.match(svg, /data-node-id="second"/);
  assert.equal(JSON.stringify(graph), before);
});

test('only portable raster images are embedded, with per-figure dimensions and no remote image request', () => {
  const graph = sample();
  graph.nodes[0].paperstreamCard = { figures: [
    { id: 'png', src: PNG, widthPercent: 50, naturalWidth: 200, naturalHeight: 100, caption: 'Figure <1>' },
    { id: 'remote', src: 'https://example.org/tracking.png' },
    { id: 'svg', src: 'data:image/svg+xml;base64,PHN2Zy8+' },
  ] };
  const scene = buildExportScene(graph), svg = exportGraphSvg(graph);
  assert.equal(scene.nodes[0].figures.length, 1);
  assert.equal(scene.nodes[0].figures[0].width, 127);
  assert.equal(scene.nodes[0].figures[0].height, 63.5);
  assert.ok(svg.includes(PNG));
  assert.match(svg, /Figure &lt;1&gt;/);
  assert.doesNotMatch(svg, /tracking\.png|image\/svg\+xml;base64/);
});

test('manual relation labels and routing export at their saved positions', () => {
  const graph = sample();
  graph.edges[0].paperstreamStyle = { ...graph.edges[0].paperstreamStyle as object, labelPosition: { x: 750, y: -600 }, waypoints: [{ x: 1300, y: -1000 }, { x: 1300, y: 900 }] };
  const before = JSON.stringify(graph), scene = buildExportScene(graph), label = scene.edges[0].label!;
  assert.equal(label.x + label.width / 2, 750);
  assert.equal(label.y + (label.lines.length * 18 + 12) / 2, -600);
  const points = scene.edges[0].points;
  const first = points.findIndex(point => point.x === 1300 && point.y === -1000);
  assert.ok(first > 0 && points.findIndex(point => point.x === 1300 && point.y === 900) > first);
  assert.ok(scene.edges[0].commands.some(command => command.point.x === 750 && command.point.y === -600));
  assert.ok(scene.bounds.x + scene.bounds.width > 1300 && scene.bounds.y < -1000 && scene.bounds.y + scene.bounds.height > 900);
  const svg = exportGraphSvg(graph);
  assert.ok(svg.includes(`d="${scene.edges[0].path}"`));
  assert.equal(JSON.stringify(graph), before);
});

test('SVG replaces unsupported XML characters without corrupting Unicode or source content', () => {
  const text = '中文 😀 e\u0301\t\n' + '\u0000\u0001\u000b\u000c\u001f\ufffe\uffff';
  const node: CanvasNode = { id: 'note', type: 'text', x: 0, y: 0, width: 400, height: 300,
    text, label: text, paperstreamCard: { figures: [{ id: 'fig', src: PNG,
      caption: text, widthPercent: 100, naturalWidth: 2, naturalHeight: 1 }] } };
  const graph = { nodes: [node], edges: [] }, before = JSON.stringify(graph);
  const svg = exportGraphSvg(graph);
  assert.doesNotMatch(svg, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u);
  assert.ok(svg.includes('中文 😀 e\u0301'));
  assert.ok(svg.includes('\ufffd'), 'unrepresentable characters have an explicit replacement');
  assert.equal(JSON.stringify(graph), before);
});

test('invalid optional image dimension metadata cannot create infinite or zero export geometry', () => {
  for (const [naturalWidth, naturalHeight] of [[1e-308, 100], [100, 1e-308], [0, 0], [-1, 10], [.5, 1.5]]) {
    const graph = sample();
    graph.nodes[0].paperstreamCard = { figures: [{ id: 'fig', src: PNG, caption: '',
      widthPercent: 100, naturalWidth, naturalHeight }] };
    const before = JSON.stringify(graph), scene = buildExportScene(graph), figure = scene.nodes[0].figures[0];
    for (const value of [figure.width, figure.height, scene.bounds.width, scene.bounds.height]) {
      assert.ok(Number.isFinite(value) && value > 0);
    }
    assert.doesNotMatch(exportGraphSvg(graph), /NaN|Infinity/);
    assert.equal(JSON.stringify(graph), before);
  }
});

test('mixed-language wrapping keeps fitting English words and numbers intact', () => {
  const lines = wrapExportText('中文 ImageNet 训练 152 层，结合 ReLU 和 Dropout。', 80, 13);
  assert.ok(lines.some(line => line.includes('ImageNet')));
  assert.ok(lines.some(line => line.includes('152')));
  assert.ok(lines.some(line => line.includes('ReLU')));
  assert.ok(lines.some(line => line.includes('Dropout')));
  assert.equal(lines.join('').replaceAll(' ', ''), '中文ImageNet训练152层，结合ReLU和Dropout。');
  assert.ok(wrapExportText('VeryLongUnbrokenIdentifierBeyondLineWidth', 30, 13).length > 1);
  assert.ok(wrapExportText('中文中文中文中文中文', 40, 13).length > 1);
});

test('SVG exports styled label-through paths and retains exact curve bounds', () => {
  const graph = sample(); graph.nodes[1].x += 400;
  graph.edges[0].paperstreamStyle = { labelPosition: { x: -700, y: -560 } };
  const before = JSON.stringify(graph), paths = new Set<string>();
  for (const connectionStyle of ['orthogonal', 'rounded', 'curved'] as const) {
    const scene = buildExportScene(graph, { connectionStyle, padding: 0 }), edge = scene.edges[0];
    paths.add(edge.path);
    assert.ok(edge.commands.some(command => command.point.x === -700 && command.point.y === -560));
    contains(scene.bounds, edge.bounds, `${connectionStyle} route bounds`);
    const svg = exportGraphSvg(graph, { connectionStyle });
    assert.ok(svg.includes(`d="${edge.path}"`));
    assert.doesNotMatch(svg, /relation-leader/);
  }
  assert.equal(paths.size, 3);
  assert.equal(JSON.stringify(graph), before);
});

test('SVG applies custom theme export palette without mutating source nodes or edges', () => {
  const graph = sample();
  graph.nodes[0].paperstreamCard = { figures: [{ id: 'fig', src: PNG, caption: '', widthPercent: 40, naturalWidth: 2, naturalHeight: 1, frame: { aspectRatio: 1, fit: 'contain' } }] };
  const before = JSON.stringify(graph);
  const svg = exportGraphSvg(graph, {
    background: '#141820',
    cardBackground: '#1c222d',
    foreground: '#e7ecf4',
    muted: '#9aa5b5',
    cardBorder: '#3c4657',
    edgeColor: '#7b889c',
    surfaceAlt: '#262e3c',
  });
  assert.match(svg, /fill="#141820"/);
  assert.match(svg, /fill="#1c222d"/);
  assert.match(svg, /fill="#e7ecf4"/);
  assert.match(svg, /stroke="#3c4657"/);
  assert.match(svg, /stroke="#7b889c"/);
  assert.match(svg, /fill="#262e3c"/);
  assert.equal(JSON.stringify(graph), before);
});
