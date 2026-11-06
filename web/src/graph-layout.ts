import { edgeRoutingPatch, readEdgeRouting } from './edge-routing.ts';
import { CanvasError, validateCanvas } from './canvas.ts';
import type { JSONCanvasDocument } from './canvas.ts';

export interface VerticalLayoutOptions { columnGap?: number; rowGap?: number }

/** Stable top-to-bottom layers; cycles share a layer instead of causing recursion loops. */
export function layoutVertical(document: JSONCanvasDocument, options: VerticalLayoutOptions = {}): JSONCanvasDocument {
  validateCanvas(document);
  const columnGap = options.columnGap ?? 100, rowGap = options.rowGap ?? 160;
  if (![columnGap, rowGap].every(value => Number.isSafeInteger(value) && value >= 40)) {
    throw new CanvasError('布局间距必须是至少 40 的安全整数。');
  }
  if (!document.nodes.length) return document;
  const byId = new Map(document.nodes.map(node => [node.id, node]));
  const ids = [...byId.keys()].sort();
  const adjacent = new Map(ids.map(id => [id, new Set<string>()]));
  for (const edge of document.edges) adjacent.get(edge.fromNode)!.add(edge.toNode);
  let counter = 0;
  const indexes = new Map<string, number>(), low = new Map<string, number>();
  const stack: string[] = [], active = new Set<string>(), components: string[][] = [];
  function visit(id: string) {
    indexes.set(id, counter); low.set(id, counter++); stack.push(id); active.add(id);
    for (const next of [...adjacent.get(id)!].sort()) {
      if (!indexes.has(next)) { visit(next); low.set(id, Math.min(low.get(id)!, low.get(next)!)); }
      else if (active.has(next)) low.set(id, Math.min(low.get(id)!, indexes.get(next)!));
    }
    if (low.get(id) === indexes.get(id)) {
      const component: string[] = [];
      let next: string;
      do { next = stack.pop()!; active.delete(next); component.push(next); } while (next !== id);
      components.push(component.sort());
    }
  }
  ids.forEach(id => { if (!indexes.has(id)) visit(id); });
  components.sort((a, b) => a[0].localeCompare(b[0]));
  const membership = new Map<string, number>();
  components.forEach((members, index) => members.forEach(id => membership.set(id, index)));
  const nextComponents = components.map(() => new Set<number>()), indegree = components.map(() => 0);
  for (const edge of document.edges) {
    const from = membership.get(edge.fromNode)!, to = membership.get(edge.toNode)!;
    if (from !== to && !nextComponents[from].has(to)) { nextComponents[from].add(to); indegree[to]++; }
  }
  const ranks = components.map(() => 0), queue = indegree.flatMap((n, i) => n === 0 ? [i] : []);
  for (let offset = 0; offset < queue.length; offset++) {
    const from = queue[offset];
    for (const to of [...nextComponents[from]].sort((a, b) => a - b)) {
      ranks[to] = Math.max(ranks[to], ranks[from] + 1);
      if (--indegree[to] === 0) queue.push(to);
    }
  }
  const layers = new Map<number, string[]>();
  components.forEach((members, index) => layers.set(ranks[index], [...(layers.get(ranks[index]) ?? []), ...members]));
  const rows = [...layers.entries()].sort(([a], [b]) => a - b);
  const widths = rows.map(([, members]) => members.reduce((sum, id) => sum + byId.get(id)!.width, 0) + columnGap * (members.length - 1));
  const totalWidth = Math.max(...widths);
  const positions = new Map<string, { x: number; y: number }>();
  let y = 0;
  rows.forEach(([rank, members], index) => {
    let x = Math.round((totalWidth - widths[index]) / 2);
    for (const id of members) { positions.set(id, { x, y }); x += byId.get(id)!.width + columnGap; }
    const height = Math.max(...members.map(id => byId.get(id)!.height));
    const labels = document.edges.filter(edge => ranks[membership.get(edge.fromNode)!] === rank
      && ranks[membership.get(edge.toNode)!] > rank);
    // Reserve the space occupied by a wrapped relation, keeping its label on
    // the vertical segment instead of needing a displaced leader.
    const labelSpace = Math.max(0, ...labels.map(edge => Math.ceil((edge.label?.length ?? 0) / 18) * 18 + 48));
    y += height + Math.max(rowGap, labelSpace);
  });
  const next: JSONCanvasDocument = { ...document,
    nodes: document.nodes.map(node => ({ ...node, ...positions.get(node.id)! })),
    edges: document.edges.map(edge => ({ ...edge, fromSide: 'bottom', toSide: 'top' })),
  };
  validateCanvas(next);
  return next;
}

/** Explicit re-layout resets absolute relation geometry in the same undo step. */
export function layoutVerticalWithRelations(document: JSONCanvasDocument): JSONCanvasDocument {
  const edges = document.edges.map(edge => {
    const geometry = readEdgeRouting(edge);
    return geometry.labelPosition || geometry.waypoints.length
      ? { ...edge, ...edgeRoutingPatch(edge, { labelPosition: null, waypoints: null }) } : edge;
  });
  return { ...layoutVertical({ ...document, edges }), paperstreamLayout: 'vertical' };
}
