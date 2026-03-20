// Nonogram element renderer

import type { BoundingBox } from '../../types';
import type { NonogramElement, NonogramGameState } from './types';
import type { RenderOptions } from '../registry/ElementPlugin';

const CANVAS_GRID_SIZE = 50;
const GRID_LINE_COLOR = '#b0b0b0';
const CELL_BORDER = '#333333';
const CELL_BORDER_WIDTH = 2.5;
const BG_FILL = 'rgba(224, 224, 224, 0.3)';
const FILLED_CELL = '#333333';
const MARKED_CELL = '#cc0000';
const EMPTY_CELL = '#f5f5f5';
const CLUE_COLOR = '#333333';

// Cache for loaded images (keyed by data URL)
const imageCache = new Map<string, HTMLImageElement>();

/** Preload an image into the cache. Resolves once the image is decoded. */
export function preloadNonogramImage(dataUrl: string): Promise<void> {
  if (!dataUrl) return Promise.resolve();
  const existing = imageCache.get(dataUrl);
  if (existing?.complete) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const img = existing ?? new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to preload nonogram image'));
    if (!existing) {
      imageCache.set(dataUrl, img);
      img.src = dataUrl;
    }
  });
}

function getOrLoadImage(dataUrl: string): HTMLImageElement | null {
  if (!dataUrl) return null;
  const cached = imageCache.get(dataUrl);
  if (cached?.complete) return cached;
  return null;
}

export function render(
  ctx: CanvasRenderingContext2D,
  element: NonogramElement,
  _options?: RenderOptions,
): void {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  ctx.save();
  ctx.translate(tx, ty);

  // Background
  ctx.fillStyle = BG_FILL;
  ctx.fillRect(0, 0, element.width, element.height);

  if (element.isGenerating || !element.gameState) {
    drawLoadingState(ctx, element);
  } else if (element.isSolved) {
    drawSolvedState(ctx, element);
  } else {
    drawPlayingState(ctx, element, element.gameState);
  }

  // Border
  ctx.strokeStyle = CELL_BORDER;
  ctx.lineWidth = CELL_BORDER_WIDTH;
  ctx.strokeRect(0, 0, element.width, element.height);

  ctx.restore();
}

function drawLoadingState(ctx: CanvasRenderingContext2D, element: NonogramElement): void {
  const cx = element.width / 2;
  const cy = element.height / 2;

  // Animated spinner
  const time = performance.now() / 1000;
  const angle = time * 3;

  ctx.strokeStyle = '#666';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy - 15, 12, angle, angle + Math.PI * 1.5);
  ctx.stroke();

  // "Generating..." text
  ctx.fillStyle = '#666';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Generating...', cx, cy + 10);

  // Show prompt
  if (element.prompt) {
    ctx.fillStyle = '#999';
    ctx.font = '12px sans-serif';
    ctx.fillText(`"${element.prompt}"`, cx, cy + 30);
  }
}

function drawSolvedState(ctx: CanvasRenderingContext2D, element: NonogramElement): void {
  if (!element.gameState) return;

  const gameState = element.gameState;
  const layout = computeGridLayout(gameState);
  if (!layout) return;

  const { gridLeft, gridTop, cellWidth, cellHeight } = layout;
  const { rows, cols } = gameState;

  // Draw cells with their image colors
  for (let i = 0; i < gameState.solution.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = gridLeft + c * cellWidth;
    const y = gridTop + r * cellHeight;

    if (gameState.solution[i]) {
      ctx.fillStyle = gameState.cellColors[i] || FILLED_CELL;
      ctx.fillRect(x, y, cellWidth, cellHeight);
    }
  }

  // Draw grid lines
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 0.5;
  for (let r = 0; r <= rows; r++) {
    const y = gridTop + r * cellHeight;
    ctx.beginPath();
    ctx.moveTo(gridLeft, y);
    ctx.lineTo(gridLeft + cols * cellWidth, y);
    ctx.stroke();
  }
  for (let c = 0; c <= cols; c++) {
    const x = gridLeft + c * cellWidth;
    ctx.beginPath();
    ctx.moveTo(x, gridTop);
    ctx.lineTo(x, gridTop + rows * cellHeight);
    ctx.stroke();
  }

  // Draw thumbnail of original image to the right of the grid
  const img = element.colorImageDataUrl ? getOrLoadImage(element.colorImageDataUrl) : null;
  if (img) {
    const gridRight = gridLeft + cols * cellWidth;
    const gridHeight = rows * cellHeight;
    const thumbSize = Math.round(gridHeight / 3);
    const thumbX = gridRight + CANVAS_GRID_SIZE / 2;
    const thumbY = gridTop;

    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, thumbX, thumbY, thumbSize, thumbSize);
    ctx.imageSmoothingEnabled = prevSmoothing;

    // Thumbnail border
    ctx.strokeStyle = CELL_BORDER;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(thumbX, thumbY, thumbSize, thumbSize);
  }
}

