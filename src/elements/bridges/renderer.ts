// Bridges element renderer
//
// Renders islands as numbered circles and bridges as single/double lines
// connecting them, with color feedback for island satisfaction status.

import type { BoundingBox } from '../../types';
import type { BridgesElement } from './types';
import type { RenderOptions } from '../registry/ElementPlugin';
import { getBridgeCount, isComplete } from './gameState';

const CANVAS_GRID_SIZE = 50;
const CELL_FILL = 'rgba(224, 224, 224, 0.3)';
const CELL_BORDER = '#333333';
const CELL_BORDER_WIDTH = 2.5;
const ISLAND_FILL = '#ffffff';
const ISLAND_FILL_SATISFIED = '#d4edda';
const ISLAND_FILL_OVER = '#f8d7da';
const ISLAND_STROKE = '#333333';
const ISLAND_STROKE_WIDTH = 2.5;
const ISLAND_RADIUS_RATIO = 0.35;
const DIGIT_COLOR = '#0a1b65';
const BRIDGE_COLOR = '#555555';
const BRIDGE_WIDTH = 3;
const DOUBLE_BRIDGE_GAP = 8;
const COMPLETION_BG = 'rgba(255, 255, 255, 0.85)';
const COMPLETION_TEXT_COLOR = '#0a1b65';

export function render(
  ctx: CanvasRenderingContext2D,
  element: BridgesElement,
  _options?: RenderOptions,
): void {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  ctx.save();
  ctx.translate(tx, ty);

  const { gridCols, gridRows } = element.gameState;
  const cellWidth = element.width / gridCols;
  const cellHeight = element.height / gridRows;

  drawGridHighlightFill(ctx, element);
  drawBridges(ctx, element, cellWidth, cellHeight);
  drawIslands(ctx, element, cellWidth, cellHeight);
  drawGridHighlightBorder(ctx, element);
  drawCompletionOverlay(ctx, element);

  ctx.restore();
}

function gridHighlightRect(element: BridgesElement): { x: number; y: number; w: number; h: number } {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const g = CANVAS_GRID_SIZE;

  const startCol = Math.floor(tx / g);
  const startRow = Math.floor(ty / g);
  const endCol = Math.ceil((tx + element.width) / g);
  const endRow = Math.ceil((ty + element.height) / g);

  return {
    x: startCol * g - tx,
    y: startRow * g - ty,
    w: (endCol - startCol) * g,
    h: (endRow - startRow) * g,
  };
}

function drawGridHighlightFill(ctx: CanvasRenderingContext2D, element: BridgesElement): void {
  const { x, y, w, h } = gridHighlightRect(element);
  ctx.fillStyle = CELL_FILL;
  ctx.fillRect(x, y, w, h);
}

function drawGridHighlightBorder(ctx: CanvasRenderingContext2D, element: BridgesElement): void {
  const { x, y, w, h } = gridHighlightRect(element);
  ctx.strokeStyle = CELL_BORDER;
  ctx.lineWidth = CELL_BORDER_WIDTH;
  ctx.strokeRect(x, y, w, h);
}

function drawBridges(
  ctx: CanvasRenderingContext2D,
  element: BridgesElement,
  cellWidth: number,
  cellHeight: number,
): void {
  const { islands, bridges } = element.gameState;

  ctx.strokeStyle = BRIDGE_COLOR;
  ctx.lineCap = 'round';

  for (const bridge of bridges) {
    if (bridge.count === 0) continue;

    const a = islands[bridge.island1];
    const b = islands[bridge.island2];
    const ax = (a.col + 0.5) * cellWidth;
    const ay = (a.row + 0.5) * cellHeight;
    const bx = (b.col + 0.5) * cellWidth;
    const by = (b.row + 0.5) * cellHeight;

    if (bridge.count === 1) {
      ctx.lineWidth = BRIDGE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    } else {
      const isHorizontal = a.row === b.row;
      const offsetX = isHorizontal ? 0 : DOUBLE_BRIDGE_GAP / 2;
      const offsetY = isHorizontal ? DOUBLE_BRIDGE_GAP / 2 : 0;

      ctx.lineWidth = BRIDGE_WIDTH * 0.7;

      ctx.beginPath();
      ctx.moveTo(ax - offsetX, ay - offsetY);
      ctx.lineTo(bx - offsetX, by - offsetY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ax + offsetX, ay + offsetY);
      ctx.lineTo(bx + offsetX, by + offsetY);
      ctx.stroke();
    }
  }
}

function drawIslands(
  ctx: CanvasRenderingContext2D,
  element: BridgesElement,
  cellWidth: number,
  cellHeight: number,
): void {
  const { islands } = element.gameState;
  const radius = Math.min(cellWidth, cellHeight) * ISLAND_RADIUS_RATIO;
  const fontSize = radius * 1.2;
  const complete = isComplete(element.gameState);

  for (let i = 0; i < islands.length; i++) {
    const island = islands[i];
    const x = (island.col + 0.5) * cellWidth;
    const y = (island.row + 0.5) * cellHeight;

    const currentCount = getBridgeCount(element.gameState, i);
    let fill = ISLAND_FILL;
    if (complete) {
      fill = ISLAND_FILL_SATISFIED;
    } else if (currentCount === island.requiredBridges) {
      fill = ISLAND_FILL_SATISFIED;
    } else if (currentCount > island.requiredBridges) {
      fill = ISLAND_FILL_OVER;
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = ISLAND_STROKE;
    ctx.lineWidth = ISLAND_STROKE_WIDTH;
    ctx.stroke();

    ctx.fillStyle = DIGIT_COLOR;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(island.requiredBridges.toString(), x, y);
  }
}

function drawCompletionOverlay(
  ctx: CanvasRenderingContext2D,
  element: BridgesElement,
): void {
  if (!isComplete(element.gameState)) return;

  const text = 'Puzzle Complete!';
  const fontSize = 24;
  ctx.font = `bold ${fontSize}px sans-serif`;

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize;

  const cx = element.width / 2;
  const cy = element.height / 2;
  const padding = 12;

  ctx.fillStyle = COMPLETION_BG;
  ctx.fillRect(
    cx - textWidth / 2 - padding,
    cy - textHeight / 2 - padding,
    textWidth + padding * 2,
    textHeight + padding * 2,
  );

  ctx.fillStyle = COMPLETION_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

export function getBounds(element: BridgesElement): BoundingBox | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  return {
    left: tx,
    top: ty,
    right: tx + element.width,
    bottom: ty + element.height,
  };
}
