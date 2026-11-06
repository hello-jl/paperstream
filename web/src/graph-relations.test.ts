import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addEdge, addNode, createCanvas, createEdge, createPaperNode, parseCanvas, patchEdge, patchNode, serializeCanvas } from './canvas.ts';
import { createRelationNode, followRelationPositions, isRelationNode, promoteEdgeRelation, relationEdgeSides,
  relationTextSize, resetAttachedRelationPosition } from './graph-relations.ts';
import { edgeRoutingPatch, isGeneratedEdgeRouting, readEdgeRouting } from './edge-routing.ts';
import { setEdgeAppearance } from './appearance.ts';

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

test('shared text starts compact, grows for wrapping and respects explicit existing dimensions', () => {
  const empty = createRelationNode('');
  assert.ok(empty.width < 240 && empty.height < 100);
  assert.ok(relationTextSize('long explanation '.repeat(30)).height > empty.height);
  assert.ok(relationTextSize('长关系说明'.repeat(30)).width <= 280);
  const custom = createRelationNode('text', { width: 320, height: 190 });
  assert.equal(custom.width, 320); assert.equal(custom.height, 190);
});

function attachedFixture() {
  let graph = addNode(fixture(), { ...createRelationNode('shared', { id: 'r', x: 213, y: 281 }), extra: { future: true } });
  graph = addEdge(graph, createEdge('a', 'r', '', { id: 'ar' }));
  graph = addEdge(graph, createEdge('r', 'b', '', { id: 'rb' }));
  // Multiple lines from A still describe one endpoint's position.
  return addEdge(graph, createEdge('a', 'r', '', { id: 'ar2' }));
}

test('shared labels follow endpoint centroid motion without losing placement, metadata or manual routes', () => {
  const graph = attachedFixture();
  graph.edges[0].paperstreamStyle = { waypoints: [{ x: 1, y: 2 }], future: 'kept' };
  const snapshot = serializeCanvas(graph);
  const next = followRelationPositions(graph, patchNode(graph, 'a', { x: 120, y: 80 }));
  const original = graph.nodes.find(node => node.id === 'r')!, label = next.nodes.find(node => node.id === 'r')!;
  assert.equal(label.x, original.x + 60); assert.equal(label.y, original.y + 40);
  assert.deepEqual(label.extra, original.extra);
  assert.deepEqual(next.edges, graph.edges);
  assert.equal(serializeCanvas(graph), snapshot);
  assert.deepEqual(next.nodes.filter(node => node.id !== 'r'), patchNode(graph, 'a', { x: 120, y: 80 }).nodes.filter(node => node.id !== 'r'));
  const movedBoth = patchNode(patchNode(graph, 'a', { x: 70 }), 'b', { x: 70 });
  assert.equal(followRelationPositions(graph, movedBoth).nodes.find(node => node.id === 'r')!.x, original.x + 70);
});

test('manual and multi-selection label moves win and their offset survives subsequent endpoint moves', () => {
  const graph = attachedFixture();
  const dragged = patchNode(patchNode(graph, 'a', { x: 100 }), 'r', { x: 700, y: 900 });
  assert.equal(followRelationPositions(graph, dragged), dragged);
  const followed = followRelationPositions(dragged, patchNode(dragged, 'b', { x: 100 }));
  assert.equal(followed.nodes.find(node => node.id === 'r')!.x, 750);
  assert.equal(followed.nodes.find(node => node.id === 'r')!.y, 900);
  const endpointOnly = patchNode(graph, 'a', { x: 100 });
  assert.equal(followRelationPositions(graph, endpointOnly, ['r']), endpointOnly);
});

test('follow uses changed endpoint size, leaves unrelated edits and new attachments stationary', () => {
  const graph = attachedFixture(), original = graph.nodes.find(node => node.id === 'r')!;
  const a = graph.nodes.find(node => node.id === 'a')!;
  const resized = followRelationPositions(graph, patchNode(graph, 'a', { width: a.width + 80 }));
  assert.equal(resized.nodes.find(node => node.id === 'r')!.x, original.x + 20);
  const textChange = patchNode(graph, 'r', { text: '' });
  assert.equal(followRelationPositions(graph, textChange), textChange);
  const attached = addEdge(graph, createEdge('c', 'r', ''));
  assert.equal(followRelationPositions(graph, attached), attached);
  const orphan = addNode(fixture(), createRelationNode('', { id: 'orphan' }));
  const changed = patchNode(orphan, 'a', { x: 400 });
  assert.equal(followRelationPositions(orphan, changed), changed);
});

