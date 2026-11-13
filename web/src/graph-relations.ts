import { addNode, CanvasError, createEdge, validateCanvas } from './canvas.ts';
import type { CanvasEdge, CanvasNode, JSONCanvasDocument, NodePlacement } from './canvas.ts';
import { defaultRoutePoints, edgeRoutingPatch, isGeneratedEdgeRouting, readEdgeRouting, routeMidpoint } from './edge-routing.ts';
import type { Point } from './edge-label-layout.ts';
import { CARD_LAYOUT } from './card-layout.ts';

function anchor(node: CanvasNode, side: CanvasEdge['fromSide']): Point {
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 };
  if (side === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 };
  return { x: node.x + node.width / 2, y: node.y + (side === 'top' ? 0 : node.height) };
}

/** Split at the closest segment, so each old control belongs to just one half. */
function splitControls(points: Point[], center: Point): [Point[], Point[]] {
  let split = 0, distance = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index], b = points[index + 1], dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const ratio = length ? Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / length)) : 0;
    const next = Math.hypot(center.x - a.x - ratio * dx, center.y - a.y - ratio * dy);
    if (next < distance) { distance = next; split = index; }
  }
  return [points.slice(1, split + 1), points.slice(split + 1, -1)];
}

function facingSide(node: CanvasNode, point: Point): NonNullable<CanvasEdge['fromSide']> {
  const dx = (point.x - node.x - node.width / 2) / node.width;
  const dy = (point.y - node.y - node.height / 2) / node.height;
  return Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'top' : 'bottom';
}

export function isRelationNode(node: CanvasNode): boolean {
  const kind = node.paperstreamCard;
  return node.type === 'text' && typeof kind === 'object' && kind !== null
    && !Array.isArray(kind) && (kind as Record<string, unknown>).kind === 'relation';
}

/** A compact initial textbox; measured content may grow it later without truncation. */
export function relationTextSize(text: string): { width: number; height: number } {
  const lines = text.split('\n');
  const widths = lines.map(line => [...line].reduce((sum, char) => sum + CARD_LAYOUT.relationBodySize * (/[^\u0000-\u00ff]/.test(char) ? 1 : .55), 0));
  const width = Math.min(280, Math.max(96, Math.ceil(Math.max(...widths) + CARD_LAYOUT.paddingX * 2)));
  const rows = widths.reduce((sum, value) => sum + Math.max(1, Math.ceil(value / (width - CARD_LAYOUT.paddingX * 2))), 0);
  return { width, height: Math.max(44, rows * CARD_LAYOUT.relationBodyLine + CARD_LAYOUT.relationPaddingTop * 2 + 3) };
}

function neighborIds(document: JSONCanvasDocument, id: string): Set<string> {
  return new Set(document.edges.flatMap(edge => edge.fromNode === id && edge.toNode !== id ? [edge.toNode]
    : edge.toNode === id && edge.fromNode !== id ? [edge.fromNode] : []));
}

function center(node: CanvasNode): Point { return { x: node.x + node.width / 2, y: node.y + node.height / 2 }; }

/** Follow endpoint motion while retaining the user's offset from the attached lines.
 * Duplicate connections do not give an endpoint extra weight. Direct label drags
 * win, including a label moved in the same multi-selection as its endpoints. */
