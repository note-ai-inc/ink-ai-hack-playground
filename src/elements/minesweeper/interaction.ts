// Minesweeper interaction - reveal cells or toggle flags via ink gestures

import type { Stroke, BoundingBox } from '../../types';
import type { MinesweeperElement } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import { debugLog } from '../../debug/DebugLogger';
import { cellIndex, isGameActive, revealCell, toggleFlag, chordReveal } from './gameState';

function getMinesweeperCanvasBounds(element: MinesweeperElement): BoundingBox {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  return {
    left: tx,
    top: ty,
    right: tx + element.width,
    bottom: ty + element.height,
  };
}

function boundingBoxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/**
 * Detect a chevron (`<` or `>`) stroke — the extreme X point is
 * in the interior of the stroke, not at the endpoints.
 */
function isChevronStroke(stroke: Stroke): boolean {
  const inputs = stroke.inputs.inputs;
  if (inputs.length < 5) return false;

  let minX = Infinity;
  let maxX = -Infinity;
  let minXIdx = 0;
  let maxXIdx = 0;

  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i].x < minX) { minX = inputs[i].x; minXIdx = i; }
    if (inputs[i].x > maxX) { maxX = inputs[i].x; maxXIdx = i; }
  }

  const t = inputs.length - 1;
  const startX = inputs[0].x;
  const endX = inputs[t].x;

  const minXInterior = minXIdx > 0 && minXIdx < t;
  const maxXInterior = maxXIdx > 0 && maxXIdx < t;

  if (minXInterior && startX > minX + 5 && endX > minX + 5) return true;
  if (maxXInterior && startX < maxX - 5 && endX < maxX - 5) return true;

  return false;
}

function findCellIndex(
  element: MinesweeperElement,
  canvasX: number,
  canvasY: number,
): number | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const localX = canvasX - tx;
  const localY = canvasY - ty;

  const { rows, cols } = element.gameState;
  const cellWidth = element.width / cols;
  const cellHeight = element.height / rows;

  if (localX < 0 || localX >= element.width || localY < 0 || localY >= element.height) {
    return null;
  }

  const col = Math.min(Math.floor(localX / cellWidth), cols - 1);
  const row = Math.min(Math.floor(localY / cellHeight), rows - 1);

  return cellIndex(cols, row, col);
}

export function isInterestedIn(
  element: MinesweeperElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox,
): boolean {
  if (!isGameActive(element.gameState)) return false;
  const elementBounds = getMinesweeperCanvasBounds(element);
  return boundingBoxesOverlap(elementBounds, strokeBounds);
}

export async function acceptInk(
  element: MinesweeperElement,
  strokes: Stroke[],
  _recognitionResult?: HandwritingRecognitionResult,
): Promise<InteractionResult> {
  if (!isGameActive(element.gameState)) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  if (strokes.length !== 1) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const stroke = strokes[0];
  const inputs = stroke.inputs.inputs;
  if (inputs.length < 1) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const centerX = inputs.reduce((sum, inp) => sum + inp.x, 0) / inputs.length;
  const centerY = inputs.reduce((sum, inp) => sum + inp.y, 0) / inputs.length;
  const idx = findCellIndex(element, centerX, centerY);

  if (idx === null) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  let newState;

  const cell = element.gameState.cells[idx];

  if (isChevronStroke(stroke)) {
    debugLog.info('Minesweeper: toggling flag (chevron)', { cell: idx });
    newState = toggleFlag(element.gameState, idx);
  } else if (cell.revealed && cell.adjacentMines > 0) {
    debugLog.info('Minesweeper: chord reveal', { cell: idx });
    newState = chordReveal(element.gameState, idx);
  } else {
    debugLog.info('Minesweeper: revealing cell', { cell: idx });
    newState = revealCell(element.gameState, idx);
  }

  if (newState === element.gameState) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const updatedElement: MinesweeperElement = {
    ...element,
    gameState: newState,
  };

  return { element: updatedElement, consumed: true, strokesConsumed: strokes };
}