test('explicit recenter uses unique endpoint centers and keeps all other document content', () => {
  const graph = attachedFixture(), before = serializeCanvas(graph);
  const next = resetAttachedRelationPosition(graph, 'r'), node = next.nodes.find(item => item.id === 'r')!;
  const endpoints = graph.nodes.filter(item => ['a', 'b'].includes(item.id));
  // Integer Canvas origins can put the center of an odd-sized box half a pixel away.
  assert.ok(Math.abs(node.x + node.width / 2 - endpoints.reduce((sum, item) => sum + (item.x + item.width / 2) / 2, 0)) <= .5);
  assert.ok(Math.abs(node.y + node.height / 2 - endpoints.reduce((sum, item) => sum + (item.y + item.height / 2) / 2, 0)) <= .5);
  assert.deepEqual(next.edges, graph.edges); assert.deepEqual(node.extra, { future: true });
  assert.equal(serializeCanvas(graph), before);
  assert.throws(() => resetAttachedRelationPosition(graph, 'a'));
});

test('promotion splits routed controls once, removes former label position and retains appearance', () => {
  let graph = patchNode(patchNode(fixture(), 'a', { width: 200, height: 100 }), 'b', { x: 600, y: 400, width: 200, height: 100 });
  const controls = [{ x: 300, y: 50 }, { x: 300, y: 250 }, { x: 500, y: 250 }, { x: 500, y: 450 }];
  graph = addEdge(graph, { ...createEdge('a', 'b', '', { id: 'route' }), fromSide: 'right', toSide: 'left', color: '#123456',
    paperstreamStyle: { waypoints: controls, labelPosition: { x: 400, y: 250 }, strokeWidth: 5, future: { kept: true } },
    custom: 'preserved' });
  const before = serializeCanvas(graph), result = promoteEdgeRelation(graph, 'route');
  const [first, last] = result.document.edges, node = result.document.nodes.at(-1)!;
  assert.ok(Math.abs(node.x + node.width / 2 - 400) <= .5); assert.ok(Math.abs(node.y + node.height / 2 - 250) <= .5);
  assert.deepEqual(readEdgeRouting(first), { waypoints: controls.slice(0, 2) });
  assert.deepEqual(readEdgeRouting(last), { waypoints: controls.slice(2) });
  assert.equal(first.toSide, 'left'); assert.equal(last.fromSide, 'right');
  assert.equal(first.fromSide, 'right'); assert.equal(last.toSide, 'left');
  assert.equal(last.color, '#123456'); assert.equal(first.custom, 'preserved');
  for (const edge of [first, last]) {
    assert.equal((edge.paperstreamStyle as Record<string, unknown>).strokeWidth, 5);
    assert.deepEqual((edge.paperstreamStyle as Record<string, unknown>).future, { kept: true });
  }
  assert.equal(serializeCanvas(graph), before);
  const displayed = promoteEdgeRelation(graph, 'route', { x: 420, y: 290 }).document.nodes.at(-1)!;
  assert.ok(Math.abs(displayed.x + displayed.width / 2 - 420) <= .5); assert.ok(Math.abs(displayed.y + displayed.height / 2 - 290) <= .5);
});

test('shared label ports face endpoints or nearest manual controls without rewriting saved geometry', () => {
  const graph = attachedFixture(), edge = graph.edges[0], before = serializeCanvas(graph);
  const horizontal = patchNode(patchNode(graph, 'r', { x: 600, y: 0, width: 100, height: 100 }), 'a', { x: 0, y: 0, width: 100, height: 100 });
  assert.deepEqual(relationEdgeSides(horizontal, edge), { fromSide: 'bottom', toSide: 'left' });
  assert.equal(relationEdgeSides(horizontal, { ...edge, paperstreamStyle: { waypoints: [{ x: 650, y: 500 }] } }).toSide, 'bottom');
  assert.equal(serializeCanvas(graph), before);
});

