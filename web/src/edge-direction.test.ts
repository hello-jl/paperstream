import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CanvasError, createEdge, createPaperNode, parseCanvas, patchEdge, serializeCanvas,
} from './canvas.ts';
import type { CanvasEdge, JSONCanvasDocument } from './canvas.ts';
import { directionPatch, readEdgeDirection } from './edge-direction.ts';
import type { EdgeDirection, EdgeDirectionPatch } from './edge-direction.ts';

const directions: [EdgeDirection, EdgeDirectionPatch][] = [
  ['forward', { fromEnd: 'none', toEnd: 'arrow' }],
  ['reverse', { fromEnd: 'arrow', toEnd: 'none' }],
  ['both', { fromEnd: 'arrow', toEnd: 'arrow' }],
  ['none', { fromEnd: 'none', toEnd: 'none' }],
];

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
}

test('missing endpoint markers use JSON Canvas defaults without rewriting the edge', () => {
  const edge = createEdge('one', 'two', '方法比较');
  const original = { ...edge };
  assert.equal(readEdgeDirection(edge), 'forward');
  assert.equal(readEdgeDirection({ ...edge, fromEnd: 'arrow' }), 'both');
  assert.equal(readEdgeDirection({ ...edge, toEnd: 'none' }), 'none');
  assert.equal(readEdgeDirection({ ...edge, fromEnd: 'arrow', toEnd: 'none' }), 'reverse');
  assert.deepEqual(edge, original);
});

test('all four directions map to explicit markers and can replace any previous direction', () => {
  const original = createEdge('one', 'two', '方法比较');
  for (const [previous, previousMarkers] of directions) {
    for (const [next, markers] of directions) {
      const edge = { ...original, ...previousMarkers };
      deepFreeze(edge);
      const patch = directionPatch(next);
      assert.deepEqual(patch, markers);
      assert.equal(readEdgeDirection({ ...edge, ...patch }), next);
      assert.equal(readEdgeDirection(edge), previous);
      assert.deepEqual(Object.keys(patch).sort(), ['fromEnd', 'toEnd']);
    }
  }
});

test('direction changes round-trip while preserving IDs, geometry, relation and unknown fields', () => {
  const edge: CanvasEdge = { ...createEdge('one', 'two', '不交换端点，只修改箭头', { id: 'relation' }),
    fromSide: 'left', toSide: 'bottom', color: '4',
    paperstreamStyle: { strokeWidth: 6, future: { keep: ['style'] } },
    routing: { points: [{ x: -30, y: 60 }] },
  };
  const document: JSONCanvasDocument = {
    nodes: ['one', 'two'].map((id, index) => createPaperNode({ alias: id, takeaway: '保留论文内容' },
      { id, x: index * 500, y: -100 })),
    edges: [edge, createEdge('two', 'one', '另一条关系', { id: 'other' })],
    custom: { keep: true },
  };
  const original = serializeCanvas(document);
  deepFreeze(document);
  for (const [direction, markers] of directions) {
    const updated = patchEdge(document, edge.id, directionPatch(direction));
    const restored = parseCanvas(serializeCanvas(updated));
    assert.equal(readEdgeDirection(restored.edges[0]), direction);
    assert.deepEqual(restored.edges[0], { ...edge, ...markers });
    assert.deepEqual(restored.edges[1], document.edges[1]);
    assert.deepEqual(restored.nodes, document.nodes);
    assert.deepEqual(restored.custom, document.custom);
  }
  assert.equal(serializeCanvas(document), original);
});

test('invalid direction values fail before a graph can be changed', () => {
  for (const value of ['', 'backward', 'bidirectional', 'arrow', 1, null, undefined, {}, []]) {
    assert.throws(() => directionPatch(value as EdgeDirection), CanvasError);
  }
  const patch = directionPatch('both');
  patch.fromEnd = 'none';
  assert.deepEqual(directionPatch('both'), { fromEnd: 'arrow', toEnd: 'arrow' });
});
