// Minesweeper element renderer

import type { BoundingBox } from '../../types';
import type { MinesweeperElement } from './types';
import type { RenderOptions } from '../registry/ElementPlugin';
import type { MinesweeperGameState } from './gameState';
import { rowOf, colOf } from './gameState';

const CANVAS_GRID_SIZE = 50;
const CELL_FILL = 'rgba(224, 224, 224, 0.3)';
const CELL_BORDER = '#333333';
const CELL_BORDER_WIDTH = 2.5;

const UNREVEALED_FILL = '#c0c0c0';
const REVEALED_FILL = '#e8e8e8';
const GRID_LINE_COLOR = '#b0b0b0';
const MINE_COLOR = '#333333';
const FLAG_COLOR = '#cc0000';
const EXPLODED_FILL = '#ff4444';

const NUMBER_COLORS: Record<number, string> = {
  1: '#0000ff',
  2: '#008000',
  3: '#ff0000',
  4: '#000080',
  5: '#800000',
  6: '#008080',
  7: '#000000',
  8: '#808080',
};

const COMPLETION_BG = 'rgba(255, 255, 255, 0.85)';
const COMPLETION_TEXT_COLOR = '#0a1b65';
const GAME_OVER_TEXT_COLOR = '#cc0000';

export function render(
  ctx: CanvasRenderingContext2D,
  element: MinesweeperElement,
  _options?: RenderOptions,
): void {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  ctx.save();
  ctx.translate(tx, ty);

  const { rows, cols } = element.gameState;
  const cellWidth = element.width / cols;
  const cellHeight = element.height / rows;

  drawGridHighlightFill(ctx, element);
  drawCells(ctx, element.gameState, cellWidth, cellHeight);
  drawGridLines(ctx, element.gameState, cellWidth, cellHeight);
  drawGridHighlightBorder(ctx, element);
  drawOverlay(ctx, element);

  ctx.restore();
}

function gridHighlightRect(element: MinesweeperElement): { x: number; y: number; w: number; h: number } {
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

function drawGridHighlightFill(ctx: CanvasRenderingContext2D, element: MinesweeperElement): void {
  const { x, y, w, h } = gridHighlightRect(element);
  ctx.fillStyle = CELL_FILL;
  ctx.fillRect(x, y, w, h);
}

function drawGridHighlightBorder(ctx: CanvasRenderingContext2D, element: MinesweeperElement): void {
  const { x, y, w, h } = gridHighlightRect(element);
  ctx.strokeStyle = CELL_BORDER;
  ctx.lineWidth = CELL_BORDER_WIDTH;
  ctx.strokeRect(x, y, w, h);
}

function drawCells(
  ctx: CanvasRenderingContext2D,
  state: MinesweeperGameState,
  cellWidth: number,
  cellHeight: number,
): void {
  const fontSize = cellHeight * 0.5;

  for (let i = 0; i < state.cells.length; i++) {
    const cell = state.cells[i];
    const r = rowOf(state.cols, i);
    const c = colOf(state.cols, i);
    const x = c * cellWidth;
    const y = r * cellHeight;

    if (!cell.revealed) {
      ctx.fillStyle = UNREVEALED_FILL;
      ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);

      if (cell.flagged) {
        ctx.fillStyle = FLAG_COLOR;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2691', x + cellWidth / 2, y + cellHeight / 2);
      }
    } else {
      ctx.fillStyle = REVEALED_FILL;
      ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);

      if (cell.hasMine) {
        if (state.gameOver) {
          ctx.fillStyle = EXPLODED_FILL;
          ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
        }

        ctx.fillStyle = MINE_COLOR;
        ctx.beginPath();
        ctx.arc(x + cellWidth / 2, y + cellHeight / 2, cellWidth * 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell.adjacentMines > 0) {
        ctx.fillStyle = NUMBER_COLORS[cell.adjacentMines] ?? '#000000';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cell.adjacentMines.toString(), x + cellWidth / 2, y + cellHeight / 2);
      }
    }
  }

  if (state.gameOver) {
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i];
      if (cell.hasMine && !cell.revealed) {
        const r = rowOf(state.cols, i);
        const c = colOf(state.cols, i);
        const x = c * cellWidth;
        const y = r * cellHeight;

        ctx.fillStyle = MINE_COLOR;
        ctx.beginPath();
        ctx.arc(x + cellWidth / 2, y + cellHeight / 2, cellWidth * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  state: MinesweeperGameState,
  cellWidth: number,
  cellHeight: number,
): void {
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;

  for (let r = 1; r < state.rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellHeight);
    ctx.lineTo(state.cols * cellWidth, r * cellHeight);
    ctx.stroke();
  }

  for (let c = 1; c < state.cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cellWidth, 0);
    ctx.lineTo(c * cellWidth, state.rows * cellHeight);
    ctx.stroke();
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, element: MinesweeperElement): void {
  const { gameState } = element;
  if (!gameState.gameOver && !gameState.won) return;

  const text = gameState.won ? 'You Win!' : 'Game Over';
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

  ctx.fillStyle = gameState.won ? COMPLETION_TEXT_COLOR : GAME_OVER_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

export function getBounds(element: MinesweeperElement): BoundingBox | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  return {
    left: tx,
    top: ty,
    right: tx + element.width,
    bottom: ty + element.height,
  };
}
