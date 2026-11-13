import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patchEdge, patchNode, validateCanvas } from './canvas.ts';
import type { JSONCanvasDocument } from './canvas.ts';
import { sameCanvasSnapshot } from './canvas-snapshot.ts';

function fixture(extension: unknown = null): JSONCanvasDocument {
  return {
    nodes: [
      { id: 'a', type: 'text', text: 'First', x: 0, y: 0, width: 240, height: 120 },
      { id: 'b', type: 'text', text: 'Second', x: 0, y: 300, width: 240, height: 120 },
    ],
    edges: [{ id: 'relation', fromNode: 'a', toNode: 'b', label: '' }],
    extension,
  };
}

function agreesWithSerialization(left: JSONCanvasDocument, right: JSONCanvasDocument): void {
  // This validation is part of the comparator's contract, and deliberately
  // precedes it. The Editor must retain the same ordering.
  validateCanvas(left);
  validateCanvas(right);
  assert.equal(sameCanvasSnapshot(left, right), JSON.stringify(left) === JSON.stringify(right));
}

test('ordered snapshot comparison matches JSON values, unknown fields, empty values and signed zero', () => {
  const extension = {
    nested: [null, false, true, '', [], {}, -0, 0, 1.25, '\"\\\n中文😀'],
    nullPrototype: Object.assign(Object.create(null), { retained: 'value' }),
  };
  const original = fixture(extension);
  const copy = JSON.parse(JSON.stringify(original)) as JSONCanvasDocument;
  agreesWithSerialization(original, copy);
  assert.ok(sameCanvasSnapshot(original, copy), 'JSON serializes -0 and 0 identically');
  for (const value of [null, '', [], {}, false, 0, [''], { value: null }]) {
    agreesWithSerialization(original, { ...original, extension: value });
  }
  agreesWithSerialization(original, { ...original, newUnknownField: null });
  const withoutExtension = { ...original };
  delete withoutExtension.extension;
  agreesWithSerialization(original, withoutExtension);
});

test('object property order, integer key ordering, and array order have JSON.stringify semantics', () => {
  const original = fixture({ first: 1, second: 2 });
  const reordered = fixture({ second: 2, first: 1 });
  agreesWithSerialization(original, reordered);
  assert.equal(sameCanvasSnapshot(original, reordered), false);
  agreesWithSerialization(original, { extension: original.extension, nodes: original.nodes, edges: original.edges });
  agreesWithSerialization(fixture({ 2: 'two', 1: 'one', rest: true }), fixture({ 1: 'one', 2: 'two', rest: true }));
  agreesWithSerialization(original, { ...original, nodes: [...original.nodes].reverse() });
  agreesWithSerialization(fixture([1, 2]), fixture([2, 1]));
  agreesWithSerialization(fixture(['a']), fixture({ 0: 'a' }));

  const extendedArray = ['a', 'b'] as string[] & { note?: string };
  extendedArray.note = 'ignored by JSON.stringify';
  agreesWithSerialization(fixture(extendedArray), fixture(['a', 'b']));
});

test('editing then restoring a value is equal without retaining stale results between calls', () => {
  const original = fixture({ nested: { value: 'original' } });
  const changed = patchEdge(original, 'relation', { label: 'new relation' });
  agreesWithSerialization(original, changed);
  assert.equal(sameCanvasSnapshot(original, changed), false);
  const restored = patchEdge(changed, 'relation', { label: '' });
  agreesWithSerialization(original, restored);
  assert.ok(sameCanvasSnapshot(original, restored));
  assert.notStrictEqual(original.edges[0], restored.edges[0]);

  // These are separate snapshots on every comparison. Reusing the same pair
  // later cannot reuse a persistent deep-equality cache.
  const copy = structuredClone(original);
  assert.ok(sameCanvasSnapshot(original, copy));
  (copy.extension as { nested: { value: string } }).nested.value = 'changed between comparisons';
  assert.equal(sameCanvasSnapshot(original, copy), false);
  (copy.extension as { nested: { value: string } }).nested.value = 'original';
  assert.ok(sameCanvasSnapshot(original, copy));
});

test('100 image-bearing cards keep their unchanged references across successive relation edits', () => {
  const image = `data:image/png;base64,${'A'.repeat(64 * 1024)}`;
  const base = fixture();
  const original: JSONCanvasDocument = {
    ...base,
    nodes: Array.from({ length: 100 }, (_, index) => Object.freeze({
      ...base.nodes[0], id: `n${index}`, y: index * 200,
      extension: Object.freeze({ image, nested: Object.freeze([index, null, false]) }),
    })),
    edges: [{ ...base.edges[0], fromNode: 'n0', toNode: 'n99' }],
  };
  Object.freeze(original.nodes);
  const sourceBefore = JSON.stringify(original);
  let previous = original;
  for (const label of ['a', 'ab', '中文 relation', '']) {
    const next = patchEdge(previous, 'relation', { label });
    assert.strictEqual(next.nodes, original.nodes);
    assert.ok(next.nodes.every((node, index) => node === original.nodes[index]));
    agreesWithSerialization(previous, next);
    agreesWithSerialization(original, next);
    previous = next;
  }
  assert.ok(sameCanvasSnapshot(original, previous), 'restored relation is a no-op even with new edge references');
  agreesWithSerialization(original, patchNode(original, 'n50', { text: 'Changed card' }));
  assert.equal(JSON.stringify(original), sourceBefore, 'comparison never mutates either snapshot');
});

test('deterministic nested JSON samples agree with direct serialization', () => {
  let seed = 0x5139ab;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const value = (depth: number): unknown => {
    const option = random() % (depth ? 8 : 5);
    if (option === 0) return null;
    if (option === 1) return Boolean(random() % 2);
    if (option === 2) return (random() % 2000 - 1000) / 8;
    if (option === 3) return ['中文', '', '\n\\"', '😀'][random() % 4];
    if (option === 4) return -0;
    if (option === 5) return Array.from({ length: random() % 5 }, () => value(depth - 1));
    const result: Record<string, unknown> = {};
    for (let count = random() % 5, index = 0; index < count; index++) result[`key-${index}`] = value(depth - 1);
    return result;
  };
  for (let index = 0; index < 200; index++) {
    const original = fixture(value(4));
    agreesWithSerialization(original, JSON.parse(JSON.stringify(original)) as JSONCanvasDocument);
    agreesWithSerialization(original, fixture(value(4)));
    agreesWithSerialization(original, patchEdge(original, 'relation', { label: `edit-${index}` }));
  }
});

test('callers reject invalid snapshots before comparison rather than converting them into equal JSON', () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const invalid of [undefined, NaN, Infinity, 2n, () => {}, Symbol('invalid'), cycle, new Date(0), [,]]) {
    const snapshot = { ...fixture(), extension: invalid };
    assert.throws(() => {
      validateCanvas(snapshot);
      sameCanvasSnapshot(snapshot, snapshot);
    });
  }
});
