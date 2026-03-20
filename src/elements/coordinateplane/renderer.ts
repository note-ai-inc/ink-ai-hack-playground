// CoordinatePlane element renderer

import type { BoundingBox } from '../../types';
import type { CoordinatePlaneElement } from './types';
import { renderStrokes } from '../../canvas/StrokeRenderer';
import type { RenderOptions } from '../registry/ElementPlugin';

// Visual constants
const GRID_LINE_COLOR = '#cccccc';
const GRID_LINE_WIDTH = 1;
const GRID_LINE_DASH = [4, 4];

const AXIS_LINE_COLOR = '#333333';
const AXIS_LINE_WIDTH = 2;

const ARROWHEAD_SIZE = 10;

const LABEL_FONT = '12px sans-serif';
const LABEL_COLOR = '#333333';
const AXIS_LABEL_FONT = 'bold 14px sans-serif';
const AXIS_LABEL_COLOR = '#333333';

const POINT_RADIUS = 6;
const POINT_COLOR = '#cc0000';
const POINT_LABEL_FONT = '10px sans-serif';
const POINT_LABEL_COLOR = '#cc0000';

const HANDLE_RADIUS = 6;
const HANDLE_COLOR = '#0066cc';
const HANDLE_STROKE_COLOR = '#ffffff';
const HANDLE_STROKE_WIDTH = 2;

/**
 * Render a CoordinatePlane element.
 * All element data is in LOCAL coordinates; transform positions the top-left.
 */
export function render(
  ctx: CanvasRenderingContext2D,
  element: CoordinatePlaneElement,
  options?: RenderOptions
): void {
  const morphProgress = options?.morphProgress ?? 1;

  // Apply transform to convert from local to canvas coordinates
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  ctx.save();
  ctx.translate(tx, ty);

  // Phase 1: Source strokes fade out (progress 0-0.5)
  if (morphProgress < 0.5 && element.sourceStrokes.length > 0) {
    const strokeAlpha = 1 - morphProgress * 2;
    ctx.save();
    ctx.globalAlpha = strokeAlpha;
    renderStrokes(ctx, element.sourceStrokes, options?.strokeOptions);
    ctx.restore();
  }

  // Phase 2: Final coordinate plane fades in (progress 0.3-1.0)
  if (morphProgress > 0.3) {
    const planeAlpha = Math.min(1, (morphProgress - 0.3) / 0.7);
    ctx.save();
    ctx.globalAlpha = planeAlpha;

    // Render in order: grid, axes, labels, ink strokes, handles, points
    renderGrid(ctx, element);
    renderAxes(ctx, element);
    renderLabels(ctx, element);
    renderInkStrokes(ctx, element, options);
    renderAxisHandles(ctx, element);
    renderPoints(ctx, element);

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Render the grid lines.
 */
function renderGrid(ctx: CanvasRenderingContext2D, element: CoordinatePlaneElement): void {
  const { origin, xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative, gridSpacing } = element;

  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = GRID_LINE_WIDTH;
  ctx.setLineDash(GRID_LINE_DASH);

  // Vertical grid lines (parallel to Y axis)
  // Positive X direction
  for (let i = 1; i <= Math.ceil(xAxisPositive / gridSpacing); i++) {
    const x = origin.x + i * gridSpacing;
    if (x > origin.x + xAxisPositive) break;

    ctx.beginPath();
    ctx.moveTo(x, origin.y - yAxisPositive);
    ctx.lineTo(x, origin.y + yAxisNegative);
    ctx.stroke();
  }

  // Negative X direction
  for (let i = 1; i <= Math.ceil(xAxisNegative / gridSpacing); i++) {
    const x = origin.x - i * gridSpacing;
    if (x < origin.x - xAxisNegative) break;

    ctx.beginPath();
    ctx.moveTo(x, origin.y - yAxisPositive);
    ctx.lineTo(x, origin.y + yAxisNegative);
    ctx.stroke();
  }

  // Horizontal grid lines (parallel to X axis)
  // Positive Y direction (up, which is negative in canvas coords)
  for (let i = 1; i <= Math.ceil(yAxisPositive / gridSpacing); i++) {
    const y = origin.y - i * gridSpacing;
    if (y < origin.y - yAxisPositive) break;

    ctx.beginPath();
    ctx.moveTo(origin.x - xAxisNegative, y);
    ctx.lineTo(origin.x + xAxisPositive, y);
    ctx.stroke();
  }

  // Negative Y direction (down)
  for (let i = 1; i <= Math.ceil(yAxisNegative / gridSpacing); i++) {
    const y = origin.y + i * gridSpacing;
    if (y > origin.y + yAxisNegative) break;

    ctx.beginPath();
    ctx.moveTo(origin.x - xAxisNegative, y);
    ctx.lineTo(origin.x + xAxisPositive, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

/**
 * Render the X and Y axes with arrowheads.
 */
function renderAxes(ctx: CanvasRenderingContext2D, element: CoordinatePlaneElement): void {
  const { origin, xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative } = element;

  ctx.strokeStyle = AXIS_LINE_COLOR;
  ctx.lineWidth = AXIS_LINE_WIDTH;
  ctx.lineCap = 'round';

  // X axis
  ctx.beginPath();
  ctx.moveTo(origin.x - xAxisNegative, origin.y);
  ctx.lineTo(origin.x + xAxisPositive, origin.y);
  ctx.stroke();

  // Y axis
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y + yAxisNegative);
  ctx.lineTo(origin.x, origin.y - yAxisPositive);
  ctx.stroke();

  // Arrowheads (only on positive ends)
  ctx.fillStyle = AXIS_LINE_COLOR;

  // X axis arrowhead (pointing right)
  if (xAxisPositive > 0) {
    const tipX = origin.x + xAxisPositive;
    const tipY = origin.y;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ARROWHEAD_SIZE, tipY - ARROWHEAD_SIZE / 2);
    ctx.lineTo(tipX - ARROWHEAD_SIZE, tipY + ARROWHEAD_SIZE / 2);
    ctx.closePath();
    ctx.fill();
  }

  // Y axis arrowhead (pointing up)
  if (yAxisPositive > 0) {
    const tipX = origin.x;
    const tipY = origin.y - yAxisPositive;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ARROWHEAD_SIZE / 2, tipY + ARROWHEAD_SIZE);
    ctx.lineTo(tipX + ARROWHEAD_SIZE / 2, tipY + ARROWHEAD_SIZE);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Render axis labels and grid numbers.
 */
function renderLabels(ctx: CanvasRenderingContext2D, element: CoordinatePlaneElement): void {
  const { origin, xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative, gridSpacing } = element;

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = LABEL_FONT;

  // Grid number labels
  // X axis labels (positive)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 1; i <= Math.ceil(xAxisPositive / gridSpacing); i++) {
    const x = origin.x + i * gridSpacing;
    if (x > origin.x + xAxisPositive - ARROWHEAD_SIZE) break;
    ctx.fillText(String(i), x, origin.y + 5);
  }

  // X axis labels (negative)
  for (let i = 1; i <= Math.ceil(xAxisNegative / gridSpacing); i++) {
    const x = origin.x - i * gridSpacing;
    if (x < origin.x - xAxisNegative) break;
    ctx.fillText(String(-i), x, origin.y + 5);
  }

  // Y axis labels (positive, up)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 1; i <= Math.ceil(yAxisPositive / gridSpacing); i++) {
    const y = origin.y - i * gridSpacing;
    if (y < origin.y - yAxisPositive + ARROWHEAD_SIZE) break;
    ctx.fillText(String(i), origin.x - 5, y);
  }

  // Y axis labels (negative, down)
  for (let i = 1; i <= Math.ceil(yAxisNegative / gridSpacing); i++) {
    const y = origin.y + i * gridSpacing;
    if (y > origin.y + yAxisNegative) break;
    ctx.fillText(String(-i), origin.x - 5, y);
  }

  // Origin label "0"
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('0', origin.x - 5, origin.y + 5);

  // Axis labels "X" and "Y"
  ctx.font = AXIS_LABEL_FONT;
  ctx.fillStyle = AXIS_LABEL_COLOR;

  // "X" label near positive X arrowhead
  if (xAxisPositive > 0) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('X', origin.x + xAxisPositive + 5, origin.y + 5);
  }

  // "Y" label near positive Y arrowhead
  if (yAxisPositive > 0) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Y', origin.x + 8, origin.y - yAxisPositive);
  }
}

