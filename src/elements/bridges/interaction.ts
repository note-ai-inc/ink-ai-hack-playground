// Bridges interaction - handle bridge placement via stroke gestures
//
// The player draws a roughly straight line from one island to another
// to toggle bridges: 0 → 1 → 2 → 0.

import type { Stroke, BoundingBox } from '../../types';
import type { BridgesElement } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import { debugLog } from '../../debug/DebugLogger';
import { areAdjacent, isComplete, toggleBridge } from './gameState';

const MIN_STRAIGHTNESS = 0.4;

function getBridgesCanvasBounds(element: BridgesElement): BoundingBox {
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

function computeStraightness(stroke: Stroke): number {
  const inputs = stroke.inputs.inputs;
  if (inputs.length < 2) return 0;

  const start = inputs[0];
  const end = inputs[inputs.length - 1];
  const directDistance = Math.sqrt(
    (end.x - start.x) ** 2 + (end.y - start.y) ** 2,
  );

  let pathLength = 0;
  for (let i = 1; i < inputs.length; i++) {
    const dx = inputs[i].x - inputs[i - 1].x;
    const dy = inputs[i].y - inputs[i - 1].y;
    pathLength += Math.sqrt(dx * dx + dy * dy);
  }

  if (pathLength === 0) return 0;
  return directDistance / pathLength;
}

function findNearestIsland(
  element: BridgesElement,
  localX: number,
  localY: number,
): number | null {
  const { islands, gridCols, gridRows } = element.gameState;
  const cellWidth = element.width / gridCols;
  const cellHeight = element.height / gridRows;
  const maxDistance = Math.min(cellWidth, cellHeight) * 0.5;

  let nearestIdx: number | null = null;
  let nearestDist = maxDistance;

  for (let i = 0; i < islands.length; i++) {
    const island = islands[i];
    const ix = (island.col + 0.5) * cellWidth;
    const iy = (island.row + 0.5) * cellHeight;

    const dist = Math.sqrt((localX - ix) ** 2 + (localY - iy) ** 2);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  }

  return nearestIdx;
}

export function isInterestedIn(
  element: BridgesElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox,
): boolean {
  if (isComplete(element.gameState)) return false;

  const elementBounds = getBridgesCanvasBounds(element);
  return boundingBoxesOverlap(elementBounds, strokeBounds);
}

export async function acceptInk(
  element: BridgesElement,
  strokes: Stroke[],
  _recognitionResult?: HandwritingRecognitionResult,
): Promise<InteractionResult> {
  if (isComplete(element.gameState)) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  if (strokes.length !== 1) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const stroke = strokes[0];
  const inputs = stroke.inputs.inputs;
  if (inputs.length < 2) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  if (computeStraightness(stroke) < MIN_STRAIGHTNESS) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const start = inputs[0];
  const end = inputs[inputs.length - 1];

  const startIsland = findNearestIsland(element, start.x - tx, start.y - ty);
  const endIsland = findNearestIsland(element, end.x - tx, end.y - ty);

  if (startIsland === null || endIsland === null || startIsland === endIsland) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  if (!areAdjacent(element.gameState.islands, startIsland, endIsland)) {
    debugLog.info('Bridges: islands not adjacent', { startIsland, endIsland });
    return { element, consumed: false, strokesConsumed: [] };
  }

  const newState = toggleBridge(element.gameState, startIsland, endIsland);
  if (newState === element.gameState) {
    debugLog.info('Bridges: bridge toggle blocked (would cross)');
    return { element, consumed: false, strokesConsumed: [] };
  }

  if (isComplete(newState)) {
    debugLog.info('Bridges: puzzle complete!');
  }

  const updatedElement: BridgesElement = {
    ...element,
    gameState: newState,
  };

  return { element: updatedElement, consumed: true, strokesConsumed: strokes };
}