export function followRelationPositions(previous: JSONCanvasDocument, next: JSONCanvasDocument,
  explicitlyMovedIds: Iterable<string> = []): JSONCanvasDocument {
  const before = new Map(previous.nodes.map(node => [node.id, node]));
  const after = new Map(next.nodes.map(node => [node.id, node]));
  const moved = new Set(explicitlyMovedIds);
  let changed = false;
  const nodes = next.nodes.map(node => {
    const old = before.get(node.id);
    if (!isRelationNode(node) || !old || moved.has(node.id) || node.x !== old.x || node.y !== old.y) return node;
    const oldNeighbors = neighborIds(previous, node.id);
    const neighbors = [...neighborIds(next, node.id)].filter(id => oldNeighbors.has(id) && before.has(id) && after.has(id));
    if (!neighbors.length) return node;
    const centroids = neighbors.reduce((sum, id) => {
      const a = center(before.get(id)!), b = center(after.get(id)!);
      return { beforeX: sum.beforeX + a.x, beforeY: sum.beforeY + a.y,
        afterX: sum.afterX + b.x, afterY: sum.afterY + b.y };
    }, { beforeX: 0, beforeY: 0, afterX: 0, afterY: 0 });
    // Round the two absolute centroids, not every movement delta. Rounding
    // successive +0.5/-0.5 deltas separately would walk the label one pixel
    // right/down every time an endpoint returned to its original position.
    const dx = Math.round(centroids.afterX / neighbors.length) - Math.round(centroids.beforeX / neighbors.length);
    const dy = Math.round(centroids.afterY / neighbors.length) - Math.round(centroids.beforeY / neighbors.length);
    if (!dx && !dy) return node;
    changed = true;
    return { ...node, x: node.x + dx, y: node.y + dy };
  });
  // Edge labels follow the final endpoints, including shared labels moved above.
  const followedNodes = new Map(nodes.map(node => [node.id, node]));
  const oldEdges = new Map(previous.edges.map(edge => [edge.id, edge]));
  const edges = next.edges.map(edge => {
    const old = oldEdges.get(edge.id);
    if (!old) return edge;
    if (isGeneratedEdgeRouting(edge)) {
      // ELK bends are absolute coordinates for one completed layout. Once a
      // card (or its attached shared label) moves/resizes, the affected route
      // must return to attached automatic drawing instead of looping backward.
      const geometryChanged = old.fromNode !== edge.fromNode || old.toNode !== edge.toNode
        || [edge.fromNode, edge.toNode].some(id => {
          const a = before.get(id), b = followedNodes.get(id);
          return a && b && (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height);
        });
      if (geometryChanged) {
        changed = true;
        return { ...edge, ...edgeRoutingPatch(edge, { waypoints: null, labelPosition: null }) };
      }
      return edge;
    }
    const oldPosition = readEdgeRouting(old).labelPosition, position = readEdgeRouting(edge).labelPosition;
    // A direct label drag (or reset) is already the requested position.
    if (!position || !oldPosition || position.x !== oldPosition.x || position.y !== oldPosition.y) return edge;
    const oldEndpoints = new Set([old.fromNode, old.toNode]);
    const endpoints = [...new Set([edge.fromNode, edge.toNode])]
      .filter(id => oldEndpoints.has(id) && before.has(id) && after.has(id));
    if (!endpoints.length) return edge;
    const delta = endpoints.reduce((sum, id) => {
      const a = center(before.get(id)!), b = center(followedNodes.get(id)!);
      return { x: sum.x + b.x - a.x, y: sum.y + b.y - a.y };
    }, { x: 0, y: 0 });
    if (!delta.x && !delta.y) return edge;
    changed = true;
    return { ...edge, ...edgeRoutingPatch(edge, { labelPosition: {
      x: position.x + delta.x / endpoints.length, y: position.y + delta.y / endpoints.length,
    } }) };
  });
  if (!changed) return next;
  const result = { ...next, nodes, edges };
  validateCanvas(result);
  return result;
}

/** Explicitly return a shared label to the center of its attached endpoints. */
export function resetAttachedRelationPosition(document: JSONCanvasDocument, id: string): JSONCanvasDocument {
  const node = document.nodes.find(item => item.id === id);
  if (!node || !isRelationNode(node)) throw new CanvasError(`Shared relation not found: ${id}`);
  const ids = neighborIds(document, id), neighbors = document.nodes.filter(item => ids.has(item.id));
  if (!neighbors.length) return document;
  const point = neighbors.reduce((sum, item) => {
    const position = center(item);
    return { x: sum.x + position.x / neighbors.length, y: sum.y + position.y / neighbors.length };
  }, { x: 0, y: 0 });
  const next = { ...document, nodes: document.nodes.map(item => item.id === id
    ? { ...item, x: Math.round(point.x - item.width / 2), y: Math.round(point.y - item.height / 2) } : item) };
  validateCanvas(next);
  return next;
}