/**
 * Render axis handles for drag interaction.
 */
function renderAxisHandles(ctx: CanvasRenderingContext2D, element: CoordinatePlaneElement): void {
  const { origin, xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative } = element;

  const handles = [
    // +X handle (right end)
    { x: origin.x + xAxisPositive, y: origin.y },
    // -X handle (left end)
    { x: origin.x - xAxisNegative, y: origin.y },
    // +Y handle (top end)
    { x: origin.x, y: origin.y - yAxisPositive },
    // -Y handle (bottom end)
    { x: origin.x, y: origin.y + yAxisNegative },
  ];

  for (const handle of handles) {
    // Draw handle circle
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, HANDLE_RADIUS, 0, Math.PI * 2);

    // Fill
    ctx.fillStyle = HANDLE_COLOR;
    ctx.fill();

    // Stroke
    ctx.strokeStyle = HANDLE_STROKE_COLOR;
    ctx.lineWidth = HANDLE_STROKE_WIDTH;
    ctx.stroke();
  }
}

/**
 * Render user-drawn ink strokes (functions, annotations, etc.).
 */
function renderInkStrokes(
  ctx: CanvasRenderingContext2D,
  element: CoordinatePlaneElement,
  options?: RenderOptions
): void {
  if (!element.inkStrokes || element.inkStrokes.length === 0) return;

  // Render each ink stroke
  const strokes = element.inkStrokes.map(rs => rs.stroke);
  renderStrokes(ctx, strokes, options?.strokeOptions);
}

/**
 * Render plotted points.
 */
function renderPoints(ctx: CanvasRenderingContext2D, element: CoordinatePlaneElement): void {
  for (const point of element.points) {
    // Draw point circle
    ctx.beginPath();
    ctx.arc(point.position.x, point.position.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = POINT_COLOR;
    ctx.fill();

    // Draw coordinate label
    ctx.font = POINT_LABEL_FONT;
    ctx.fillStyle = POINT_LABEL_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`(${point.x}, ${point.y})`, point.position.x + POINT_RADIUS + 2, point.position.y - 2);
  }
}

/**
 * Get bounding box for CoordinatePlane element.
 * Returns bounds in CANVAS coordinates (local bounds + transform offset).
 */
export function getBounds(element: CoordinatePlaneElement): BoundingBox | null {
  const { origin, xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative, transform } = element;

  // Add padding for labels and handles
  const padding = 30;

  // Local bounds
  const localLeft = origin.x - xAxisNegative - padding;
  const localTop = origin.y - yAxisPositive - padding;
  const localRight = origin.x + xAxisPositive + padding;
  const localBottom = origin.y + yAxisNegative + padding;

  // Apply transform translation to get canvas coordinates
  const tx = transform.values[6];
  const ty = transform.values[7];

  return {
    left: localLeft + tx,
    top: localTop + ty,
    right: localRight + tx,
    bottom: localBottom + ty,
  };
}
