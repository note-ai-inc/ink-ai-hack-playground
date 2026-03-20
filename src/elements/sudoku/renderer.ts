// Sudoku element renderer
//
// Renders the 9x9 grid with minor/major lines, given digits as text,
// user digits as handwritten strokes, conflict highlighting, and
// completion overlay.

import type { BoundingBox } from '../../types';
import type { SudokuElement } from './types';
import { renderStrokes } from '../../canvas/StrokeRenderer';
import type { RenderOptions } from '../registry/ElementPlugin';
import {
  GRID_SIZE,
  BOX_SIZE,
  TOTAL_CELLS,
  rowOf,
  colOf,
  isComplete,
} from './gameState';

const CANVAS_GRID_SIZE = 50;
const CELL_FILL = '#f0f0f0';
const CELL_BORDER = '#333333';
const MINOR_LINE_WIDTH = 1;
const MAJOR_LINE_WIDTH = 2.5;
const DIGIT_COLOR = '#0a1b65';
const GRID_COLOR_MINOR = '#dddddd';
const GRID_COLOR_MAJOR = '#333333';
const CONFLICT_FILL = 'rgba(255, 0, 0, 0.2)';
const PLACEHOLDER_FILL = 'rgba(0, 0, 0, 0.13)';
const COMPLETE_FILL = 'rgba(0, 136, 0, 0.13)';
const COMPLETION_BG = 'rgba(255, 255, 255, 0.8)';
const COMPLETION_TEXT_COLOR = '#0a1b65';

export function render(
  ctx: CanvasRenderingContext2D,
  element: SudokuElement,
  options?: RenderOptions,
): void {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  ctx.save();
  ctx.translate(tx, ty);

  const cellWidth = element.width / GRID_SIZE;
  const cellHeight = element.height / GRID_SIZE;

  drawGridHighlightFill(ctx, element);
  drawBackground(ctx, element);
  drawCellHighlights(ctx, element, cellWidth, cellHeight);
  drawGridLines(ctx, element, cellWidth, cellHeight);
  drawGridHighlightBorder(ctx, element);
  drawDigits(ctx, element, cellWidth, cellHeight, options);
  drawCompletionOverlay(ctx, element);

  ctx.restore();
}

function gridHighlightRect(element: SudokuElement): { x: number; y: number; w: number; h: number } {
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

function drawGridHighlightFill(ctx: CanvasRenderingContext2D, element: SudokuElement): void {
  const { x, y, w, h } = gridHighlightRect(element);
  ctx.fillStyle = CELL_FILL;
  ctx.fillRect(x, y, w, h);
}

function drawGridHighlightBorder(ctx: CanvasRenderingContext2D, element: SudokuElement): void {
  const { x, y, w, h } = gridHighlightRect(element);
  ctx.strokeStyle = CELL_BORDER;
  ctx.lineWidth = MAJOR_LINE_WIDTH;
  ctx.strokeRect(x, y, w, h);
}

function drawBackground(_ctx: CanvasRenderingContext2D, _element: SudokuElement): void {
}

function drawCellHighlights(
  ctx: CanvasRenderingContext2D,
  element: SudokuElement,
  cellWidth: number,
  cellHeight: number,
): void {
  for (const cellIndex of element.placeholderCells) {
    const col = colOf(cellIndex);
    const row = rowOf(cellIndex);
    ctx.fillStyle = PLACEHOLDER_FILL;
    ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
  }

  for (const cellIndex of element.conflictCells) {
    const col = colOf(cellIndex);
    const row = rowOf(cellIndex);
    ctx.fillStyle = CONFLICT_FILL;
    ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
  }

  if (isComplete(element.gameState)) {
    ctx.fillStyle = COMPLETE_FILL;
    ctx.fillRect(0, 0, element.width, element.height);
  }
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  element: SudokuElement,
  cellWidth: number,
  cellHeight: number,
): void {
  for (let i = 1; i < GRID_SIZE; i++) {
    if (i % BOX_SIZE !== 0) {
      ctx.strokeStyle = GRID_COLOR_MINOR;
      ctx.lineWidth = MINOR_LINE_WIDTH;

      ctx.beginPath();
      ctx.moveTo(cellWidth * i, 0);
      ctx.lineTo(cellWidth * i, element.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, cellHeight * i);
      ctx.lineTo(element.width, cellHeight * i);
      ctx.stroke();
    }
  }

  for (let i = 1; i < BOX_SIZE; i++) {
    ctx.strokeStyle = GRID_COLOR_MAJOR;
    ctx.lineWidth = MAJOR_LINE_WIDTH;

    const x = cellWidth * i * BOX_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, element.height);
    ctx.stroke();

    const y = cellHeight * i * BOX_SIZE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(element.width, y);
    ctx.stroke();
  }
}

function drawDigits(
  ctx: CanvasRenderingContext2D,
  element: SudokuElement,
  cellWidth: number,
  cellHeight: number,
  options?: RenderOptions,
): void {
  const fontSize = cellHeight / 2;

  ctx.fillStyle = DIGIT_COLOR;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let cellIndex = 0; cellIndex < TOTAL_CELLS; cellIndex++) {
    const row = rowOf(cellIndex);
    const col = colOf(cellIndex);
    const centerX = cellWidth * col + cellWidth / 2;
    const centerY = cellHeight * row + cellHeight / 2;

    const originalDigit = element.gameState.originalGrid[cellIndex];
    if (originalDigit !== 0) {
      ctx.fillText(originalDigit.toString(), centerX, centerY);
    } else {
      const playerStrokes = element.playerDigitStrokes[cellIndex];
      if (playerStrokes && playerStrokes.length > 0) {
        ctx.save();
        ctx.translate(-element.transform.values[6], -element.transform.values[7]);
        renderStrokes(ctx, playerStrokes, options?.strokeOptions);
        ctx.translate(element.transform.values[6], element.transform.values[7]);
        ctx.restore();
      }
    }
  }
}

function drawCompletionOverlay(
  ctx: CanvasRenderingContext2D,
  element: SudokuElement,
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

export function getBounds(element: SudokuElement): BoundingBox | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  return {
    left: tx,
    top: ty,
    right: tx + element.width,
    bottom: ty + element.height,
  };
}
