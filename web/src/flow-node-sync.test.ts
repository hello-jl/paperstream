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
