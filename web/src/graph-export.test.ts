import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addEdge, addNode, createCanvas, createEdge, createPaperNode } from './canvas.ts';
import type { CanvasNode, JSONCanvasDocument } from './canvas.ts';
import { buildExportScene, createStoredZip, exportGraphPptx, exportGraphSvg, validatePresentationImageSize, wrapExportText } from './graph-export.ts';
import { MAX_FIGURE_BYTES } from './card-media.ts';
import { createPresentationPage, movePresentationPage } from './presentation-pages.ts';
import { createRelationNode } from './graph-relations.ts';

// Complete RGBA PNGs with valid IHDR/IDAT/IEND chunks and CRCs, not placeholder bytes.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGMwmJDwH4QBEOMEP0iNvQ8AAAAASUVORK5CYII=';
const TALL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAEElEQVR4nGMwmJDwnwFEAAATAwQ/Rjt83AAAAABJRU5ErkJggg==';
const PNG_BYTES = Uint8Array.from(atob(PNG.split(',')[1]), character => character.charCodeAt(0));

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
function unzipStored(bytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>(); let offset = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), decoder = new TextDecoder();
  while (view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 8, true), 0);
    const length = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30, name = decoder.decode(bytes.subarray(start, start + nameLength));
    const payload = start + nameLength + extraLength;
    entries.set(name, bytes.subarray(payload, payload + length)); offset = payload + length;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  return entries;
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
function pptxShapeRects(slide: string): Map<string, Rect> {
  const rectangles = new Map<string, Rect>();
  for (const match of slide.matchAll(/<p:(sp|pic)>([\s\S]*?)<\/p:\1>/g)) {
    const name = /<p:cNvPr[^>]*name="([^"]*)"/.exec(match[2])?.[1];
    const rect = /<a:xfrm><a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(match[2]);
    if (name && rect) rectangles.set(name, { x: Number(rect[1]), y: Number(rect[2]), width: Number(rect[3]), height: Number(rect[4]) });
  }
  return rectangles;
}

test('compact shared relations export only centered text inside the original 44px card', () => {
  const node = createRelationNode('共享的研究关系', { id: 'relation', x: -90, y: -60, width: 220, height: 44 });
  const graph = addNode(createCanvas(), node), before = JSON.stringify(graph);
  const scene = buildExportScene(graph, { padding: 0 }), exported = scene.nodes[0];
  assert.equal(exported.title, undefined);
  assert.equal(exported.kind, undefined);
  assert.equal(exported.body.align, 'center');
  assert.equal(exported.body.y, node.y + 12);
  assert.equal(exported.body.x + exported.body.width / 2, node.x + node.width / 2);
  assert.equal(exported.body.lines.length, 1);
  contains(node, exported.body, 'short relation text');
  assertSceneContainsContent(scene);
  const svg = exportGraphSvg(graph, { padding: 0 });
  assert.match(svg, /text-anchor="middle"/);
  assert.doesNotMatch(svg, />关系<\/tspan>/);
  const entries = unzipStored(exportGraphPptx(graph, { padding: 0 }));
  const slide = new TextDecoder().decode(entries.get('ppt/slides/slide1.xml'));
  const rectangles = pptxShapeRects(slide);
  contains(rectangles.get('Card relation')!, rectangles.get('Takeaway relation')!, 'PPTX relation');
  assert.equal(rectangles.has('Title relation'), false);
  assert.match(slide, /algn="ctr"/);
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
    assert.deepEqual(scene.edges[0].points, [{ x: -390, y: -308 }, { x: -200, y: -400 }, { x: -100, y: -308 }]);
    assertSceneContainsContent(scene);
    const svg = exportGraphSvg(graph, { padding: 0 });
    const viewBox = /viewBox="([^\"]+)" role="img"/.exec(svg)![1].split(' ').map(Number);
    contains({ x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] }, exported.body, 'SVG multiline label');
    const slide = new TextDecoder().decode(unzipStored(exportGraphPptx(graph, { padding: 0 })).get('ppt/slides/slide1.xml'));
    for (const [name, rect] of pptxShapeRects(slide)) contains({ x: -1, y: -1, width: 12192002, height: 6858002 }, rect, name);
    assert.equal(JSON.stringify(graph), before);
  }
});

