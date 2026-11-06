import test from 'node:test';
import assert from 'node:assert/strict';
import { initialHostDraft } from './editor-host.ts';
import { createCanvas, createPaperNode, serializeCanvas } from './canvas.ts';

test('host documents own a fresh isolated baseline without browser selection or recovery state', () => {
  const document = { ...createCanvas(), future: { keep: true }, nodes: [createPaperNode({ alias: 'Host', takeaway: '' })] };
  const state = initialHostDraft({ document, fileName: 'host.canvas' });
  assert.equal(state.saved, serializeCanvas(document));
  assert.equal(state.fileName, 'host.canvas');
  assert.equal(state.selection, null);
  assert.equal(state.fileBindingId, null);
  assert.equal(state.restored, false);
  assert.notEqual(state.canvas, document);
  assert.notEqual(state.canvas.nodes[0], document.nodes[0]);
  assert.deepEqual(state.canvas, document);
});

test('invalid host content fails instead of producing a saveable empty fallback', () => {
  assert.throws(() => initialHostDraft({ document: { nodes: [{ id: 'broken' }], edges: [] } as never, fileName: 'broken.canvas' }));
});
