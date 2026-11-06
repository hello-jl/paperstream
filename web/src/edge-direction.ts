import { CanvasError } from './canvas.ts';
import type { CanvasEdge } from './canvas.ts';

/** Direction is relative to the stored fromNode → toNode endpoints. */
export type EdgeDirection = 'forward' | 'reverse' | 'both' | 'none';
export type EdgeDirectionPatch = Required<Pick<CanvasEdge, 'fromEnd' | 'toEnd'>>;

/** JSON Canvas defaults are no source arrow and an arrow at the target. */
export function readEdgeDirection(edge: CanvasEdge): EdgeDirection {
  const sourceArrow = edge.fromEnd === 'arrow';
  const targetArrow = edge.toEnd !== 'none';
  return sourceArrow ? (targetArrow ? 'both' : 'reverse') : (targetArrow ? 'forward' : 'none');
}

/** Always specify both ends so changing direction clears any previous arrows. */
export function directionPatch(direction: EdgeDirection): EdgeDirectionPatch {
  switch (direction) {
    case 'forward': return { fromEnd: 'none', toEnd: 'arrow' };
    case 'reverse': return { fromEnd: 'arrow', toEnd: 'none' };
    case 'both': return { fromEnd: 'arrow', toEnd: 'arrow' };
    case 'none': return { fromEnd: 'none', toEnd: 'none' };
    default: throw new CanvasError('连线方向必须是 forward、reverse、both 或 none。');
  }
}
