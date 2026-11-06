import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPaperNode, parseCanvas, patchNode, serializeCanvas } from './canvas.ts';
import {
  addFigurePatch, cardKindPatch, figureFromFile, getCardKind, readFigures, removeFigurePatch, takeawayBlocks, updateFigurePatch,
} from './card-media.ts';
import type { CardFigure } from './card-media.ts';

const image: CardFigure = { id: 'fig-1', src: 'data:image/png;base64,iVBORw0KGgo=', caption: '测试图',
  widthPercent: 100, naturalWidth: 800, naturalHeight: 400 };
const node = () => createPaperNode({ alias: 'Paper', takeaway: '- 第一条\n- 第二条' }, { id: 'paper' });

test('embedded figures and card kinds round-trip without changing paper data or unknown fields', () => {
  const original = { ...node(), paperstreamCard: { custom: { nested: ['keep'] }, figures: [{ future: 'unknown' }] } };
  const before = JSON.stringify(original);
  let document = { nodes: [original], edges: [] };
  document = patchNode(document, original.id, addFigurePatch(original, image)) as typeof document;
  document = patchNode(document, original.id, cardKindPatch(document.nodes[0], 'page')) as typeof document;
  const restored = parseCanvas(serializeCanvas(document));
  assert.deepEqual(readFigures(restored.nodes[0]), [image]);
  assert.equal(getCardKind(restored.nodes[0], true), 'page');
  assert.equal(restored.nodes[0].text, original.text);
  assert.deepEqual((restored.nodes[0].paperstreamCard as Record<string, unknown>).custom, { nested: ['keep'] });
  assert.deepEqual((restored.nodes[0].paperstreamCard as { figures: unknown[] }).figures[0], { future: 'unknown' });
  assert.equal(JSON.stringify(original), before);
});

test('resizing and removal preserve unknown figure entries and extension keys', () => {
  const original = { ...node(), paperstreamCard: { kind: 'note', custom: 2, figures: [{ ...image, future: [7] }, { id: 'other', format: 'future' }] } };
  const resized = { ...original, ...updateFigurePatch(original, image.id, { widthPercent: 35, caption: '局部图' }) };
  assert.equal(readFigures(resized)[0].widthPercent, 35);
  assert.equal(readFigures(resized)[0].caption, '局部图');
  assert.deepEqual(readFigures(resized)[0].future, [7]);
  const removed = { ...resized, ...removeFigurePatch(resized, image.id) };
  assert.deepEqual(removed.paperstreamCard, { kind: 'note', custom: 2, figures: [{ id: 'other', format: 'future' }] });
  assert.equal(readFigures(original)[0].widthPercent, 100);
});

test('unsupported card/media formats remain readable and cannot be silently overwritten', () => {
  for (const extension of [false, null, 12, 'future', ['future']]) {
    const original = { ...node(), paperstreamCard: extension };
    assert.deepEqual(readFigures(original), []);
    assert.throws(() => addFigurePatch(original, image), /原数据已保留/);
    assert.throws(() => cardKindPatch(original, 'note'), /原数据已保留/);
  }
  const malformed = { ...node(), paperstreamCard: { figures: 'future' } };
  assert.throws(() => addFigurePatch(malformed, image), /原数据已保留/);
});

test('figures reject external/script URLs, SVG, invalid widths and duplicate IDs', () => {
  const original = { ...node(), ...addFigurePatch(node(), image) };
  for (const src of ['https://example.com/image.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,a']) {
    assert.throws(() => addFigurePatch(node(), { ...image, src }));
  }
  for (const widthPercent of [0, 14, 101, NaN, Infinity]) {
    assert.throws(() => updateFigurePatch(original, image.id, { widthPercent }));
  }
  assert.throws(() => addFigurePatch(original, image), /ID/);
  assert.throws(() => updateFigurePatch(original, image.id, { src: 'bad' } as never));
});

test('raster upload rejects empty, oversized and disguised SVG files before decoding', async () => {
  await assert.rejects(figureFromFile(new File([], 'empty.png', { type: 'image/png' })), /8 MB/);
  await assert.rejects(figureFromFile(new File(['<svg><script>bad</script></svg>'], 'fake.png', { type: 'image/png' })), /只支持/);
  const large = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png');
  await assert.rejects(figureFromFile(large), /8 MB/);
});

test('raster upload embeds original bytes and records decoded dimensions', async () => {
  const original = globalThis.createImageBitmap;
  let closed = false;
  globalThis.createImageBitmap = (async () => ({ width: 800, height: 400, close: () => { closed = true; } })) as typeof createImageBitmap;
  try {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const figure = await figureFromFile(new File([bytes], '结果.png', { type: 'image/png' }));
    assert.equal(figure.src, image.src);
    assert.equal(figure.caption, '结果.png');
    assert.equal(figure.widthPercent, 100);
    assert.equal(figure.naturalWidth, 800);
    assert.equal(figure.naturalHeight, 400);
    assert.match(figure.id, /^[0-9a-f]{32}$/);
    assert.equal(closed, true);
  } finally { globalThis.createImageBitmap = original; }
});

test('dash takeaways form separate safe list blocks, preserving ordinary text and blank lines', () => {
  assert.deepEqual(takeawayBlocks('介绍\n\n- A\n- <script>literal</script>\n结论\n- C'), [
    { type: 'paragraph', text: '介绍\n' }, { type: 'list', items: ['A', '<script>literal</script>'] },
    { type: 'paragraph', text: '结论' }, { type: 'list', items: ['C'] },
  ]);
  assert.deepEqual(takeawayBlocks('a-b\r\n- 单点'), [{ type: 'paragraph', text: 'a-b' }, { type: 'list', items: ['单点'] }]);
});
