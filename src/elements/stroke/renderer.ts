// Stroke element renderer

import type { BoundingBox } from '../../types';
import type { StrokeElement } from './types';
import { renderStrokes, getStrokesBounds } from '../../canvas/StrokeRenderer';
import type { RenderOptions } from '../registry/ElementPlugin';

// Render a Stroke element
export function render(
  ctx: CanvasRenderingContext2D,
  element: StrokeElement,
  options?: RenderOptions
): void {
  renderStrokes(ctx, element.strokes, options?.strokeOptions);
}

// Get bounding box for Stroke element
export function getBounds(element: StrokeElement): BoundingBox | null {
  return getStrokesBounds(element.strokes);
}
