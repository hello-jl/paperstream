import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addNode, createCanvas, createPaperNode, patchNode, removeNode, serializeCanvas } from './canvas.ts';
import { createHostNodeEdits } from './host-node-edits.ts';
import { editField } from './live-edit.ts';

function fixture() {
  return addNode(addNode(createCanvas(), createPaperNode({ alias: 'Host', takeaway: 'Short content' }, { id: 'a', height: 480 })),
    createPaperNode({ alias: 'Untouched', takeaway: 'Other content' }, { id: 'b', height: 400 }));
}

test('undo restores an untouched host snapshot while redo retains measurement permission', () => {
  const edits = createHostNodeEdits(), original = fixture(), saved = serializeCanvas(original);
  assert.equal(edits.has(original.nodes[0]), false);
  const changed = editField(original, { kind: 'node', id: 'a' }, 'alias', 'Edited');
  edits.markChanges(original, changed);
  assert.equal(edits.has(changed.nodes[0]), true);
  assert.equal(edits.has(changed.nodes[1]), false);

  const fitted = patchNode(changed, 'a', { height: 120 });
  edits.inheritMeasurements(changed, fitted);
  assert.equal(edits.has(fitted.nodes[0]), true);

  // The editor restores history snapshots directly and only persists a new
  // measurement when that exact current snapshot has permission.
  const undone = original;
  const afterMeasure = edits.has(undone.nodes[0]) ? patchNode(undone, 'a', { height: 120 }) : undone;
  assert.equal(afterMeasure.nodes[0].height, 480);
  assert.equal(serializeCanvas(afterMeasure), saved);
  assert.equal(edits.has(fitted.nodes[0]), true, 'redo can finish measurements for an edited snapshot');
  const delayedImageMeasurement = patchNode(fitted, 'a', { height: 260 });
  edits.inheritMeasurements(fitted, delayedImageMeasurement);
  assert.equal(edits.has(delayedImageMeasurement.nodes[0]), true);
  assert.equal(serializeCanvas(original), saved);
});

test('new edits, drags and insertions after undo authorize only the new branch', () => {
  const edits = createHostNodeEdits(), original = fixture();
  const abandoned = editField(original, { kind: 'node', id: 'a' }, 'alias', 'Abandoned branch');
  edits.markChanges(original, abandoned);
  const branch = editField(original, { kind: 'node', id: 'a' }, 'takeaway', 'New branch');
  edits.markChanges(original, branch);
  assert.equal(edits.has(branch.nodes[0]), true);
  assert.equal(edits.has(original.nodes[0]), false);
  assert.equal(edits.has(branch.nodes[1]), false);

  const dragged = patchNode(original, 'b', { x: 16, y: 24 });
  edits.markChanges(original, dragged);
  assert.equal(edits.has(dragged.nodes[1]), true);
  assert.equal(edits.has(dragged.nodes[0]), false);

  const inserted = addNode(original, createPaperNode({ alias: 'New', takeaway: '' }, { id: 'new' }));
  edits.markChanges(original, inserted);
  assert.equal(edits.has(inserted.nodes[2]), true);
  assert.equal(edits.has(inserted.nodes[0]), false);
});

test('measurement layout copies inherit only authorized snapshots without changing document data', () => {
  const edits = createHostNodeEdits(), original = fixture();
  const changed = patchNode(original, 'a', { height: 300 });
  edits.markChanges(original, changed);
  const before = serializeCanvas(changed);
  const measured = { ...changed, nodes: changed.nodes.map(node => ({ ...node, y: node.y + 80 })) };
  const measuredBefore = serializeCanvas(measured);
  edits.inheritMeasurements(changed, measured);
  assert.equal(edits.has(measured.nodes[0]), true);
  assert.equal(edits.has(measured.nodes[1]), false);
  assert.equal(edits.has(original.nodes[0]), false);
  assert.equal(serializeCanvas(changed), before);
  assert.equal(serializeCanvas(measured), measuredBefore);

  const nextMeasurement = patchNode(measured, 'a', { height: 200 });
  edits.inheritMeasurements(measured, nextMeasurement);
  assert.equal(edits.has(nextMeasurement.nodes[0]), true);
  assert.equal(edits.has(nextMeasurement.nodes[1]), false);
});

test('deleted and re-added IDs and independently loaded documents do not inherit old authority', () => {
  const edits = createHostNodeEdits(), original = fixture();
  const changed = patchNode(original, 'a', { x: 1 });
  edits.markChanges(original, changed);
  const removed = removeNode(changed, 'a');
  const replacement = addNode(removed, createPaperNode({ alias: 'Replacement', takeaway: '' }, { id: 'a' }));
  edits.inheritMeasurements(removed, replacement);
  const newNode = replacement.nodes.find(node => node.id === 'a')!;
  assert.equal(edits.has(newNode), false);
  assert.equal(edits.has(changed.nodes[0]), true, 'an old history snapshot keeps its own permission');

  edits.markChanges(removed, replacement);
  assert.equal(edits.has(newNode), true, 'a real new insertion grants fresh permission');
  const loaded = structuredClone(replacement);
  assert.equal(edits.has(loaded.nodes.find(node => node.id === 'a')!), false);
  assert.equal(edits.has(original.nodes[0]), false);
});
