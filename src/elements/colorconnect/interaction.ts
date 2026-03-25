// Color Connect interaction - handle stroke drawing between dots
//
// Player draws a stroke from one dot to its matching-color partner.
// Also handles: reset button tap, and advancing to next level after solve.

import type { Stroke, BoundingBox } from '../../types';
import type { ColorConnectElement } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import {
  findNearestDot, addConnection, getCircleLayout, simplifyPath,
  getDotPosition, isInResetButton, requestNextLevel, pathExitsCircle,
} from './gameState';
import { MAX_LEVEL } from './types';
import { generateForLevel } from './puzzleGenerator';

function getElementCanvasBounds(element: ColorConnectElement): BoundingBox {
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
  element: ColorConnectElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox,
): boolean {
  if (element.gameState.isGenerating) return false;
  return boundingBoxesOverlap(getElementCanvasBounds(element), strokeBounds);
}

export async function acceptInk(
  element: ColorConnectElement,
  strokes: Stroke[],
  _recognitionResult?: HandwritingRecognitionResult,
): Promise<InteractionResult> {
  if (element.gameState.isGenerating) {
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
  const startLocal = { x: inputs[0].x - tx, y: inputs[0].y - ty };

  // Check reset button tap (works with single-point taps too)
  if (isInResetButton(startLocal.x, startLocal.y, element.width)) {
    const newState = generateForLevel(1);
    const updatedElement: ColorConnectElement = {
      ...element,
      gameState: newState,
    };
    return { element: updatedElement, consumed: true, strokesConsumed: strokes };
  }

  // Need at least 2 points for connections
  if (inputs.length < 2) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // If game complete, reset on any stroke
  if (element.gameState.gameComplete) {
    const newState = generateForLevel(1);
    const updatedElement: ColorConnectElement = { ...element, gameState: newState };
    return { element: updatedElement, consumed: true, strokesConsumed: strokes };
  }

  // If solved, any stroke triggers next level
  if (element.gameState.solved) {
    if (element.gameState.level >= MAX_LEVEL) {
      // Beat the final level!
      const updatedElement: ColorConnectElement = {
        ...element,
        gameState: { ...element.gameState, gameComplete: true },
      };
      return { element: updatedElement, consumed: true, strokesConsumed: strokes };
    }
    const newState = requestNextLevel(element.gameState);
    const updatedElement: ColorConnectElement = { ...element, gameState: newState };
    return { element: updatedElement, consumed: true, strokesConsumed: strokes };
  }

  const { centerX, centerY, radius } = getCircleLayout(element.width, element.height);
  const hitDistance = Math.max(30, radius * 0.18);

  const endLocal = { x: inputs[inputs.length - 1].x - tx, y: inputs[inputs.length - 1].y - ty };

  const startDotIdx = findNearestDot(
    element.gameState, startLocal.x, startLocal.y,
    centerX, centerY, radius, hitDistance,
  );
  const endDotIdx = findNearestDot(
    element.gameState, endLocal.x, endLocal.y,
    centerX, centerY, radius, hitDistance,
  );

  if (startDotIdx === null || endDotIdx === null || startDotIdx === endDotIdx) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const startDot = element.gameState.dots[startDotIdx];
  const endDot = element.gameState.dots[endDotIdx];

  // Must be same color, different slot (matching pair)
  if (startDot.colorIndex !== endDot.colorIndex || startDot.pairSlot === endDot.pairSlot) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // Convert stroke to local path, snap endpoints to exact dot positions
  const startPos = getDotPosition(startDot, centerX, centerY, radius);
  const endPos = getDotPosition(endDot, centerX, centerY, radius);

  const rawPoints = inputs.map(input => ({
    x: input.x - tx,
    y: input.y - ty,
  }));

  rawPoints[0] = startPos;
  rawPoints[rawPoints.length - 1] = endPos;

  const simplifiedPoints = simplifyPath(rawPoints, 40);

  const isOutOfBounds = pathExitsCircle(simplifiedPoints, centerX, centerY, radius);
  const newState = addConnection(element.gameState, startDot.colorIndex, simplifiedPoints, centerX, centerY, radius, isOutOfBounds);

  const updatedElement: ColorConnectElement = {
    ...element,
    gameState: newState,
  };

  return { element: updatedElement, consumed: true, strokesConsumed: strokes };
}
