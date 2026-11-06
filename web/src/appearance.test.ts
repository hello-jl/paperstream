import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CanvasError, createEdge, createPaperNode, parseCanvas, patchEdge, patchNode, serializeCanvas,
} from './canvas.ts';
import type { CanvasEdge, CanvasNode, JSONCanvasDocument } from './canvas.ts';
import {
  getEdgeStrokeWidth, getHeightMode, getNodeStrokeWidth, setEdgeAppearance, setNodeAppearance,
} from './appearance.ts';

const node = (): CanvasNode => createPaperNode({ alias: '论文', takeaway: '保留正文与布局。' },
  { id: 'one', x: -50, y: 100, width: 360, height: 220 });
const edge = (): CanvasEdge => createEdge('one', 'two', '方法比较', { id: 'relation' });

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
}

test('legacy cards and relations use defaults without adding extension data', () => {
  const card = node(), relation = edge();
  assert.equal(getNodeStrokeWidth(card), 1);
  assert.equal(getEdgeStrokeWidth(relation), 1.8);
  assert.equal(getHeightMode(card), 'auto');
  assert.equal(setNodeAppearance(card, { strokeWidth: 1, heightMode: 'auto' }), card);
  assert.equal(setEdgeAppearance(relation, { strokeWidth: 1.8 }), relation);
  assert.equal(Object.hasOwn(card, 'paperstreamStyle'), false);
  assert.equal(Object.hasOwn(relation, 'paperstreamStyle'), false);
});

test('appearance edits preserve unknown nested fields, paper text, and geometry', () => {
  const card = { ...node(), custom: { keep: ['value'] },
    paperstreamStyle: { future: { opacity: 0.7 }, heightMode: 'manual', strokeWidth: 2 } };
  const relation = { ...edge(), routing: { keep: [1, 2] },
    paperstreamStyle: { future: { dash: [2, 1] }, heightMode: 'unrelated', strokeWidth: 3 } };
  const before = JSON.stringify({ card, relation });
  deepFreeze(card); deepFreeze(relation);
  const changedCard = setNodeAppearance(card, { strokeWidth: 6 });
  const changedEdge = setEdgeAppearance(relation, { strokeWidth: 0.5 });
  assert.deepEqual(changedCard, { ...card, paperstreamStyle: { ...card.paperstreamStyle, strokeWidth: 6 } });
  assert.deepEqual(changedEdge, { ...relation, paperstreamStyle: { ...relation.paperstreamStyle, strokeWidth: 0.5 } });
  assert.equal(JSON.stringify({ card, relation }), before);
  assert.notEqual(changedCard.paperstreamStyle, card.paperstreamStyle);
  assert.notEqual(changedEdge.paperstreamStyle, relation.paperstreamStyle);
});

test('node and edge styles survive normal Canvas patches and disk serialization', () => {
  const first = node();
  const second = { ...node(), id: 'two' };
  const document: JSONCanvasDocument = { nodes: [first, second], edges: [edge()], unknownRoot: ['preserved'] };
  let changed = patchNode(document, first.id, { paperstreamStyle:
    setNodeAppearance(first, { strokeWidth: 8, heightMode: 'manual' }).paperstreamStyle });
  changed = patchEdge(changed, 'relation', { paperstreamStyle:
    setEdgeAppearance(changed.edges[0], { strokeWidth: 4.1 }).paperstreamStyle });
  const restored = parseCanvas(serializeCanvas(changed));
  assert.equal(getNodeStrokeWidth(restored.nodes[0]), 8);
  assert.equal(getHeightMode(restored.nodes[0]), 'manual');
  assert.equal(getEdgeStrokeWidth(restored.edges[0]), 4.1);
  assert.deepEqual(restored.nodes[1], document.nodes[1]);
  assert.equal(restored.nodes[0].text, first.text);
  assert.deepEqual(restored.unknownRoot, document.unknownRoot);
  assert.equal(document.nodes[0].paperstreamStyle, undefined);
  assert.equal(document.edges[0].paperstreamStyle, undefined);
});

