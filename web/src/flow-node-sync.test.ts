import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node } from '@xyflow/react';
import { adoptUserNodes, ConnectionMode, getEdgePosition, Position } from '@xyflow/system';
import type { InternalNodeBase, NodeLookup, ParentLookup } from '@xyflow/system';
import { parseCanvas, patchEdge, patchNode, serializeCanvas } from './canvas.ts';
import type { CanvasNode, JSONCanvasDocument } from './canvas.ts';
import { preserveNodeMeasurements } from './flow-node-sync.ts';

type FlowNode = Node<{ raw: CanvasNode }>;

function fixture(): JSONCanvasDocument {
  return {
    nodes: ['a', 'b'].map((id, index) => ({
      id, type: 'text', text: id, x: 0, y: index * 300, width: 200, height: 100,
    })),
    edges: [{ id: 'edge', fromNode: 'a', toNode: 'b', label: '' }],
  };
}

function flowNodes(document: JSONCanvasDocument): FlowNode[] {
  return document.nodes.map(raw => ({
    id: raw.id, type: 'paper', position: { x: raw.x, y: raw.y },
    width: raw.width, height: raw.height, data: { raw },
  }));
}

function measuredFlow(document = fixture()) {
  const nodes = flowNodes(document).map(node => ({
    ...node, measured: { width: node.width, height: node.height },
  }));
  const lookup: NodeLookup<InternalNodeBase<FlowNode>> = new Map();
  const parents: ParentLookup<InternalNodeBase<FlowNode>> = new Map();
  adoptUserNodes(nodes, lookup, parents);
  for (const node of lookup.values()) {
    // Simulate the bounds measured from CardNode's DOM handles. Do not supply
    // node.handles: that would bypass the measurement invalidation under test.
    node.internals.handleBounds = {
      source: [Position.Top, Position.Bottom].map(position => ({
        id: position, nodeId: node.id, type: 'source', position,
        x: 95, y: position === Position.Top ? -5 : 95, width: 10, height: 10,
      })),
      target: [],
    };
  }
  return { nodes: nodes as FlowNode[], lookup, parents };
}

function edgePosition(lookup: NodeLookup<InternalNodeBase<FlowNode>>) {
  return getEdgePosition({
    id: 'edge', sourceNode: lookup.get('a')!, targetNode: lookup.get('b')!,
    sourceHandle: Position.Bottom, targetHandle: Position.Top,
    connectionMode: ConnectionMode.Loose,
  });
}

test('rebuilding nodes without measured invalidates handle bounds and removes the edge position', () => {
  const { lookup, parents } = measuredFlow();
  assert.ok(edgePosition(lookup), 'the measured edge starts renderable');

  // This is the old Editor synchronization path after typing the first letter.
  adoptUserNodes(flowNodes(patchEdge(fixture(), 'edge', { label: 'a' })), lookup, parents);
  assert.equal(lookup.get('a')!.internals.handleBounds, undefined);
  assert.equal(edgePosition(lookup), null);
});

test('successive relation edits keep the measured edge renderable without another DOM measurement', () => {
  let document = fixture();
  const state = measuredFlow(document);
  let previous = state.nodes;
  const initialPosition = edgePosition(state.lookup);
  const handles = state.lookup.get('a')!.internals.handleBounds;
  assert.ok(initialPosition);

  for (const label of ['a', 'ab', '', '中', '中文']) {
    document = patchEdge(document, 'edge', { label });
    previous = preserveNodeMeasurements(previous, flowNodes(document));
    adoptUserNodes(previous, state.lookup, state.parents);
    assert.deepEqual(edgePosition(state.lookup), initialPosition, `relation ${JSON.stringify(label)}`);
    assert.strictEqual(state.lookup.get('a')!.internals.handleBounds, handles);
    assert.equal(document.edges[0].label, label);
  }
});

