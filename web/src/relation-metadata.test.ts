import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas, createPaperNode, createEdge, addNode, addEdge, patchEdge, parseCanvas, serializeCanvas, CanvasError } from './canvas.ts';
import { getEdgeStrokeWidth, getNodeStrokeWidth, setEdgeAppearance } from './appearance.ts';
import { readRelationMetadata, relationMetadataPatch, relationWeightStrokeWidth, relationWeightWidthPatch } from './relation-metadata.ts';
import type { RelationMetadataUpdate } from './relation-metadata.ts';

function graph() {
  let document = addNode(addNode(createCanvas(), createPaperNode({ alias: 'A', takeaway: 'Original' }, { id: 'a' })), createPaperNode({ alias: 'B', takeaway: 'Later' }, { id: 'b' }));
  const edge = createEdge('a', 'b', 'Preserve this label', { id: 'ab' });
  edge.paperstreamRelation = { future: { references: ['doi:123'] } };
  edge.paperstreamStyle = { strokeWidth: 6, future: { keep: [1, 2] }, labelPosition: { x: 40, y: 50 } };
  document = addEdge(document, edge); return document;
}
test('relation annotations and multiline evidence roundtrip while preserving labels, layout and unknown metadata', () => {
  const source = graph(), before = JSON.stringify(source), edge = source.edges[0];
  const evidence = '- Sec. 3, p. 4: residual mapping\nhttps://example.org/paper#section-3\n个人判断，待复核。📝';
  const next = patchEdge(source, edge.id, relationMetadataPatch(edge, { type: 'inheritance', evidence, weight: 4 }));
  const restored = parseCanvas(serializeCanvas(next)), updated = restored.edges[0];
  assert.deepEqual(readRelationMetadata(updated), { type: 'inheritance', evidence, weight: 4 });
  assert.deepEqual(updated.paperstreamRelation, { future: { references: ['doi:123'] }, type: 'inheritance', evidence });
  assert.deepEqual(updated.paperstreamStyle, { ...edge.paperstreamStyle as object, weight: 4 });
  assert.equal(updated.label, edge.label); assert.deepEqual(restored.nodes, source.nodes);
  assert.equal(JSON.stringify(source), before); assert.equal(getEdgeStrokeWidth(updated), 6);
});
test('unannotated and unknown imported values are readable without inventing annotations or erasing future data', () => {
  const edge = createEdge('a', 'b', '');
  assert.deepEqual(readRelationMetadata(edge), { evidence: '' });
  assert.deepEqual(relationMetadataPatch(edge, {}), {});
  const imported = { ...edge, paperstreamRelation: { type: 'future-kind', evidence: 5, unknown: true }, paperstreamStyle: { weight: 42, strokeWidth: 3 } };
  const before = JSON.stringify(imported);
  assert.deepEqual(readRelationMetadata(imported), { evidence: '' });
  assert.throws(() => relationWeightWidthPatch(imported), CanvasError);
  assert.equal(JSON.stringify(imported), before);
  assert.deepEqual(relationMetadataPatch(imported, { weight: 2 }), { paperstreamStyle: { weight: 2, strokeWidth: 3 } });
});
test('clearing type or weight removes only that annotation and does not reset manual width', () => {
  const source = graph(), edge = source.edges[0];
  let next = patchEdge(source, edge.id, relationMetadataPatch(edge, { type: 'comparison', evidence: 'Table 1', weight: 2 }));
  next = patchEdge(next, edge.id, relationMetadataPatch(next.edges[0], { type: null, weight: null }));
  assert.deepEqual(readRelationMetadata(next.edges[0]), { evidence: 'Table 1' });
  assert.deepEqual(next.edges[0].paperstreamRelation, { future: { references: ['doi:123'] }, evidence: 'Table 1' });
  assert.deepEqual(next.edges[0].paperstreamStyle, edge.paperstreamStyle);
});
test('weight-to-width mapping is explicit, repeatable and independent from later annotation or visual edits', () => {
  const source = graph(), before = JSON.stringify(source), edge = source.edges[0];
  let next = patchEdge(source, edge.id, relationMetadataPatch(edge, { weight: 5 }));
  assert.equal(getEdgeStrokeWidth(next.edges[0]), 6);
  next = patchEdge(next, edge.id, relationWeightWidthPatch(next.edges[0]));
  assert.equal(getEdgeStrokeWidth(next.edges[0]), 3.8); assert.equal(readRelationMetadata(next.edges[0]).weight, 5);
  next = patchEdge(next, edge.id, relationMetadataPatch(next.edges[0], { weight: 1 }));
  assert.equal(getEdgeStrokeWidth(next.edges[0]), 3.8);
  next = patchEdge(next, edge.id, { paperstreamStyle: setEdgeAppearance(next.edges[0], { strokeWidth: 7 }).paperstreamStyle });
  assert.equal(readRelationMetadata(next.edges[0]).weight, 1); assert.equal(getEdgeStrokeWidth(next.edges[0]), 7);
  assert.equal(getNodeStrokeWidth(next.nodes[0]), getNodeStrokeWidth(source.nodes[0]));
  assert.deepEqual(next.nodes, source.nodes); assert.equal(JSON.stringify(source), before);
  assert.deepEqual([1, 2, 3, 4, 5].map(relationWeightStrokeWidth), [1.4, 2, 2.6, 3.2, 3.8]);
});
test('invalid updates and incompatible containers reject changes without mutation, but independent containers remain editable', () => {
  const edge = graph().edges[0], before = JSON.stringify(edge);
  for (const update of [{ type: 'causes' }, { type: undefined }, { evidence: null }, { evidence: '\u0000' }, { evidence: '\ud800' }, { evidence: undefined }, ...[0, 6, 1.2, NaN, Infinity, '3', undefined].map(weight => ({ weight })), { unknown: true }]) {
    assert.throws(() => relationMetadataPatch(edge, update as RelationMetadataUpdate), CanvasError);
  }
  assert.equal(JSON.stringify(edge), before);
  for (const malformed of [null, false, 3, 'future', ['keep']]) {
    const relation = { ...edge, paperstreamRelation: malformed }, style = { ...edge, paperstreamStyle: malformed };
    const relationBefore = JSON.stringify(relation), styleBefore = JSON.stringify(style);
    assert.throws(() => relationMetadataPatch(relation, { evidence: 'Edit' }), /原数据已保留/);
    assert.throws(() => relationMetadataPatch(style, { weight: 3 }), /原数据已保留/);
    assert.ok(relationMetadataPatch(relation, { weight: 3 }).paperstreamStyle);
    assert.ok(relationMetadataPatch(style, { evidence: 'Edit' }).paperstreamRelation);
    assert.deepEqual(relationMetadataPatch(relation, {}), {});
    assert.equal(JSON.stringify(relation), relationBefore); assert.equal(JSON.stringify(style), styleBefore);
  }
});
