// InkText interaction - append new strokes to existing handwritten text

import type { Stroke, BoundingBox, Offset } from '../../types';
import type { InkTextElement, InkTextLine, InkTextToken } from './types';
import { boundingBoxFromOffsets } from '../../types/primitives';
import type { Quad } from '../../types/primitives';
import type { InteractionResult } from '../registry/ElementPlugin';
import { getStrokesBoundingBox } from '../registry/ElementRegistry';
import type { HandwritingRecognitionResult, RecognizedToken } from '../../recognition/RecognitionService';
import { getRecognitionService } from '../../recognition/RecognitionService';

// How close strokes need to be to be considered part of the same text
const PROXIMITY_THRESHOLD = 100; // pixels
// Vertical tolerance for same-line detection
const LINE_VERTICAL_TOLERANCE = 50; // pixels

/**
 * Get the bounding box of an InkTextElement.
 */
function getInkTextBounds(element: InkTextElement): BoundingBox | null {
  const allPoints: Offset[] = [];

  for (const line of element.lines) {
    for (const token of line.tokens) {
      allPoints.push(
        token.quad.topLeft,
        token.quad.topRight,
        token.quad.bottomRight,
        token.quad.bottomLeft
      );
    }
  }

  // Also include source strokes bounds
  for (const stroke of element.sourceStrokes) {
    for (const input of stroke.inputs.inputs) {
      allPoints.push({ x: input.x, y: input.y });
    }
  }

  return boundingBoxFromOffsets(allPoints);
}

/**
 * Get expanded bounds for detecting nearby strokes.
 */
function getExpandedBounds(bounds: BoundingBox): BoundingBox {
  return {
    left: bounds.left - PROXIMITY_THRESHOLD,
    top: bounds.top - PROXIMITY_THRESHOLD,
    right: bounds.right + PROXIMITY_THRESHOLD,
    bottom: bounds.bottom + PROXIMITY_THRESHOLD,
  };
}

/**
 * Check if two bounding boxes overlap.
 */
function boundingBoxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/**
 * Check if new strokes appear to be a continuation of existing text.
 * Strokes should be to the right of or below existing text.
 */
function isLikelyContinuation(
  elementBounds: BoundingBox,
  strokeBounds: BoundingBox
): boolean {
  // Check if strokes are to the right (same line)
  const isToRight =
    strokeBounds.left > elementBounds.left - PROXIMITY_THRESHOLD &&
    Math.abs(strokeBounds.top - elementBounds.top) < LINE_VERTICAL_TOLERANCE * 2;

  // Check if strokes are below (new line)
  const isBelow =
    strokeBounds.top > elementBounds.top &&
    strokeBounds.left < elementBounds.right + PROXIMITY_THRESHOLD;

  // Check if strokes are within reasonable proximity
  const isNearby =
    strokeBounds.left < elementBounds.right + PROXIMITY_THRESHOLD &&
    strokeBounds.right > elementBounds.left - PROXIMITY_THRESHOLD;

  return (isToRight || isBelow) && isNearby;
}

/**
 * Create a Quad from a bounding box.
 */
function quadFromBounds(bounds: BoundingBox): Quad {
  return {
    topLeft: { x: bounds.left, y: bounds.top },
    topRight: { x: bounds.right, y: bounds.top },
    bottomRight: { x: bounds.right, y: bounds.bottom },
    bottomLeft: { x: bounds.left, y: bounds.bottom },
  };
}

/**
 * Get bounding box for specific strokes by indices.
 */
function getBoundsForStrokeIndices(strokes: Stroke[], indices: number[]): BoundingBox | null {
  if (indices.length === 0) {
    return getStrokesBoundingBox(strokes);
  }

  const selectedStrokes = indices
    .filter(i => i >= 0 && i < strokes.length)
    .map(i => strokes[i]);

  if (selectedStrokes.length === 0) {
    return getStrokesBoundingBox(strokes);
  }

  return getStrokesBoundingBox(selectedStrokes);
}

/**
 * Find which line new strokes should be appended to based on vertical position.
 */
function findTargetLineIndex(
  lines: InkTextLine[],
  strokeBounds: BoundingBox
): number {
  const strokeCenterY = (strokeBounds.top + strokeBounds.bottom) / 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if stroke center is near this line's baseline
    if (Math.abs(strokeCenterY - line.baseline) < LINE_VERTICAL_TOLERANCE) {
      return i;
    }
  }

  // If no matching line, check if it's a new line below existing content
  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    if (strokeCenterY > lastLine.baseline) {
      return lines.length; // Indicates new line needed
    }
  }

  return lines.length; // New line
}

/**
 * Convert recognition tokens to InkTextTokens with adjusted indices.
 */