test('resetting defaults removes only the edited settings and composes with patches', () => {
  const card = { ...node(), paperstreamStyle: { strokeWidth: 6, heightMode: 'manual', custom: [7] } };
  const reset = setNodeAppearance(card, { strokeWidth: 1, heightMode: 'auto' });
  assert.deepEqual(reset.paperstreamStyle, { custom: [7] });
  assert.equal(getHeightMode(reset), 'auto');
  const relation = { ...edge(), paperstreamStyle: { strokeWidth: 6 } };
  const resetEdge = setEdgeAppearance(relation, { strokeWidth: 1.8 });
  assert.deepEqual(resetEdge.paperstreamStyle, {});
  const document = { nodes: [node(), { ...node(), id: 'two' }], edges: [relation] };
  const patched = patchEdge(document, relation.id, { paperstreamStyle: resetEdge.paperstreamStyle });
  assert.equal(getEdgeStrokeWidth(parseCanvas(serializeCanvas(patched)).edges[0]), 1.8);
});

test('malformed extension containers are readable but cannot be overwritten by appearance controls', () => {
  for (const extension of [null, false, 'future-format', 2, ['preserve', 3]]) {
    const card = { ...node(), paperstreamStyle: extension };
    const relation = { ...edge(), paperstreamStyle: extension };
    const before = JSON.stringify({ card, relation });
    assert.equal(getNodeStrokeWidth(card), 1);
    assert.equal(getHeightMode(card), 'auto');
    assert.equal(getEdgeStrokeWidth(relation), 1.8);
    assert.equal(setNodeAppearance(card, {}), card);
    assert.equal(setEdgeAppearance(relation, {}), relation);
    assert.throws(() => setNodeAppearance(card, { heightMode: 'manual' }), /原数据已保留/);
    assert.throws(() => setEdgeAppearance(relation, { strokeWidth: 4 }), /原数据已保留/);
    assert.equal(JSON.stringify({ card, relation }), before);
  }
});

test('invalid widths and modes reject edits without mutating the source', () => {
  const card = node(), relation = edge();
  deepFreeze(card); deepFreeze(relation);
  for (const width of [0, 0.49, 8.01, -1, NaN, Infinity, -Infinity, '4', null, undefined]) {
    assert.throws(() => setNodeAppearance(card, { strokeWidth: width as number }), CanvasError);
    assert.throws(() => setEdgeAppearance(relation, { strokeWidth: width as number }), CanvasError);
  }
  for (const mode of ['', 'fixed', false, null, undefined]) {
    assert.throws(() => setNodeAppearance(card, { heightMode: mode as 'auto' }), CanvasError);
  }
  assert.equal(Object.hasOwn(card, 'paperstreamStyle'), false);
  assert.equal(Object.hasOwn(relation, 'paperstreamStyle'), false);
});

test('unrecognized setting values use safe display defaults and retain unrelated extension data', () => {
  const card = { ...node(), paperstreamStyle: { strokeWidth: 'heavy', heightMode: 'future', custom: 1 } };
  const relation = { ...edge(), paperstreamStyle: { strokeWidth: 0, custom: 2 } };
  assert.equal(getNodeStrokeWidth(card), 1);
  assert.equal(getHeightMode(card), 'auto');
  assert.equal(getEdgeStrokeWidth(relation), 1.8);
  const changed = setNodeAppearance(card, { heightMode: 'manual' });
  assert.deepEqual(changed.paperstreamStyle, { strokeWidth: 'heavy', heightMode: 'manual', custom: 1 });
  assert.deepEqual(card.paperstreamStyle, { strokeWidth: 'heavy', heightMode: 'future', custom: 1 });
  assert.deepEqual(setEdgeAppearance(relation, { strokeWidth: 2 }).paperstreamStyle, { strokeWidth: 2, custom: 2 });
});
