/** Explicit, whole-graph layout; ELK geometry never replaces the saved document. */
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { CanvasError, validateCanvas } from './canvas.ts';
import type { JSONCanvasDocument } from './canvas.ts';
import { edgeRoutingPatch } from './edge-routing.ts';

export interface ElkLayoutOptions {
  /** DOM sizes are CSS/graph pixels, not viewport-scaled client rectangles. */
  labelMeasurements?: ReadonlyMap<string, { text: string; width: number; height: number }>;
}

function labelSize(text: string, measured?: { text: string; width: number; height: number }) {
  if (measured?.text === text && [measured.width, measured.height].every(value => Number.isFinite(value) && value > 0)) {
    return { width: measured.width, height: measured.height };
  }
  // Hidden/unmounted labels have no DOM box. Estimate conservatively using the
  // editor's 12px text, 220px content width, 18px line height and box padding.
  const lines = text.split(/\r\n?|\n/).map(line => [...line].reduce((width, char) => width + (/[^\u0000-\u00ff]/u.test(char) ? 12 : 7.2), 0));
  return { width: Math.min(240, Math.max(24, ...lines.map(width => width + 20))),
    height: lines.reduce((rows, width) => rows + Math.max(1, Math.ceil(width / 220)), 0) * 18 + 14 };
}

function coordinate(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) throw new CanvasError('智能竖排未返回有效坐标，原图保持不变。');
  return value;
}

/** Only call from an explicit rearrange command. The caller must discard the
 * awaited result if its active document changed while layout was running.
 * No card/edge semantics, ordering, sizes or unknown metadata are reconstructed
 * from ELK. Only positions, port sides and known route geometry are patched.
 */
export async function layoutWithElk(document: JSONCanvasDocument, options: ElkLayoutOptions = {}): Promise<JSONCanvasDocument> {
  validateCanvas(document);
  if (!document.nodes.length) return document;
  // Snapshot before the asynchronous import/engine call, including extensions.
  const snapshot = structuredClone(document);
  for (const edge of snapshot.edges) edgeRoutingPatch(edge, { waypoints: null, labelPosition: null });
  // Internal IDs cannot collide with user IDs, port IDs or the root graph ID.
  const nodeIds = new Map(snapshot.nodes.map((node, index) => [node.id, `n${index}`]));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.randomSeed': '1', 'elk.padding': '[top=32,left=32,bottom=32,right=32]',
      'elk.spacing.nodeNode': '80', 'elk.spacing.componentComponent': '100',
      'elk.spacing.edgeNode': '24', 'elk.spacing.edgeEdge': '18',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '18',
      'elk.layered.mergeEdges': 'false',
    },
    children: snapshot.nodes.map(node => {
      const id = nodeIds.get(node.id)!;
      return { id, width: node.width, height: node.height,
        layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
        ports: [
          { id: `${id}-in`, x: node.width / 2, y: 0, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'NORTH' } },
          { id: `${id}-out`, x: node.width / 2, y: node.height, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'SOUTH' } },
        ],
      };
    }),
    edges: snapshot.edges.map((edge, index) => ({ id: `e${index}`,
      sources: [`${nodeIds.get(edge.fromNode)}-out`], targets: [`${nodeIds.get(edge.toNode)}-in`],
      ...(edge.label ? { labels: [{ id: `l${index}`, text: edge.label,
        ...labelSize(edge.label, options.labelMeasurements?.get(edge.id)),
        layoutOptions: { 'elk.edgeLabels.placement': 'CENTER', 'elk.edgeLabels.inline': 'true' },
      }] } : {}),
    })),
  };
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  // Bundled ELK uses an in-process worker shim, not a native Worker needing
  // termination. This instance becomes collectible after the operation.
  const engine = new ELK({ algorithms: ['layered'] });
  const laidOut = await engine.layout(graph);
  const placedNodes = new Map(laidOut.children?.map(node => [node.id, node]));
  const placedEdges = new Map(laidOut.edges?.map(edge => [edge.id, edge]));
  const next: JSONCanvasDocument = { ...snapshot,
    // Preserve the explicit result during later text/height edits. Users rerun
    // the command when ready; the old simple vertical auto-layout must not run.
    paperstreamLayout: 'manual',
    nodes: snapshot.nodes.map(node => {
      const placed = placedNodes.get(nodeIds.get(node.id)!);
      // JSON Canvas node geometry is integral; ELK may place odd-sized nodes
      // on half pixels. Routing extensions deliberately retain their precision.
      return { ...node, x: Math.round(coordinate(placed?.x)), y: Math.round(coordinate(placed?.y)) };
    }),
    edges: snapshot.edges.map((edge, index) => {
      const placed = placedEdges.get(`e${index}`), section = placed?.sections?.[0];
      if (!section || placed?.sections?.length !== 1) throw new CanvasError('智能竖排未返回完整连线路径，原图保持不变。');
      const label = placed?.labels?.[0];
      if (edge.label && !label) throw new CanvasError('智能竖排未返回关系文字位置，原图保持不变。');
      const geometry = edgeRoutingPatch(edge, {
        waypoints: (section.bendPoints ?? []).map(point => ({ x: coordinate(point.x), y: coordinate(point.y) })),
        labelPosition: label ? { x: coordinate(label.x) + coordinate(label.width) / 2,
          y: coordinate(label.y) + coordinate(label.height) / 2 } : null,
      });
      return { ...edge, fromSide: 'bottom', toSide: 'top',
        paperstreamStyle: { ...(geometry.paperstreamStyle as Record<string, unknown>), routeSource: 'elk' } };
    }),
  };
  validateCanvas(next);
  return next;
}
