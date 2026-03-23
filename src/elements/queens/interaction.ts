// Queens interaction — tap/stroke in a cell cycles its state: empty → X → queen → empty.
// Any single stroke whose centroid lands inside the grid triggers a cycle.

import type { Stroke, BoundingBox } from '../../types';
import type { QueensElement } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import { cycleCell, computeConflicts } from './gameState';
import { debugLog } from '../../debug/DebugLogger';

function elementBounds(element: QueensElement): BoundingBox {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  return { left: tx, top: ty, right: tx + element.width, bottom: ty + element.height };
}

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function findCell(element: QueensElement, canvasX: number, canvasY: number): number | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const lx = canvasX - tx;
  const ly = canvasY - ty;
  if (lx < 0 || lx >= element.width || ly < 0 || ly >= element.height) return null;
  const n = element.gameState.size;
  const col = Math.min(Math.floor((lx / element.width) * n), n - 1);
  const row = Math.min(Math.floor((ly / element.height) * n), n - 1);
  return row * n + col;
}

export function isInterestedIn(
  element: QueensElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox,
): boolean {
  if (element.gameState.won) return false;
  return boxesOverlap(elementBounds(element), strokeBounds);
}

export async function acceptInk(
  element: QueensElement,
  strokes: Stroke[],
  _recognitionResult?: HandwritingRecognitionResult,
): Promise<InteractionResult> {
  if (element.gameState.won) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // Accept any single stroke (tap)
  if (strokes.length !== 1) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const inputs = strokes[0].inputs.inputs;
  if (inputs.length === 0) return { element, consumed: false, strokesConsumed: [] };

  // Use centroid of stroke to determine target cell
  const cx = inputs.reduce((s, p) => s + p.x, 0) / inputs.length;
  const cy = inputs.reduce((s, p) => s + p.y, 0) / inputs.length;

  const cellIdx = findCell(element, cx, cy);
  if (cellIdx === null) return { element, consumed: false, strokesConsumed: [] };

  debugLog.info('Queens: cycling cell', { cellIdx, current: element.gameState.cells[cellIdx] });

  const newState = cycleCell(element.gameState, cellIdx);
  const newConflicts = computeConflicts(newState);

  const updatedElement: QueensElement = {
    ...element,
    gameState: newState,
    conflictCells: newConflicts,
  };

  return { element: updatedElement, consumed: true, strokesConsumed: strokes };
}
