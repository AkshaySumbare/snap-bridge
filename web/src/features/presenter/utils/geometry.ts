/**
 * Canvas maths shared by the connector layer and the drag hooks.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Horizontal-tangent cubic between two points.
 *
 * Connectors run reader → canvas (left to right) or card → card, so pulling
 * the control points out along x keeps the curve readable even when the two
 * endpoints are nearly vertical. The pull is capped so short links don't
 * balloon into loops.
 */
export function connectorPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const pull = Math.min(Math.max(Math.abs(dx) * 0.5, 24), 120);
  const c1 = { x: from.x + pull, y: from.y };
  const c2 = { x: to.x - pull, y: to.y };
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