test('figure captions use figure width and overflowing text, media and year all remain inside export bounds', () => {
  const node = createPaperNode({ alias: 'Paper', takeaway: 'A useful result', year: 2025 }, { id: 'media', x: -620, y: -480, width: 220, height: 90 });
  node.paperstreamCard = { unknown: 'keep', figures: [{ id: 'image', src: TALL_PNG, widthPercent: 50,
    naturalWidth: 1, naturalHeight: 2, aspectRatio: 99, inset: true,
    caption: '这是一段必须按图片宽度换行的完整图注\n第二段图注' }] };
  const graph = addNode(createCanvas(), node), before = JSON.stringify(graph);
  const scene = buildExportScene(graph, { padding: 0 }), exported = scene.nodes[0], figure = exported.figures[0], caption = exported.captions[0];
  assert.equal(exported.title!.y, node.y + 18);
  assert.ok(exported.body.y >= exported.title!.y + exported.title!.height + 10);
  assert.equal(figure.width, 90);
  assert.equal(figure.height, 180);
  assert.equal(figure.x, node.x + 20, 'unknown extensions do not override CardBody placement');
  assert.equal(caption.x, figure.x);
  assert.equal(caption.width, figure.width);
  assert.ok(caption.lines.length >= 3);
  assert.equal(caption.y, figure.y + figure.height + 5);
  assert.ok(exported.year!.y >= caption.y + caption.height + 10);
  assert.equal(exported.height, node.height);
  assertSceneContainsContent(scene);
  const slide = new TextDecoder().decode(unzipStored(exportGraphPptx(graph, { padding: 0 })).get('ppt/slides/slide1.xml'));
  const rects = pptxShapeRects(slide);
  assert.equal(rects.get('Figure 1')!.width, rects.get('Caption media 0')!.width);
  assert.ok(rects.get('Year media')!.y > rects.get('Caption media 0')!.y + rects.get('Caption media 0')!.height);
  for (const [name, rect] of rects) contains({ x: -1, y: -1, width: 12192002, height: 6858002 }, rect, name);
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
  exportGraphSvg(graph); exportGraphPptx(graph);
  assert.equal(JSON.stringify(graph), before);
});

