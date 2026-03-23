// Queens interaction
//
// • Single tap (stroke in 1 cell)  → cycle that cell: empty → X → queen → empty
// • Line through 2+ cells          → mark ALL touched cells as X (bulk cancel)

import type { Stroke, BoundingBox } from '../../types';
import type { QueensElement } from './types';
import type { QueenCellState } from './types';
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

/** Returns ordered list of unique cell indices that the stroke passes through. */
function cellsAlongStroke(element: QueensElement, stroke: Stroke): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const pt of stroke.inputs.inputs) {
    const idx = findCell(element, pt.x, pt.y);
    if (idx !== null && !seen.has(idx)) {
      seen.add(idx);
      result.push(idx);
    }
  }
  return result;
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

  if (strokes.length !== 1) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const stroke = strokes[0];
  const inputs = stroke.inputs.inputs;
  if (inputs.length === 0) return { element, consumed: false, strokesConsumed: [] };

  const touchedCells = cellsAlongStroke(element, stroke);
  if (touchedCells.length === 0) return { element, consumed: false, strokesConsumed: [] };

  // ── Multi-cell line: bulk-cancel all touched cells as X ──────────────────
  if (touchedCells.length >= 2) {
    debugLog.info('Queens: bulk-cancel line', { cells: touchedCells.length });

    const newCells = [...element.gameState.cells] as QueenCellState[];
    for (const idx of touchedCells) {
      newCells[idx] = 'x';
    }
    const newState = { ...element.gameState, cells: newCells, won: false };
    const newConflicts = computeConflicts(newState);

    return {
      element: { ...element, gameState: newState, conflictCells: newConflicts },
      consumed: true,
      strokesConsumed: strokes,
    };
  }

  // ── Single cell: cycle empty → X → queen → empty ─────────────────────────
  const cellIdx = touchedCells[0];
  debugLog.info('Queens: cycling cell', { cellIdx, current: element.gameState.cells[cellIdx] });

  const newState = cycleCell(element.gameState, cellIdx);
  const newConflicts = computeConflicts(newState);

  return {
    element: { ...element, gameState: newState, conflictCells: newConflicts },
    consumed: true,
    strokesConsumed: strokes,
  };
}