test('manual edge labels follow endpoint centers while retaining manual offset, route and extension metadata', () => {
  const graph = addEdge(fixture(), { ...createEdge('a', 'b', 'text', { id: 'ab' }), paperstreamStyle: {
    labelPosition: { x: 321, y: 234, future: 'retained' }, waypoints: [{ x: 777, y: 888 }], strokeWidth: 3,
  } });
  const before = serializeCanvas(graph), moved = patchNode(graph, 'a', { x: 100, y: 80 });
  const next = followRelationPositions(graph, moved);
  assert.deepEqual(next.edges[0].paperstreamStyle, {
    labelPosition: { x: 371, y: 274, future: 'retained' }, waypoints: [{ x: 777, y: 888 }], strokeWidth: 3,
  });
  assert.equal(serializeCanvas(graph), before);
  const direct = structuredClone(moved);
  (direct.edges[0].paperstreamStyle as Record<string, unknown>).labelPosition = { x: 600, y: 700 };
  assert.equal(followRelationPositions(graph, direct), direct);
  const reset = structuredClone(moved);
  delete (reset.edges[0].paperstreamStyle as Record<string, unknown>).labelPosition;
  assert.equal(followRelationPositions(graph, reset), reset);
  const selfLoop = addEdge(fixture(), { ...createEdge('a', 'a', '', { id: 'loop' }),
    paperstreamStyle: { labelPosition: { x: 20, y: 40 } } });
  assert.deepEqual(readEdgeRouting(followRelationPositions(selfLoop, patchNode(selfLoop, 'a', { x: 100 })).edges[0]).labelPosition,
    { x: 120, y: 40 });
});

test('edge text follows final shared-label position together with its ordinary endpoint', () => {
  const graph = attachedFixture();
  graph.edges[0] = { ...graph.edges[0], label: 'branch explanation', paperstreamStyle: {
    labelPosition: { x: 100, y: 200 }, waypoints: [{ x: 40, y: 80 }], future: true,
  } };
  const before = serializeCanvas(graph), originalShared = graph.nodes.find(node => node.id === 'r')!;
  const next = followRelationPositions(graph, patchNode(graph, 'a', { x: 100 }));
  assert.equal(next.nodes.find(node => node.id === 'r')!.x, originalShared.x + 50);
  assert.deepEqual(readEdgeRouting(next.edges[0]), {
    labelPosition: { x: 175, y: 200 }, waypoints: [{ x: 40, y: 80 }],
  });
  assert.equal((next.edges[0].paperstreamStyle as Record<string, unknown>).future, true);
  assert.equal(serializeCanvas(graph), before);
});

test('odd widths and single-pixel endpoint movement always produce valid integer node geometry', () => {
  const graph = attachedFixture(), original = graph.nodes.find(node => node.id === 'r')!;
  const next = followRelationPositions(graph, patchNode(graph, 'a', { x: 1, y: 1 }));
  const followed = next.nodes.find(node => node.id === 'r')!;
  assert.equal(followed.x, Math.round(original.x + 0.5));
  assert.equal(followed.y, Math.round(original.y + 0.5));
  const odd = patchNode(patchNode(graph, 'a', { width: 201, height: 101 }), 'r', { width: 101, height: 45 });
  const reset = resetAttachedRelationPosition(odd, 'r');
  const routed = addEdge(odd, { ...createEdge('a', 'b', 'abcdefg', { id: 'odd' }),
    paperstreamStyle: { labelPosition: { x: 123.25, y: 456.75 } } });
  const promoted = promoteEdgeRelation(routed, 'odd').document;
  const displayed = promoteEdgeRelation(routed, 'odd', { x: 333.5, y: 444.5 }).document;
  for (const document of [next, reset, promoted, displayed]) {
    for (const node of document.nodes) for (const field of ['x', 'y', 'width', 'height'] as const) {
      assert.ok(Number.isSafeInteger(node[field]), `${node.id}.${field} must be an integer`);
    }
    assert.deepEqual(parseCanvas(serializeCanvas(document)), document);
  }
  // Only persisted Canvas node geometry is rounded, not edge routing metadata.
  const manual = addEdge(graph, { ...createEdge('a', 'b', '', { id: 'manual' }), paperstreamStyle: { labelPosition: { x: 0, y: 0 } } });
  assert.deepEqual(readEdgeRouting(followRelationPositions(manual, patchNode(manual, 'a', { x: 1, y: 1 })).edges.at(-1)!).labelPosition,
    { x: 0.5, y: 0.5 });
});

