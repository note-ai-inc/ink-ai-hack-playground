// Arrow element renderer

import type { ArrowElement } from './types';
import type { BoundingBox } from '../../types/primitives';
import { colorToCSSRGBA } from '../../types/brush';

const ARROWHEAD_LENGTH = 18;
const ARROWHEAD_ANGLE = Math.PI / 6; // 30 degrees

export function render(ctx: CanvasRenderingContext2D, element: ArrowElement): void {
  const { tail, head, color, strokeWidth, transform } = element;
  const v = transform.values;

  ctx.save();
  // Apply transform (column-major: [scaleX, skewY, 0, skewX, scaleY, 0, tx, ty, 1])
  ctx.transform(v[0], v[1], v[3], v[4], v[6], v[7]);

  ctx.strokeStyle = colorToCSSRGBA(color);
  ctx.fillStyle = colorToCSSRGBA(color);
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw shaft
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();

  // Draw arrowhead
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x);
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.lineTo(
    head.x - ARROWHEAD_LENGTH * Math.cos(angle - ARROWHEAD_ANGLE),
    head.y - ARROWHEAD_LENGTH * Math.sin(angle - ARROWHEAD_ANGLE),
  );
  ctx.moveTo(head.x, head.y);
  ctx.lineTo(
    head.x - ARROWHEAD_LENGTH * Math.cos(angle + ARROWHEAD_ANGLE),
    head.y - ARROWHEAD_LENGTH * Math.sin(angle + ARROWHEAD_ANGLE),
  );
  ctx.stroke();

  ctx.restore();
}

export function getBounds(element: ArrowElement): BoundingBox | null {
  const { tail, head, transform, strokeWidth } = element;
  const v = transform.values;

  // Apply transform (assuming no rotation/scale for now, just translation)
  const tx = v[6], ty = v[7];
  const padding = Math.max(strokeWidth, ARROWHEAD_LENGTH) + 4;

  return {
    left: Math.min(tail.x, head.x) + tx - padding,
    top: Math.min(tail.y, head.y) + ty - padding,
    right: Math.max(tail.x, head.x) + tx + padding,
    bottom: Math.max(tail.y, head.y) + ty + padding,
  };
}