function convertNewTokens(
  tokens: RecognizedToken[],
  newStrokes: Stroke[],
  baseStrokeIndex: number,
  baseline: number
): InkTextToken[] {
  return tokens.map(token => {
    // Adjust stroke indices to account for existing strokes
    const adjustedIndices = token.strokeIndices.map(i => i + baseStrokeIndex);

    // Get bounds from stroke indices or use provided bounding box
    let bounds: BoundingBox | null = null;

    if (token.boundingBox) {
      bounds = {
        left: token.boundingBox.left,
        top: token.boundingBox.top,
        right: token.boundingBox.right,
        bottom: token.boundingBox.bottom,
      };
    } else {
      bounds = getBoundsForStrokeIndices(newStrokes, token.strokeIndices);
    }

    // Fallback bounds
    if (!bounds) {
      bounds = { left: 0, top: 0, right: 50, bottom: 30 };
    }

    return {
      text: token.text,
      quad: quadFromBounds(bounds),
      strokeIndices: adjustedIndices,
      baseline,
      confidence: token.candidates[0]?.score,
    };
  });
}

/**
 * Merge new recognition result into existing InkTextElement.
 */
function mergeRecognitionResult(
  element: InkTextElement,
  newStrokes: Stroke[],
  result: HandwritingRecognitionResult
): InkTextElement {
  const baseStrokeIndex = element.sourceStrokes.length;
  const strokeBounds = getStrokesBoundingBox(newStrokes);

  if (!strokeBounds) {
    // No valid strokes, return element unchanged
    return element;
  }

  // Find target line for new content
  const targetLineIndex = findTargetLineIndex(element.lines, strokeBounds);
  const estimatedBaseline = strokeBounds.bottom - (strokeBounds.bottom - strokeBounds.top) * 0.2;

  // Process new recognition lines
  const newLines = [...element.lines];

  if (result.lines.length === 0 && result.rawText) {
    // Single token from raw text
    const newToken: InkTextToken = {
      text: result.rawText,
      quad: quadFromBounds(strokeBounds),
      strokeIndices: newStrokes.map((_, i) => i + baseStrokeIndex),
      baseline: estimatedBaseline,
    };

    if (targetLineIndex < newLines.length) {
      // Append to existing line
      newLines[targetLineIndex] = {
        ...newLines[targetLineIndex],
        tokens: [...newLines[targetLineIndex].tokens, newToken],
      };
    } else {
      // Create new line
      newLines.push({
        tokens: [newToken],
        baseline: estimatedBaseline,
      });
    }
  } else {
    // Process each recognition line
    for (let i = 0; i < result.lines.length; i++) {
      const recogLine = result.lines[i];
      const lineBaseline = i === 0 ? estimatedBaseline : estimatedBaseline + (i * LINE_VERTICAL_TOLERANCE);

      const newTokens = convertNewTokens(
        recogLine.tokens,
        newStrokes,
        baseStrokeIndex,
        lineBaseline
      );

      const actualTargetIndex = targetLineIndex + i;

      if (i === 0 && actualTargetIndex < newLines.length) {
        // Append to existing line
        newLines[actualTargetIndex] = {
          ...newLines[actualTargetIndex],
          tokens: [...newLines[actualTargetIndex].tokens, ...newTokens],
        };
      } else {
        // Create new line
        newLines.push({
          tokens: newTokens,
          baseline: lineBaseline,
        });
      }
    }
  }

  return {
    ...element,
    lines: newLines,
    sourceStrokes: [...element.sourceStrokes, ...newStrokes],
  };
}

/**
 * Check if this element is interested in the given strokes.
 */
export function isInterestedIn(
  element: InkTextElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox
): boolean {
  const elementBounds = getInkTextBounds(element);
  if (!elementBounds) {
    return false;
  }

  // Check if strokes are within expanded bounds
  const expandedBounds = getExpandedBounds(elementBounds);
  if (!boundingBoxesOverlap(expandedBounds, strokeBounds)) {
    return false;
  }

  // Check if this looks like a continuation of the text
  return isLikelyContinuation(elementBounds, strokeBounds);
}

/**
 * Accept ink input and update the element.
 */
export async function acceptInk(
  element: InkTextElement,
  strokes: Stroke[],
  recognitionResult?: HandwritingRecognitionResult
): Promise<InteractionResult> {
  // Validate strokes
  if (strokes.length === 0) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // Get or fetch recognition result
  let result = recognitionResult;
  if (!result) {
    try {
      const service = getRecognitionService();
      result = await service.recognizeGoogle(strokes);
    } catch (error) {
      console.warn('InkText recognition failed:', error);
      // Still merge strokes even without recognition
      result = { lines: [], rawText: '' };
    }
  }

  // Don't accept "#" symbols (likely TicTacToe)
  if (result.rawText.trim() === '#' || result.rawText.trim() === '＃') {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // Merge the new strokes and recognition into the element
  const newElement = mergeRecognitionResult(element, strokes, result);

  return {
    element: newElement,
    consumed: true,
    strokesConsumed: strokes,
  };
}