test('moving endpoints invalidates only incident computed routes, including edges attached to followed shared text', () => {
  let graph = attachedFixture();
  graph = addEdge(graph, createEdge('b', 'c', 'unrelated', { id: 'bc' }));
  graph.edges = graph.edges.map(edge => ({ ...edge, paperstreamStyle: { routeSource: 'elk',
    waypoints: [{ x: 900, y: 1000 }], labelPosition: { x: 800, y: 900 }, strokeWidth: 4, future: { kept: true } } }));
  const before = serializeCanvas(graph);
  const moved = followRelationPositions(graph, patchNode(graph, 'a', { x: 120, y: 80 }));
  assert.notEqual(moved.nodes.find(node => node.id === 'r')!.x, graph.nodes.find(node => node.id === 'r')!.x);
  for (const edge of moved.edges.filter(edge => edge.id !== 'bc')) {
    assert.deepEqual(readEdgeRouting(edge), { waypoints: [] });
    assert.equal(isGeneratedEdgeRouting(edge), false);
    assert.deepEqual(edge.paperstreamStyle, { strokeWidth: 4, future: { kept: true } });
  }
  assert.deepEqual(moved.edges.find(edge => edge.id === 'bc'), graph.edges.find(edge => edge.id === 'bc'));
  assert.equal(serializeCanvas(graph), before);
  assert.deepEqual(parseCanvas(serializeCanvas(moved)), moved);
  // A change of size also invalidates geometry, even when its center stays put.
  const b = graph.nodes.find(node => node.id === 'b')!;
  const resized = followRelationPositions(graph, patchNode(graph, 'b', { x: b.x - 20, width: b.width + 40 }));
  assert.equal(isGeneratedEdgeRouting(resized.edges.find(edge => edge.id === 'bc')!), false);
});

test('text and visual changes retain computed routes; deliberate route edits survive later movement', () => {
  const graph = addEdge(fixture(), { ...createEdge('a', 'b', 'text', { id: 'ab' }), paperstreamStyle: {
    routeSource: 'elk', waypoints: [{ x: 777, y: 888 }], labelPosition: { x: 100, y: 200 }, future: true,
  } });
  const textEdit = patchEdge(graph, 'ab', { label: 'new words' });
  assert.equal(followRelationPositions(graph, textEdit), textEdit);
  const paperEdit = patchNode(graph, 'a', { text: graph.nodes[0].text!.replace('one', 'two') });
  assert.equal(followRelationPositions(graph, paperEdit), paperEdit);
  const widthEdit = { ...graph, edges: graph.edges.map(edge => setEdgeAppearance(edge, { strokeWidth: 5 })) };
  assert.equal(followRelationPositions(graph, widthEdit), widthEdit);
  assert.equal(isGeneratedEdgeRouting(widthEdit.edges[0]), true);
  const manual = patchEdge(graph, 'ab', edgeRoutingPatch(graph.edges[0], { waypoints: [{ x: 50, y: 60 }] }));
  const moved = followRelationPositions(manual, patchNode(manual, 'a', { x: 100, y: 80 }));
  assert.deepEqual(readEdgeRouting(moved.edges[0]), { waypoints: [{ x: 50, y: 60 }], labelPosition: { x: 150, y: 240 } });
  assert.equal(isGeneratedEdgeRouting(moved.edges[0]), false);
  assert.equal((moved.edges[0].paperstreamStyle as Record<string, unknown>).future, true);
});
