import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, addNode, createCanvas, createEdge, createPaperNode, readPaper, serializeCanvas } from './canvas.ts';
import { restoreEditorDraft } from './draft-recovery.ts';

function fixture() {
  let canvas = addNode(createCanvas(), createPaperNode({ alias: 'A', takeaway: 'Original', name: 'Full title', year: 2020, url: 'https://example.org' }, { id: 'a' }));
  canvas = addNode(canvas, createPaperNode({ alias: 'B', takeaway: 'Other' }, { id: 'b' }));
  canvas = addNode(canvas, { id: 'note', type: 'text', x: -30, y: 50, width: 300, height: 180, label: 'Note', text: '- First', paperstreamCard: { kind: 'note', custom: ['keep'] } });
  return { ...canvas, custom: { keep: ['top', { untouched: true }] }, paperstreamPresentation: { pages: [{ id: 'page', title: 'Slide', nodeIds: ['a', 'note'], extra: 'keep' }] } };
}

test('only absent drafts start fresh; malformed recovery is quarantined without modifying its input', () => {
  const fresh = restoreEditorDraft(undefined);
  assert.equal(fresh.restored, false); assert.equal(fresh.recoveryError, '');
  assert.deepEqual(fresh.canvas.nodes, []); assert.equal(fresh.canvas.paperstreamLayout, 'vertical');
  const invalid = { canvas: { nodes: [{ id: 'broken' }], edges: [] }, form: { alias: 'Precious input', year: '202x' }, formDirty: true };
  const original = structuredClone(invalid), recovered = restoreEditorDraft(invalid);
  assert.equal(recovered.restored, false); assert.match(recovered.recoveryError, /暂停覆盖/);
  assert.deepEqual(invalid, original);
  for (const value of [null, '{broken JSON', { canvas: fixture(), form: { alias: 2 } }]) {
    const result = restoreEditorDraft(value);
    assert.equal(result.restored, false); assert.ok(result.recoveryError);
  }
  const undefinedData = { canvas: { ...fixture(), unknown: undefined } };
  assert.ok(restoreEditorDraft(undefinedData).recoveryError);
  assert.equal(Object.hasOwn(undefinedData.canvas, 'unknown'), true);
});

test('legacy connection uses the edited endpoints, omits undefined sides, and does not mutate old form values', () => {
  const canvas = fixture(), saved = serializeCanvas(canvas);
  const draft = { canvas, saved, selection: { kind: 'connection', source: 'a', target: 'b', toSide: 'left', fromSide: undefined },
    form: { source: 'b', target: 'a', relation: '', weight: '3', evidence: 'Reading notes' }, formDirty: true };
  const recovered = restoreEditorDraft(draft), edge = recovered.canvas.edges[0];
  assert.equal(recovered.recoveryError, ''); assert.equal(recovered.restored, true);
  assert.deepEqual(recovered.selection, { kind: 'edge', id: edge.id });
  assert.equal(edge.fromNode, 'b'); assert.equal(edge.toNode, 'a'); assert.equal(edge.label, '');
  assert.equal(Object.hasOwn(edge, 'fromSide'), false); assert.equal(edge.toSide, 'left');
  assert.deepEqual(recovered.form, { relation: '', weight: '3', evidence: 'Reading notes' });
  assert.equal(draft.form.source, 'b'); assert.equal(draft.form.target, 'a'); assert.equal(draft.canvas.edges.length, 0);
  assert.equal(recovered.saved, saved); assert.equal(recovered.formDirty, true);
  const missing = restoreEditorDraft({ ...draft, form: { ...draft.form, source: 'missing' } });
  assert.equal(missing.restored, false); assert.ok(missing.recoveryError);
});

test('legacy new-paper form becomes a real card while preserving blank text and uncommitted metadata', () => {
  const canvas = fixture(), saved = serializeCanvas(canvas);
  const form = { alias: '', takeaway: '', name: 'New full title', url: 'https://example.org/new', year: '2024', customInput: 'kept' };
  const recovered = restoreEditorDraft({ canvas, saved, selection: { kind: 'new' }, form, formDirty: true, inlineField: 'alias' });
  assert.equal(recovered.recoveryError, ''); assert.equal(recovered.canvas.nodes.length, canvas.nodes.length + 1);
  const node = recovered.canvas.nodes.at(-1)!;
  assert.deepEqual(recovered.selection, { kind: 'node', id: node.id });
  assert.equal(readPaper(node)?.alias, ''); assert.equal(readPaper(node)?.takeaway, '');
  assert.deepEqual(recovered.form, form); assert.notEqual(recovered.form, form);
  assert.equal(recovered.inlineField, 'alias'); assert.equal(recovered.formDirty, true);
  assert.equal(recovered.saved, saved); assert.equal(canvas.nodes.length, 3);
});

test('existing note and shared-text inline fields, empty values, and invalid in-progress input survive recovery', () => {
  const canvas = fixture();
  for (const inlineField of ['text', 'label']) {
    const result = restoreEditorDraft(JSON.stringify({ canvas, selection: { kind: 'node', id: 'note' }, inlineField,
      form: { text: '', label: '', year: '202x' }, formDirty: true, inlineBaseline: { value: 'Before', wasDirty: true } }));
    assert.equal(result.recoveryError, ''); assert.equal(result.inlineField, inlineField);
    assert.deepEqual(result.form, { text: '', label: '', year: '202x' });
    assert.deepEqual(result.inlineBaseline, { value: 'Before', wasDirty: true });
    assert.equal(result.formDirty, true); assert.equal(result.canvas.nodes[2].text, '- First');
  }
  const mismatch = restoreEditorDraft({ canvas, selection: { kind: 'node', id: 'note' }, inlineField: 'alias' });
  assert.equal(mismatch.inlineField, null); assert.equal(mismatch.inlineBaseline, null);
});

test('current drafts preserve all Canvas metadata, file generation, save baseline and empty relation input', () => {
  const graph = fixture(), edge = { ...createEdge('a', 'b', 'Old relation', { id: 'edge' }), paperstreamStyle: { waypoints: [{ x: -20, y: 80, extra: true }], labelPosition: { x: -40, y: 90 }, unknown: { keep: true } } };
  const canvas = addEdge(graph, edge), saved = serializeCanvas(canvas), snapshot = structuredClone(canvas);
  const recovered = restoreEditorDraft({ canvas, saved, fileName: 'research.canvas', fileBindingId: 'generation-7', selection: { kind: 'edge', id: edge.id },
    form: { relation: '' }, formDirty: false, inlineField: 'relation', inlineBaseline: { value: 'Old relation', wasDirty: false } });
  assert.equal(recovered.recoveryError, ''); assert.equal(recovered.restored, true);
  assert.deepEqual(recovered.canvas, snapshot); assert.notEqual(recovered.canvas, canvas);
  assert.equal(recovered.saved, saved); assert.equal(recovered.fileName, 'research.canvas'); assert.equal(recovered.fileBindingId, 'generation-7');
  assert.equal(recovered.inlineField, 'relation'); assert.equal(recovered.form.relation, ''); assert.equal(recovered.formDirty, false);
  (recovered.canvas.custom as { keep: unknown[] }).keep.push('editor change');
  assert.deepEqual(canvas, snapshot);
});