test('content and layout updates retain measurements but take all current node data and geometry', () => {
  const document = fixture();
  const state = measuredFlow(document);
  state.nodes[0] = { ...state.nodes[0], dragging: true, selected: true };
  const changed = patchNode(document, 'a', { text: 'New content', x: 40, y: 50, width: 260, height: 140 });
  const next = flowNodes(changed);
  const synced = preserveNodeMeasurements(state.nodes, next);

  assert.strictEqual(synced[0].data, next[0].data);
  assert.deepEqual(synced[0].position, { x: 40, y: 50 });
  assert.equal(synced[0].width, 260);
  assert.equal(synced[0].height, 140);
  assert.equal(synced[0].data.raw.text, 'New content');
  assert.equal(synced[0].dragging, undefined);
  assert.equal(synced[0].selected, undefined);
  assert.deepEqual(synced[0].measured, { width: 200, height: 100 });
  assert.equal(next[0].measured, undefined, 'synchronization must not mutate next nodes');
  assert.equal(state.nodes[0].data.raw.text, 'a', 'synchronization must not mutate previous nodes');

  adoptUserNodes(synced, state.lookup, state.parents);
  assert.ok(edgePosition(state.lookup));
  assert.equal(edgePosition(state.lookup)!.sourceX, 140);
  assert.equal(edgePosition(state.lookup)!.sourceY, 155);

  const freshlyMeasured = { ...next[0], measured: { width: 260, height: 140 } };
  assert.deepEqual(preserveNodeMeasurements(synced, [freshlyMeasured])[0].measured, freshlyMeasured.measured);
});

test('measurements follow stable IDs and types, never deleted nodes or a new document', () => {
  const state = measuredFlow();
  state.nodes[1].measured = { width: 220, height: 120 };
  const reversed = flowNodes(fixture()).reverse();
  const reordered = preserveNodeMeasurements(state.nodes, reversed);
  assert.deepEqual(reordered.map(node => [node.id, node.measured]), [
    ['b', { width: 220, height: 120 }], ['a', { width: 200, height: 100 }],
  ]);

  const next = [
    { ...flowNodes(fixture())[0], type: 'different-renderer' },
    { ...flowNodes(fixture())[1], id: 'new-node' },
  ];
  const synced = preserveNodeMeasurements(state.nodes, next);
  assert.deepEqual(synced.map(node => node.id), ['a', 'new-node']);
  assert.ok(synced.every(node => node.measured === undefined));
  assert.deepEqual(preserveNodeMeasurements(state.nodes, []), []);
  assert.ok(preserveNodeMeasurements([], flowNodes(fixture())).every(node => node.measured === undefined),
    'replacing a document starts with empty previous nodes even when IDs repeat');
});

test('transient node measurements do not enter the Canvas document or serialized file', () => {
  const document = fixture();
  const original = serializeCanvas(document);
  const state = measuredFlow(document);
  const changed = patchEdge(document, 'edge', { label: 'ab' });
  const synced = preserveNodeMeasurements(state.nodes, flowNodes(changed));
  assert.ok(synced.every(node => node.measured));
  assert.equal(serializeCanvas(document), original);
  const restored = parseCanvas(serializeCanvas(changed));
  assert.deepEqual(restored, changed);
  assert.ok(restored.nodes.every(node => !('measured' in node) && !('internals' in node)));
  assert.equal(restored.edges[0].label, 'ab');
});

test('relation edits preserve all 100 unchanged card data references', () => {
  const base = fixture().nodes[0];
  let document: JSONCanvasDocument = {
    nodes: Array.from({ length: 100 }, (_, index) => ({ ...base, id: `n${index}`, x: index * 240 })),
    edges: [{ id: 'edge', fromNode: 'n0', toNode: 'n1', label: '' }],
  };
  let previous: FlowNode[] = flowNodes(document).map(node => ({ ...node, measured: { width: 200, height: 100 } }));
  const originalData = new Map(previous.map(node => [node.id, node.data]));
  for (const label of ['a', 'ab', '', '继承关系']) {
    document = patchEdge(document, 'edge', { label });
    const projected = flowNodes(document);
    const synced = preserveNodeMeasurements(previous, projected);
    assert.equal(synced.length, 100);
    for (const node of synced) {
      assert.strictEqual(node.data, originalData.get(node.id));
      assert.deepEqual(node.measured, { width: 200, height: 100 });
    }
    assert.ok(projected.every(node => node.measured === undefined), 'incoming projection stays untouched');
    previous = synced;
  }
});

