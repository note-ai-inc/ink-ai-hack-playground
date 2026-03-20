// InkText element renderer

import type { BoundingBox } from '../../types';
import type { InkTextElement } from './types';
import { renderStrokes } from '../../canvas/StrokeRenderer';
import type { RenderOptions } from '../registry/ElementPlugin';

// Render an InkText element
export function render(
  ctx: CanvasRenderingContext2D,
  element: InkTextElement,
  options?: RenderOptions
): void {
  // Render source strokes (default mode)
  renderStrokes(ctx, element.sourceStrokes, options?.strokeOptions);
}

// Get bounding box for InkText element
export function getBounds(element: InkTextElement): BoundingBox | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  // Include token bounds
  for (const line of element.lines) {
    for (const token of line.tokens) {
      const points = [token.quad.topLeft, token.quad.topRight, token.quad.bottomRight, token.quad.bottomLeft];
      for (const p of points) {
        left = Math.min(left, p.x);
        top = Math.min(top, p.y);
        right = Math.max(right, p.x);
        bottom = Math.max(bottom, p.y);
      }
    }
  }

  // Also include source strokes bounds
  for (const stroke of element.sourceStrokes) {
    for (const input of stroke.inputs.inputs) {
      left = Math.min(left, input.x);
      top = Math.min(top, input.y);
      right = Math.max(right, input.x);
      bottom = Math.max(bottom, input.y);
    }
    const halfSize = stroke.brush.size / 2;
    left -= halfSize;
    top -= halfSize;
    right += halfSize;
    bottom += halfSize;
  }

  if (!isFinite(left)) return null;

  return { left, top, right, bottom };
}
