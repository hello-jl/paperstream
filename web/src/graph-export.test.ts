import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addEdge, addNode, createCanvas, createEdge, createPaperNode } from './canvas.ts';
import type { JSONCanvasDocument } from './canvas.ts';
import { buildExportScene, createStoredZip, exportGraphPptx, exportGraphSvg, wrapExportText } from './graph-export.ts';
import { createPresentationPage, movePresentationPage } from './presentation-pages.ts';

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
    { id: 'png', src: 'data:image/png;base64,AQIDBA==', widthPercent: 50, naturalWidth: 200, naturalHeight: 100, caption: 'Figure <1>' },
    { id: 'remote', src: 'https://example.org/tracking.png' },
    { id: 'svg', src: 'data:image/svg+xml;base64,PHN2Zy8+' },
  ] };
  const scene = buildExportScene(graph), svg = exportGraphSvg(graph);
  assert.equal(scene.nodes[0].figures.length, 1);
  assert.equal(scene.nodes[0].figures[0].width, 130);
  assert.equal(scene.nodes[0].figures[0].height, 65);
  assert.match(svg, /data:image\/png;base64,AQIDBA==/);
  assert.match(svg, /Figure &lt;1&gt;/);
  assert.doesNotMatch(svg, /tracking\.png|image\/svg\+xml;base64/);
});

test('PPTX is a real package with editable cards, text, connectors, arrow ends, links and images', () => {
  const graph = sample();
  graph.nodes[0].paperstreamCard = { figures: [{ id: 'fig', src: 'data:image/png;base64,AQIDBA==', caption: '', widthPercent: 100, naturalWidth: 2, naturalHeight: 1 }] };
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
  assert.deepEqual(entries.get('ppt/media/image1.png'), new Uint8Array([1, 2, 3, 4]));
});

test('three-page PPTX follows page order and filters cards, connections and image relationships independently', () => {
  let graph = sample();
  graph.nodes[0].paperstreamCard = { figures: [{ id: 'fig', src: 'data:image/png;base64,AQIDBA==', caption: '', widthPercent: 100 }] };
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
  assert.deepEqual(entries.get('ppt/media/slide1-image1.png'), new Uint8Array([1, 2, 3, 4]));
  assert.deepEqual(entries.get('ppt/media/slide2-image1.png'), new Uint8Array([1, 2, 3, 4]));
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