/** Shared text has no fixed entry/exit direction: lines meet its facing border. */
export function relationEdgeSides(document: JSONCanvasDocument, edge: CanvasEdge): Pick<CanvasEdge, 'fromSide' | 'toSide'> {
  const source = document.nodes.find(node => node.id === edge.fromNode);
  const target = document.nodes.find(node => node.id === edge.toNode);
  const controls = readEdgeRouting(edge).waypoints;
  return {
    fromSide: source && target && isRelationNode(source) ? facingSide(source, controls[0] ?? center(target)) : edge.fromSide ?? 'bottom',
    toSide: source && target && isRelationNode(target) ? facingSide(target, controls.at(-1) ?? center(source)) : edge.toSide ?? 'top',
  };
}

/** A shared label is an ordinary Canvas text node that any number of edges can join. */
export function createRelationNode(text = '', placement: NodePlacement = {}): CanvasNode {
  const size = relationTextSize(text);
  const node: CanvasNode = { id: placement.id ?? crypto.randomUUID().replaceAll('-', ''),
    type: 'text', text, x: placement.x ?? 0, y: placement.y ?? 0,
    width: placement.width ?? size.width, height: placement.height ?? size.height,
    paperstreamCard: { kind: 'relation' } };
  validateCanvas({ nodes: [node], edges: [] });
  return node;
}

/** Split one connection around its shared text, preserving the original edge ID. */
export function promoteEdgeRelation(document: JSONCanvasDocument, edgeId: string, displayedPosition?: Point): { document: JSONCanvasDocument; nodeId: string } {
  const edge = document.edges.find(item => item.id === edgeId);
  if (!edge) throw new CanvasError(`Edge not found: ${edgeId}`);
  const source = document.nodes.find(node => node.id === edge.fromNode)!;
  const target = document.nodes.find(node => node.id === edge.toNode)!;
  const routing = readEdgeRouting(edge);
  const start = anchor(source, edge.fromSide ?? 'bottom'), end = anchor(target, edge.toSide ?? 'top');
  const points = routing.waypoints.length ? [start, ...routing.waypoints, end] : defaultRoutePoints(start, end, edge.fromSide ?? 'bottom');
  const center = displayedPosition ?? routing.labelPosition ?? routeMidpoint(points);
  const size = relationTextSize(edge.label ?? '');
  const node = createRelationNode(edge.label ?? '', {
    x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2),
  });
  // Controls covered by the new card no longer describe exposed line segments.
  const outside = (point: Point) => point.x < node.x || point.x > node.x + node.width
    || point.y < node.y || point.y > node.y + node.height;
  const [before, after] = splitControls(points, center).map(controls => controls.filter(outside));
  const manual = Boolean(routing.labelPosition || routing.waypoints.length);
  const firstPatch = manual ? edgeRoutingPatch(edge, {
    ...(routing.labelPosition ? { labelPosition: null } : {}),
    ...(routing.waypoints.length ? { waypoints: before } : {}),
  }) : {};
  const lastPatch = manual ? edgeRoutingPatch(edge, {
    ...(routing.labelPosition ? { labelPosition: null } : {}),
    ...(routing.waypoints.length ? { waypoints: after } : {}),
  }) : {};
  const continuation = { ...createEdge(node.id, edge.toNode, ''),
    toSide: edge.toSide ?? 'top', fromEnd: 'none' as const, toEnd: edge.toEnd ?? 'arrow' as const,
    ...(edge.color !== undefined ? { color: edge.color } : {}),
    ...(edge.paperstreamStyle !== undefined ? { paperstreamStyle: structuredClone(edge.paperstreamStyle) } : {}),
    ...lastPatch, fromSide: facingSide(node, after[0] ?? end) };
  const next = addNode(document, node);
  next.edges = [...document.edges.map(item => item.id === edgeId
    ? { ...item, ...firstPatch, toNode: node.id, toSide: facingSide(node, before.at(-1) ?? start), toEnd: 'none' as const, label: '' } : item), continuation];
  validateCanvas(next);
  return { document: next, nodeId: node.id };
}
