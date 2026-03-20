// Sudoku interaction - handle digit placement via handwriting recognition

import type { Stroke, BoundingBox } from '../../types';
import type { SudokuElement } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import { getRecognitionService } from '../../recognition/RecognitionService';
import { getStrokesBoundingBox } from '../registry/ElementRegistry';
import { debugLog } from '../../debug/DebugLogger';
import {
  GRID_SIZE,
  isComplete,
  placeDigit,
  computeErrorCells,
} from './gameState';

function getSudokuCanvasBounds(element: SudokuElement): BoundingBox {
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

function findCellIndex(
  element: SudokuElement,
  canvasX: number,
  canvasY: number,
): number | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const localX = canvasX - tx;
  const localY = canvasY - ty;

  if (localX < 0 || localX >= element.width || localY < 0 || localY >= element.height) {
    return null;
  }

  const cellWidth = element.width / GRID_SIZE;
  const cellHeight = element.height / GRID_SIZE;
  const col = Math.min(Math.floor(localX / cellWidth), GRID_SIZE - 1);
  const row = Math.min(Math.floor(localY / cellHeight), GRID_SIZE - 1);

  return row * GRID_SIZE + col;
}

function extractDigit(result: HandwritingRecognitionResult): number | null {
  const text = result.rawText.trim();
  const digit = parseInt(text, 10);
  if (digit >= 1 && digit <= 9 && text.length === 1) {
    return digit;
  }

  for (const char of text) {
    const d = parseInt(char, 10);
    if (d >= 1 && d <= 9) return d;
  }

  return null;
}

function isMultiDigit(result: HandwritingRecognitionResult): boolean {
  const text = result.rawText.trim();
  const digitCount = [...text].filter(c => c >= '1' && c <= '9').length;
  return digitCount >= 2;
}

export function isInterestedIn(
  element: SudokuElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox,
): boolean {
  if (isComplete(element.gameState)) return false;

  const elementBounds = getSudokuCanvasBounds(element);
  return boundingBoxesOverlap(elementBounds, strokeBounds);
}

export async function acceptInk(
  element: SudokuElement,
  strokes: Stroke[],
  recognitionResult?: HandwritingRecognitionResult,
): Promise<InteractionResult> {
  if (isComplete(element.gameState)) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const strokeBounds = getStrokesBoundingBox(strokes);
  if (!strokeBounds) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const centerX = (strokeBounds.left + strokeBounds.right) / 2;
  const centerY = (strokeBounds.top + strokeBounds.bottom) / 2;
  const cellIndex = findCellIndex(element, centerX, centerY);

  if (cellIndex === null) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  if (element.gameState.originalGrid[cellIndex] !== 0) {
    debugLog.info('Sudoku: cell is an original clue', { cellIndex });
    return { element, consumed: false, strokesConsumed: [] };
  }

  let result = recognitionResult;
  if (!result) {
    try {
      const service = getRecognitionService();
      result = await service.recognizeGoogle(strokes);
    } catch {
      debugLog.warn('Sudoku: recognition failed');
      return { element, consumed: false, strokesConsumed: [] };
    }
  }

  const isPlaceholder = isMultiDigit(result);
  if (isPlaceholder) {
    debugLog.info('Sudoku: multi-digit placeholder detected', { cellIndex, text: result.rawText });

    const updatedStrokes = { ...element.playerDigitStrokes, [cellIndex]: strokes };
    const updatedPlaceholders = [...new Set([...element.placeholderCells, cellIndex])];
    const updatedElement: SudokuElement = {
      ...element,
      playerDigitStrokes: updatedStrokes,
      placeholderCells: updatedPlaceholders,
      conflictCells: [...computeErrorCells(element.gameState, updatedStrokes)]
        .filter(c => !updatedPlaceholders.includes(c)),
    };

    return { element: updatedElement, consumed: true, strokesConsumed: strokes };
  }

  const digit = extractDigit(result);

  if (digit === null) {
    debugLog.info('Sudoku: no valid digit recognized', { text: result.rawText, cellIndex });

    const updatedStrokes = { ...element.playerDigitStrokes, [cellIndex]: strokes };
    const updatedElement: SudokuElement = {
      ...element,
      playerDigitStrokes: updatedStrokes,
      conflictCells: [...computeErrorCells(element.gameState, updatedStrokes)]
        .filter(c => !element.placeholderCells.includes(c)),
    };

    return { element: updatedElement, consumed: true, strokesConsumed: strokes };
  }

  debugLog.info('Sudoku: recognized digit', { digit, cellIndex });

  const moveResult = placeDigit(element.gameState, cellIndex, digit);
  if (moveResult.type === 'cellOccupied' || moveResult.type === 'gameAlreadyOver') {
    return { element, consumed: false, strokesConsumed: [] };
  }

  const updatedStrokes = { ...element.playerDigitStrokes, [cellIndex]: strokes };
  const updatedPlaceholders = element.placeholderCells.filter(c => c !== cellIndex);

  const updatedElement: SudokuElement = {
    ...element,
    gameState: moveResult.state,
    playerDigitStrokes: updatedStrokes,
    placeholderCells: updatedPlaceholders,
    conflictCells: [...computeErrorCells(moveResult.state, updatedStrokes)]
      .filter(c => !updatedPlaceholders.includes(c)),
  };

  return { element: updatedElement, consumed: true, strokesConsumed: strokes };
}
