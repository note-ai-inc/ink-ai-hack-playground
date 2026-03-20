// Nonogram interaction - toggle cells via tap gestures

import type { Stroke, BoundingBox } from '../../types';
import type { NonogramElement } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import { debugLog } from '../../debug/DebugLogger';
import { checkSolved } from './gameState';
import type { NonogramGameState, NonogramCellState } from './types';
import { getGridLayout } from './renderer';

function getNonogramBounds(element: NonogramElement): BoundingBox {
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

export function isInterestedIn(
  element: NonogramElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox,
): boolean {
  if (element.isSolved || element.isGenerating || !element.gameState) return false;
  const elementBounds = getNonogramBounds(element);
  return boundingBoxesOverlap(elementBounds, strokeBounds);
}

export async function acceptInk(
  element: NonogramElement,
  strokes: Stroke[],
  _recognitionResult?: HandwritingRecognitionResult,
): Promise<InteractionResult> {
  if (element.isSolved || element.isGenerating || !element.gameState) {
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

  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  const layout = getGridLayout(element);
  if (!layout) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // Walk every input point and collect unique cells the stroke passes through
  const hitCells = new Set<number>();
  const { cols, rows } = element.gameState;

  for (const inp of inputs) {
    const gridX = inp.x - tx - layout.gridLeft;
    const gridY = inp.y - ty - layout.gridTop;
    if (gridX < 0 || gridY < 0) continue;

    const col = Math.floor(gridX / layout.cellWidth);
    const row = Math.floor(gridY / layout.cellHeight);
    if (col >= cols || row >= rows) continue;

    hitCells.add(row * cols + col);
  }

  if (hitCells.size === 0) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // Determine action from the first cell hit: all cells get the same transition
  const firstIdx = hitCells.values().next().value!;
  const firstState = element.gameState.playerGrid[firstIdx];
  const nextState: NonogramCellState =
    firstState === 'empty' ? 'filled' :
    firstState === 'filled' ? 'marked' : 'empty';

  const newGrid = [...element.gameState.playerGrid];
  for (const idx of hitCells) {
    newGrid[idx] = nextState;
  }
  const newGameState: NonogramGameState = { ...element.gameState, playerGrid: newGrid };

  debugLog.info('Nonogram: toggling cells', { count: hitCells.size, action: `${firstState} → ${nextState}` });

  const solved = checkSolved(newGameState);

  if (solved) {
    debugLog.info('Nonogram: puzzle solved!');
  }

  const updatedElement: NonogramElement = {
    ...element,
    gameState: newGameState,
    isSolved: solved,
  };

  return { element: updatedElement, consumed: true, strokesConsumed: strokes };
}