test('converted presentation images fail explicitly at the same byte limit as card figures', () => {
  assert.doesNotThrow(() => validatePresentationImageSize(1));
  assert.doesNotThrow(() => validatePresentationImageSize(MAX_FIGURE_BYTES));
  assert.throws(() => validatePresentationImageSize(MAX_FIGURE_BYTES + 1), /PNG 超过 8 MB/);
  for (const size of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assert.throws(() => validatePresentationImageSize(size), /PNG 数据为空或无效/);
  }
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

test('only portable raster images are embedded, with per-figure dimensions and no remote image request', () => {
  const graph = sample();
  graph.nodes[0].paperstreamCard = { figures: [
    { id: 'png', src: PNG, widthPercent: 50, naturalWidth: 200, naturalHeight: 100, caption: 'Figure <1>' },
    { id: 'remote', src: 'https://example.org/tracking.png' },
    { id: 'svg', src: 'data:image/svg+xml;base64,PHN2Zy8+' },
  ] };
  const scene = buildExportScene(graph), svg = exportGraphSvg(graph);
  assert.equal(scene.nodes[0].figures.length, 1);
  assert.equal(scene.nodes[0].figures[0].width, 130);
  assert.equal(scene.nodes[0].figures[0].height, 65);
  assert.ok(svg.includes(PNG));
  assert.match(svg, /Figure &lt;1&gt;/);
  assert.doesNotMatch(svg, /tracking\.png|image\/svg\+xml;base64/);
});

test('PPTX is a real package with editable cards, text, connectors, arrow ends, links and images', () => {
  const graph = sample();
  graph.nodes[0].paperstreamCard = { figures: [{ id: 'fig', src: PNG, caption: '', widthPercent: 100, naturalWidth: 2, naturalHeight: 1 }] };
  const before = JSON.stringify(graph), entries = unzipStored(exportGraphPptx(graph));
  assert.equal(JSON.stringify(graph), before);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml']) assert.ok(entries.has(name), name);
  const text = new TextDecoder().decode(entries.get('ppt/slides/slide1.xml'));
  assert.match(text, /<p:cxnSp>/);
  assert.match(text, /<a:stCxn id="2" idx="2"\/>/);
  assert.match(text, /<a:endCxn id="3" idx="0"\/>/);
  assert.match(text, /name="Card first"/);
  assert.match(text, /<a:t xml:space="preserve">A &lt; B &amp; &quot;C&quot;<\/a:t>/);
  assert.match(text, /<a:headEnd type="triangle"/);
  assert.match(text, /<a:tailEnd type="triangle"/);
  assert.match(text, /<p:pic>/);
  const links = new TextDecoder().decode(entries.get('ppt/slides/_rels/slide1.xml.rels'));
  assert.match(links, /TargetMode="External"/);
  assert.match(links, /Target="https:\/\/example.org\/\?a=1&amp;b=2"/);
  assert.deepEqual(entries.get('ppt/media/image1.png'), PNG_BYTES);
});

test('three-page PPTX follows page order and filters cards, connections and image relationships independently', () => {
  let graph = sample();
  graph.nodes[0].paperstreamCard = { figures: [{ id: 'fig', src: PNG, caption: '', widthPercent: 100, naturalWidth: 2, naturalHeight: 1 }] };
  graph = createPresentationPage(graph, { id: 'all', title: 'Overview & details', nodeIds: ['first', 'second'] });
  graph = createPresentationPage(graph, { id: 'next', title: 'Only Next', nodeIds: ['second'] });
  graph = createPresentationPage(graph, { id: 'again', title: 'First again', nodeIds: ['first'] });
  graph = movePresentationPage(graph, 'again', -1);
  const before = JSON.stringify(graph), entries = unzipStored(exportGraphPptx(graph));
  assert.equal(JSON.stringify(graph), before);
  const decode = (name: string) => new TextDecoder().decode(entries.get(name));
  assert.deepEqual([...entries.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)), ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide3.xml']);
  const slides = [1, 2, 3].map(number => decode(`ppt/slides/slide${number}.xml`));
  assert.match(slides[0], /<p:cSld name="Overview &amp; details">/);
  assert.match(slides[0], /name="Card first"/); assert.match(slides[0], /name="Card second"/); assert.match(slides[0], /<p:cxnSp>/);
  assert.match(slides[1], /<p:cSld name="First again">/); assert.match(slides[1], /name="Card first"/); assert.doesNotMatch(slides[1], /name="Card second"|<p:cxnSp>/);
  assert.match(slides[2], /<p:cSld name="Only Next">/); assert.match(slides[2], /name="Card second"/); assert.doesNotMatch(slides[2], /name="Card first"|<p:cxnSp>|<p:pic>/);
  assert.match(decode('ppt/presentation.xml'), /<p:sldId id="256" r:id="rId1"\/><p:sldId id="257" r:id="rId2"\/><p:sldId id="258" r:id="rId3"\/>/);
  assert.match(decode('ppt/presentation.xml'), /<p:sldMasterId id="2147483648" r:id="rId4"\/>/);
  assert.match(decode('ppt/_rels/presentation.xml.rels'), /Id="rId4"[^>]+Target="slideMasters\/slideMaster1.xml"/);
  for (const number of [1, 2, 3]) {
    assert.match(decode('[Content_Types].xml'), new RegExp(`PartName="/ppt/slides/slide${number}\\.xml"`));
    assert.match(decode('ppt/_rels/presentation.xml.rels'), new RegExp(`Target="slides/slide${number}\\.xml"`));
    const ids = [...slides[number - 1].matchAll(/<p:cNvPr id="(\d+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'shape IDs are unique within each slide');
    const relationships = decode(`ppt/slides/_rels/slide${number}.xml.rels`);
    for (const match of relationships.matchAll(/Target="\.\.\/media\/([^"]+)"/g)) assert.ok(entries.has(`ppt/media/${match[1]}`), match[1]);
  }
  assert.deepEqual(entries.get('ppt/media/slide1-image1.png'), PNG_BYTES);
  assert.deepEqual(entries.get('ppt/media/slide2-image1.png'), PNG_BYTES);
  assert.equal(entries.has('ppt/media/slide3-image1.png'), false);
});

test('manual relation labels and routing export at their saved positions with editable custom connectors', () => {
  const graph = sample();
  graph.edges[0].paperstreamStyle = { ...graph.edges[0].paperstreamStyle as object, labelPosition: { x: 750, y: -600 }, waypoints: [{ x: 1300, y: -1000 }, { x: 1300, y: 900 }] };
  const before = JSON.stringify(graph), scene = buildExportScene(graph), label = scene.edges[0].label!;
  assert.equal(label.x + label.width / 2, 750);
  assert.equal(label.y + (label.lines.length * 18 + 12) / 2, -600);
  assert.deepEqual(scene.edges[0].points.slice(1, -1), [{ x: 1300, y: -1000 }, { x: 1300, y: 900 }]);
  assert.ok(scene.bounds.x + scene.bounds.width > 1300 && scene.bounds.y < -1000 && scene.bounds.y + scene.bounds.height > 900);
  const svg = exportGraphSvg(graph), entries = unzipStored(exportGraphPptx(graph));
  assert.match(svg, /L 1300 -1000 L 1300 900/);
  const slide = new TextDecoder().decode(entries.get('ppt/slides/slide1.xml'));
  assert.match(slide, /<p:cxnSp>/); assert.match(slide, /<a:custGeom>/);
  assert.equal([...slide.matchAll(/<a:lnTo>/g)].length, 3);
  assert.equal(JSON.stringify(graph), before);
});

test('ZIP store writer supports Unicode names and preserves bytes', () => {
  const entries = unzipStored(createStoredZip([{ name: '图/原文.txt', bytes: new TextEncoder().encode('量子力学') }]));
  assert.equal(new TextDecoder().decode(entries.get('图/原文.txt')), '量子力学');
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
