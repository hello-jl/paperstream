import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addEdge, addNode, createCanvas, createEdge, createPaperNode, parseCanvas, serializeCanvas } from './canvas.ts';
import { createRelationNode, isRelationNode, promoteEdgeRelation } from './graph-relations.ts';

function fixture() {
  let graph = createCanvas();
  graph = addNode(graph, createPaperNode({ alias: 'A', takeaway: 'one' }, { id: 'a' }));
  graph = addNode(graph, createPaperNode({ alias: 'B', takeaway: 'two' }, { id: 'b', y: 500 }));
  graph = addNode(graph, createPaperNode({ alias: 'C', takeaway: 'three' }, { id: 'c', x: 500 }));
  return graph;
}

test('a shared relation is portable text and accepts multiple incoming edges including empty labels', () => {
  const node = createRelationNode('同一研究问题', { id: 'r' });
  let graph = addNode(fixture(), node);
  for (const id of ['a', 'b', 'c']) graph = addEdge(graph, createEdge(id, 'r', ''));
  const loaded = parseCanvas(serializeCanvas(graph));
  assert.equal(loaded.edges.length, 3);
  assert.equal(loaded.nodes.find(n => n.id === 'r')?.text, '同一研究问题');
  assert.equal(isRelationNode(node), true);
  assert.equal(isRelationNode(loaded.nodes[0]), false);
  assert.equal(createRelationNode('').text, '');
});

test('promoting a label retains endpoint arrows, original ID and unknown metadata without mutating input', () => {
  for (const fromEnd of ['none', 'arrow'] as const) for (const toEnd of ['none', 'arrow'] as const) {
    const graph = addEdge(fixture(), { ...createEdge('a', 'b', '共同说明', { id: 'edge' }),
      fromEnd, toEnd, custom: { kept: [1, 2] }, paperstreamStyle: { strokeWidth: 4, future: true } });
    const before = serializeCanvas(graph);
    const result = promoteEdgeRelation(graph, 'edge');
    assert.equal(serializeCanvas(graph), before);
    assert.equal(result.document.nodes.length, 4);
    assert.equal(result.document.nodes.at(-1)?.text, '共同说明');
    const [first, last] = result.document.edges;
    assert.equal(first.id, 'edge'); assert.equal(first.fromEnd, fromEnd); assert.equal(first.toEnd, 'none');
    assert.equal(last.fromEnd, 'none'); assert.equal(last.toEnd, toEnd);
    assert.equal(first.toNode, result.nodeId); assert.equal(last.fromNode, result.nodeId);
    assert.equal(last.toNode, 'b');
    assert.deepEqual(first.custom, { kept: [1, 2] });
    assert.deepEqual(last.paperstreamStyle, first.paperstreamStyle);
    assert.equal(parseCanvas(serializeCanvas(result.document)).edges.length, 2);
  }
  assert.throws(() => promoteEdgeRelation(fixture(), 'missing'));
});
