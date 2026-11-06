import { addNode, CanvasError, createEdge, validateCanvas } from './canvas.ts';
import type { CanvasNode, JSONCanvasDocument, NodePlacement } from './canvas.ts';

export function isRelationNode(node: CanvasNode): boolean {
  const kind = node.paperstreamCard;
  return node.type === 'text' && typeof kind === 'object' && kind !== null
    && !Array.isArray(kind) && (kind as Record<string, unknown>).kind === 'relation';
}

/** A shared label is an ordinary Canvas text node that any number of edges can join. */
export function createRelationNode(text = '', placement: NodePlacement = {}): CanvasNode {
  const node: CanvasNode = { id: placement.id ?? crypto.randomUUID().replaceAll('-', ''),
    type: 'text', text, x: placement.x ?? 0, y: placement.y ?? 0,
    width: placement.width ?? 240, height: placement.height ?? 100,
    paperstreamCard: { kind: 'relation' } };
  validateCanvas({ nodes: [node], edges: [] });
  return node;
}

/** Split one connection around its shared text, preserving the original edge ID. */
export function promoteEdgeRelation(document: JSONCanvasDocument, edgeId: string): { document: JSONCanvasDocument; nodeId: string } {
  const edge = document.edges.find(item => item.id === edgeId);
  if (!edge) throw new CanvasError(`Edge not found: ${edgeId}`);
  const source = document.nodes.find(node => node.id === edge.fromNode)!;
  const target = document.nodes.find(node => node.id === edge.toNode)!;
  const node = createRelationNode(edge.label ?? '', {
    x: Math.round((source.x + source.width / 2 + target.x + target.width / 2) / 2 - 120),
    y: Math.round((source.y + source.height / 2 + target.y + target.height / 2) / 2 - 50),
  });
  const continuation = { ...createEdge(node.id, edge.toNode, ''), fromSide: 'bottom' as const,
    toSide: edge.toSide ?? 'top', fromEnd: 'none' as const, toEnd: edge.toEnd ?? 'arrow' as const,
    ...(edge.color !== undefined ? { color: edge.color } : {}),
    ...(edge.paperstreamStyle !== undefined ? { paperstreamStyle: structuredClone(edge.paperstreamStyle) } : {}) };
  const next = addNode(document, node);
  next.edges = [...document.edges.map(item => item.id === edgeId
    ? { ...item, toNode: node.id, toSide: 'top' as const, toEnd: 'none' as const, label: '' } : item), continuation];
  validateCanvas(next);
  return { document: next, nodeId: node.id };
}
