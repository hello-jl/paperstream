import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, addNode, addEdge, createPaperNode, createEdge, parseCanvas, serializeCanvas } from './canvas.ts';
import { createPresentationPage, readPresentationPages, updatePresentationPage, removePresentationPage, movePresentationPage, pageDocument, presentationDocuments } from './presentation-pages.ts';

function graph() {
  let value = createCanvas();
  for (const id of ['a', 'b', 'c']) value = addNode(value, createPaperNode({ alias: id, takeaway: `内容${id}` }, { id }));
  return addEdge(addEdge(value, createEdge('a', 'b', 'ab')), createEdge('b', 'c', 'bc'));
}
test('pages manage order and membership without modifying graph nodes or unknown fields', () => {
  const source = graph(); source.paperstreamPresentation = { unknown: { preserve: true }, pages: [] };
  const original = JSON.stringify(source);
  let next = createPresentationPage(source, { id: 'first', title: '第一张', nodeIds: ['a', 'b'] });
  next = createPresentationPage(next, { id: 'second', title: '第二张', nodeIds: ['c'] });
  next = updatePresentationPage(next, 'first', { title: '改名' });
  next = movePresentationPage(next, 'second', -1);
  assert.deepEqual(readPresentationPages(next).map(page => page.id), ['second', 'first']);
  assert.deepEqual(next.nodes, source.nodes); assert.deepEqual(next.edges, source.edges);
  assert.equal(JSON.stringify(source), original);
  assert.deepEqual((next.paperstreamPresentation as { unknown: unknown }).unknown, { preserve: true });
  const restored = parseCanvas(serializeCanvas(next));
  assert.equal(readPresentationPages(restored)[1].title, '改名');
  const removed = removePresentationPage(restored, 'first');
  assert.equal(removed.nodes.length, 3); assert.equal(removed.edges.length, 2);
  assert.equal(readPresentationPages(removed).length, 1);
});
test('page views only include selected nodes and internal edges, leaving original data intact', () => {
  const source = createPresentationPage(graph(), { id: 'part', nodeIds: ['a', 'b'] });
  const view = pageDocument(source, readPresentationPages(source)[0]);
  assert.deepEqual(view.nodes.map(node => node.id), ['a', 'b']);
  assert.equal(view.edges.length, 1); assert.equal(view.edges[0].label, 'ab');
  assert.equal(view.paperstreamPresentation, undefined);
  assert.equal(source.nodes.length, 3);
  assert.equal(presentationDocuments(graph())[0].document.nodes.length, 3);
});
test('invalid new memberships, duplicate page IDs and malformed extensions fail without mutation', () => {
  const source = graph(), original = JSON.stringify(source);
  assert.throws(() => createPresentationPage(source, { nodeIds: ['missing'] }));
  assert.throws(() => createPresentationPage(source, { nodeIds: ['a', 'a'] }));
  const next = createPresentationPage(source, { id: 'p', nodeIds: [] });
  assert.throws(() => createPresentationPage(next, { id: 'p', nodeIds: ['a'] }));
  assert.throws(() => readPresentationPages({ ...source, paperstreamPresentation: 'keep me' }));
  assert.equal(JSON.stringify(source), original);
});
test('missing nodes on existing imported pages stay recorded and can be reviewed without destructive repair', () => {
  const source = graph(); source.paperstreamPresentation = { pages: [{ id: 'old', title: '', nodeIds: ['a', 'removed'], unknown: 42 }] };
  const pages = readPresentationPages(source);
  assert.deepEqual(pages[0].nodeIds, ['a', 'removed']);
  assert.deepEqual(pageDocument(source, pages[0]).nodes.map(node => node.id), ['a']);
  const renamed = updatePresentationPage(source, 'old', { title: '保留来源' });
  assert.equal(readPresentationPages(renamed)[0].unknown, 42);
  assert.deepEqual(readPresentationPages(renamed)[0].nodeIds, ['a', 'removed']);
});