function drawPlayingState(
  ctx: CanvasRenderingContext2D,
  _element: NonogramElement,
  gameState: NonogramGameState,
): void {
  const { rows, cols, rowClues, colClues } = gameState;

  const layout = computeGridLayout(gameState);
  if (!layout) return;

  const { gridLeft, gridTop, cellWidth, cellHeight } = layout;
  const gridWidth = cols * cellWidth;
  const gridHeight = rows * cellHeight;

  // Draw cells
  for (let i = 0; i < gameState.playerGrid.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = gridLeft + c * cellWidth;
    const y = gridTop + r * cellHeight;
    const state = gameState.playerGrid[i];

    if (state === 'filled') {
      ctx.fillStyle = FILLED_CELL;
      ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
    } else if (state === 'marked') {
      ctx.fillStyle = EMPTY_CELL;
      ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
      // Draw X mark
      ctx.strokeStyle = MARKED_CELL;
      ctx.lineWidth = 1.5;
      const pad = cellWidth * 0.25;
      ctx.beginPath();
      ctx.moveTo(x + pad, y + pad);
      ctx.lineTo(x + cellWidth - pad, y + cellHeight - pad);
      ctx.moveTo(x + cellWidth - pad, y + pad);
      ctx.lineTo(x + pad, y + cellHeight - pad);
      ctx.stroke();
    } else {
      ctx.fillStyle = EMPTY_CELL;
      ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
    }
  }

  // Draw grid lines
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;

  for (let r = 0; r <= rows; r++) {
    const y = gridTop + r * cellHeight;
    ctx.beginPath();
    ctx.moveTo(gridLeft, y);
    ctx.lineTo(gridLeft + gridWidth, y);
    ctx.stroke();
  }

  for (let c = 0; c <= cols; c++) {
    const x = gridLeft + c * cellWidth;
    ctx.beginPath();
    ctx.moveTo(x, gridTop);
    ctx.lineTo(x, gridTop + gridHeight);
    ctx.stroke();
  }

  // Draw row clues (left side)
  const clueFontSize = Math.min(cellHeight * 0.6, 12);
  ctx.fillStyle = CLUE_COLOR;
  ctx.font = `bold ${clueFontSize}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let r = 0; r < rows; r++) {
    const clue = rowClues[r];
    const y = gridTop + r * cellHeight + cellHeight / 2;
    const clueStr = clue.join(' ');
    ctx.fillText(clueStr, gridLeft - 4, y);
  }

  // Draw column clues (top)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (let c = 0; c < cols; c++) {
    const clue = colClues[c];
    const x = gridLeft + c * cellWidth + cellWidth / 2;
    for (let i = 0; i < clue.length; i++) {
      const y = gridTop - (clue.length - 1 - i) * 14;
      ctx.fillText(clue[i].toString(), x, y);
    }
  }
}

export function getBounds(element: NonogramElement): BoundingBox | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  return {
    left: tx,
    top: ty,
    right: tx + element.width,
    bottom: ty + element.height,
  };
}

/**
 * Compute grid layout so that each cell is exactly CANVAS_GRID_SIZE (50px)
 * and the clue area snaps to a grid multiple. This keeps the playing cells
 * aligned with the page background grid.
 */
function computeGridLayout(gameState: NonogramGameState): {
  gridLeft: number;
  gridTop: number;
  cellWidth: number;
  cellHeight: number;
} | null {
  const { rowClues, colClues } = gameState;
  const maxRowClueLen = Math.max(...rowClues.map(c => c.length));
  const maxColClueLen = Math.max(...colClues.map(c => c.length));

  // Clue area sized to the minimum whole number of grid squares that fits the clues
  const clueCharWidth = 14;
  const clueCharHeight = 14;
  const rowClueAreaWidth = Math.ceil((maxRowClueLen * clueCharWidth + 8) / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
  const colClueAreaHeight = Math.ceil((maxColClueLen * clueCharHeight + 8) / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;

  return {
    gridLeft: rowClueAreaWidth,
    gridTop: colClueAreaHeight,
    cellWidth: CANVAS_GRID_SIZE,
    cellHeight: CANVAS_GRID_SIZE,
  };
}

// Exported for use by interaction handler
export function getGridLayout(element: NonogramElement): {
  gridLeft: number;
  gridTop: number;
  cellWidth: number;
  cellHeight: number;
} | null {
  if (!element.gameState) return null;
  return computeGridLayout(element.gameState);
}

/**
 * Compute the total element dimensions needed for a nonogram with the given
 * game state. Used at creation time to size the element correctly.
 */
export function computeNonogramSize(gameState: NonogramGameState): { width: number; height: number } {
  const layout = computeGridLayout(gameState);
  if (!layout) return { width: 500, height: 500 };
  const gridWidth = gameState.cols * CANVAS_GRID_SIZE;
  const gridHeight = gameState.rows * CANVAS_GRID_SIZE;
  // Extra space to the right for the solved-state thumbnail (1/3 grid height + gap)
  const thumbArea = Math.round(gridHeight / 3) + CANVAS_GRID_SIZE;
  return {
    width: layout.gridLeft + gridWidth + thumbArea,
    height: layout.gridTop + gridHeight,
  };
}
