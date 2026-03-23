// Tango interaction — tap a cell to cycle: empty → circle → cross → empty

import type { Stroke, BoundingBox } from '../../types';
import type { TangoElement } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import { cycleCell, findConflicts, isSolved } from './gameState';

function getCanvasBounds(element: TangoElement): BoundingBox {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  return {
    left: tx,
    top: ty,
    right: tx + element.width,
    bottom: ty + element.height,
  };
}

function boundsOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function findCell(element: TangoElement, canvasX: number, canvasY: number): number | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const localX = canvasX - tx;
  const localY = canvasY - ty;
  const { size } = element.gameState;
  const cellSize = element.width / size;

  if (localX < 0 || localX >= element.width || localY < 0 || localY >= element.height) {
    return null;
  }

  const col = Math.min(Math.floor(localX / cellSize), size - 1);
  const row = Math.min(Math.floor(localY / cellSize), size - 1);

  return row * size + col;
}

export function isInterestedIn(
  element: TangoElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox,
): boolean {
  if (element.isSolved) return false;
  return boundsOverlap(getCanvasBounds(element), strokeBounds);
}

export async function acceptInk(
  element: TangoElement,
  strokes: Stroke[],
  _recognitionResult?: HandwritingRecognitionResult,
): Promise<InteractionResult> {
  if (element.isSolved) {
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

  // Use center of stroke to determine which cell was tapped
  const centerX = inputs.reduce((sum, inp) => sum + inp.x, 0) / inputs.length;
  const centerY = inputs.reduce((sum, inp) => sum + inp.y, 0) / inputs.length;
  const idx = findCell(element, centerX, centerY);

  if (idx === null) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const newState = cycleCell(element.gameState, idx);
  if (newState === element.gameState) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const conflicts = findConflicts(newState);
  const solved = isSolved(newState);

  const updatedElement: TangoElement = {
    ...element,
    gameState: newState,
    conflictCells: conflicts,
    isSolved: solved,
  };

  return { element: updatedElement, consumed: true, strokesConsumed: strokes };
}