test('changed raw, busy, editing, draft, actions, or callbacks always take the new data', () => {
  const raw = fixture().nodes[0];
  const callback = () => {};
  const data = {
    raw, busy: false, editing: null as string | null, draft: null as Record<string, string> | null,
    actions: { finish: callback }, resize: callback, fitHeight: callback, startInteraction: callback,
  };
  const previous: Node[] = [{ id: raw.id, type: 'paper', position: { x: 0, y: 0 }, data }];
  const changes: Record<string, unknown>[] = [
    { raw: { ...raw } }, { busy: true }, { editing: 'takeaway' }, { draft: { takeaway: 'a' } },
    { actions: { finish: callback } }, { resize: () => {} }, { fitHeight: () => {} }, { startInteraction: () => {} },
  ];
  for (const change of changes) {
    const projected: Node[] = [{ ...previous[0], data: { ...data, ...change } }];
    const synced = preserveNodeMeasurements(previous, projected);
    assert.strictEqual(synced[0].data, projected[0].data, `new ${Object.keys(change)[0]} must be visible immediately`);
    assert.notStrictEqual(synced[0].data, data);
  }
  const active = [{ ...previous[0], data: { ...data, editing: 'takeaway', draft: { takeaway: 'a' } } }];
  const projected = [{ ...active[0], data: { ...active[0].data, draft: { takeaway: 'a' } } }];
  assert.strictEqual(preserveNodeMeasurements(active, projected)[0].data, projected[0].data,
    'a new draft object is not retained by a deep comparison, even if its text matches');
});

test('reusing data preserves only measurements, never stale node state or another renderer data', () => {
  const next = flowNodes(fixture())[0];
  const previous: FlowNode = {
    ...next, data: { ...next.data }, measured: { width: 200, height: 100 },
    dragging: true, selected: true, hidden: true, zIndex: 20,
  };
  const projected: FlowNode = { ...next, position: { x: 80, y: 90 }, selected: false, hidden: false, zIndex: 1 };
  const synced = preserveNodeMeasurements([previous], [projected])[0];
  assert.strictEqual(synced.data, previous.data);
  assert.strictEqual(synced.position, projected.position);
  assert.strictEqual(synced.measured, previous.measured);
  assert.equal(synced.dragging, undefined);
  assert.equal(synced.selected, false);
  assert.equal(synced.hidden, false);
  assert.equal(synced.zIndex, 1);
  assert.equal(projected.measured, undefined);

  const otherType = { ...projected, type: 'other', data: { ...previous.data } };
  assert.strictEqual(preserveNodeMeasurements([previous], [otherType])[0], otherType);
  assert.notStrictEqual(otherType.data, previous.data);
  assert.strictEqual(preserveNodeMeasurements([], [projected])[0], projected,
    'new documents do not inherit data from a separate cache');
});

test('data comparison distinguishes missing keys, symbols and signed zero while treating NaN as unchanged', () => {
  const symbol = Symbol('action');
  const base = flowNodes(fixture())[0];
  const previous: Node[] = [{ ...base, data: { ...base.data, value: NaN, signed: 0, [symbol]: 'original' } }];
  const unchanged = { ...previous[0], data: { ...previous[0].data } };
  assert.strictEqual(preserveNodeMeasurements(previous, [unchanged])[0].data, previous[0].data);
  const additions = { ...unchanged, data: { ...unchanged.data, extra: undefined } };
  const symbolChange = { ...unchanged, data: { ...unchanged.data, [symbol]: 'changed' } };
  const signedChange = { ...unchanged, data: { ...unchanged.data, signed: -0 } };
  const removed = { ...unchanged, data: { raw: base.data.raw, value: NaN, signed: 0 } };
  for (const projected of [additions, symbolChange, signedChange, removed]) {
    assert.strictEqual(preserveNodeMeasurements(previous, [projected])[0].data, projected.data);
  }
});
