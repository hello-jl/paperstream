import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addNode, addEdge, createCanvas, createPaperNode, createEdge, readPaper, parseCanvas, serializeCanvas } from './canvas.ts';
import { editField } from './live-edit.ts';
function fixture() {
  const a = createPaperNode({ alias: 'A', takeaway: 'Original', url: 'https://example.org', year: 2020 }, { id: 'a' });
  const b = createPaperNode({ alias: 'B', takeaway: 'Other' }, { id: 'b' });
  let graph = addNode(addNode(createCanvas(), a), b);
  const edge = { ...createEdge('a', 'b', 'Old', { id: 'edge' }), paperstreamStyle: { custom: { keep: true }, strokeWidth: 2 } };
  return addEdge(graph, edge);
}
test('each live input is immediately serializable, including clearing paper text', () => {
  let graph = fixture();
  for (const value of ['', 'R', 'Re', 'ResNet']) {
    graph = editField(graph, { kind: 'node', id: 'a' }, 'alias', value);
    assert.equal(readPaper(parseCanvas(serializeCanvas(graph)).nodes[0])?.alias, value);
  }
  graph = editField(graph, { kind: 'node', id: 'a' }, 'takeaway', '');
  assert.equal(readPaper(graph.nodes[0])?.takeaway, '');
});
test('independent field edits preserve other metadata and reject invalid input without mutation', () => {
  const original = fixture(), snapshot = serializeCanvas(original);
  assert.throws(() => editField(original, { kind: 'node', id: 'a' }, 'url', 'https://'));
  assert.throws(() => editField(original, { kind: 'node', id: 'a' }, 'year', '0'));
  assert.equal(serializeCanvas(original), snapshot);
  const changed = editField(original, { kind: 'node', id: 'a' }, 'takeaway', '- Live\n- Edit');
  assert.equal(readPaper(changed.nodes[0])?.url, 'https://example.org');
  assert.deepEqual(changed.nodes[1], original.nodes[1]);
});
test('live relation text, direction and styling compose without losing extensions', () => {
  let graph = fixture();
  for (const [key, value] of [['relation', ''], ['strokeWidth', '4'], ['arrowShape', 'open'], ['direction', 'both'], ['weight', '3']]) graph = editField(graph, { kind: 'edge', id: 'edge' }, key, value);
  assert.equal(graph.edges[0].label, ''); assert.equal(graph.edges[0].fromEnd, 'arrow'); assert.equal(graph.edges[0].toEnd, 'arrow');
  assert.deepEqual(graph.edges[0].paperstreamStyle, { custom: { keep: true }, strokeWidth: 4, arrowShape: 'open', weight: 3 });
});
