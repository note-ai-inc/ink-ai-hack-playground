// Scribble-based eraser implementation

import type { Offset, Element, Stroke } from '../types';
import type { InkTextElement, InkTextLine, InkTextToken } from '../elements/inktext/types';
import type { CoordinatePlaneElement } from '../elements/coordinateplane/types';
import { computeConcaveHull, getHullBounds, simplifyPoints } from '../geometry/concaveHull';
import {
  calculateElementOverlap,
  calculateInkTextTokenOverlaps,
  calculateCoordinatePlaneContentOverlaps,
  type OverlapCalculationOptions,
  type TokenOverlapResult,
  type CoordinatePlaneContentOverlapResult,
} from './overlapCalculators';

export interface ScribbleEraseOptions extends OverlapCalculationOptions {
  overlapThreshold?: number; // Minimum overlap ratio to delete element (default: 0.5 = 50%)
  maxPointsForHull?: number; // Simplify points if more than this (default: 500)
  hullConcavity?: number; // Concavity parameter for hull computation (default: 2)
}

export interface ScribbleEraseResult {
  success: boolean;
  removedElementIds: string[];
  modifiedElements: Element[];  // Partially erased elements (e.g., InkText with some tokens removed)
  remainingElements: Element[];
}

/**
 * Apply partial erasure to an InkTextElement by removing tokens that exceed the overlap threshold.
 * Returns null if all tokens should be erased (delete the entire element),
 * or returns a new InkTextElement with remaining tokens and re-indexed strokes.
 */
function applyPartialInkTextErase(
  element: InkTextElement,
  tokenOverlaps: TokenOverlapResult[],
  threshold: number
): InkTextElement | null {
  // Identify which tokens to keep (overlap < threshold)
  const tokensToKeep = tokenOverlaps.filter((t) => t.overlap < threshold);

  // If all tokens are erased, return null to signal full deletion
  if (tokensToKeep.length === 0) {
    return null;
  }

  // If all tokens are kept, return the original element unchanged
  if (tokensToKeep.length === tokenOverlaps.length) {
    return element;
  }

  // Collect all stroke indices from remaining tokens
  const keptStrokeIndices = new Set<number>();
  for (const tokenResult of tokensToKeep) {
    for (const idx of tokenResult.token.strokeIndices) {
      keptStrokeIndices.add(idx);
    }
  }

  // Build mapping from old stroke index to new stroke index
  const sortedOldIndices = Array.from(keptStrokeIndices).sort((a, b) => a - b);
  const oldToNewIndex = new Map<number, number>();
  sortedOldIndices.forEach((oldIdx, newIdx) => {
    oldToNewIndex.set(oldIdx, newIdx);
  });

  // Build new sourceStrokes array with only the kept strokes
  const newSourceStrokes: Stroke[] = sortedOldIndices.map(
    (oldIdx) => element.sourceStrokes[oldIdx]
  );

  // Group remaining tokens by line index
  const lineMap = new Map<number, TokenOverlapResult[]>();
  for (const tokenResult of tokensToKeep) {
    const lineTokens = lineMap.get(tokenResult.lineIndex) || [];
    lineTokens.push(tokenResult);
    lineMap.set(tokenResult.lineIndex, lineTokens);
  }

  // Build new lines array, skipping empty lines
  const newLines: InkTextLine[] = [];
  const sortedLineIndices = Array.from(lineMap.keys()).sort((a, b) => a - b);

  for (const lineIndex of sortedLineIndices) {
    const tokenResults = lineMap.get(lineIndex)!;
    // Sort tokens by their original index to maintain order
    tokenResults.sort((a, b) => a.tokenIndex - b.tokenIndex);

    const newTokens: InkTextToken[] = tokenResults.map((tokenResult) => ({
      ...tokenResult.token,
      // Re-index strokeIndices to point to new sourceStrokes array
      strokeIndices: tokenResult.token.strokeIndices
        .filter((idx) => oldToNewIndex.has(idx))
        .map((idx) => oldToNewIndex.get(idx)!),
    }));

    if (newTokens.length > 0) {
      newLines.push({
        tokens: newTokens,
        baseline: element.lines[lineIndex].baseline,
      });
    }
  }

  // If no lines remain (shouldn't happen given tokens check above), return null
  if (newLines.length === 0) {
    return null;
  }

  // Return modified element with remaining tokens and re-indexed strokes
  return {
    ...element,
    lines: newLines,
    sourceStrokes: newSourceStrokes,
  };
}

/**
 * Apply partial erasure to a CoordinatePlaneElement by removing points and ink strokes
 * that exceed the overlap threshold.
 * Returns null if nothing was erased (element unchanged),
 * or returns a new CoordinatePlaneElement with remaining content.
 */
function applyPartialCoordinatePlaneErase(
  element: CoordinatePlaneElement,
  contentOverlaps: CoordinatePlaneContentOverlapResult,
  threshold: number
): CoordinatePlaneElement | null {
  // Identify which points to keep (overlap < threshold)
  const pointsToKeep = contentOverlaps.pointOverlaps.filter((p) => p.overlap < threshold);

  // Identify which ink strokes to keep (overlap < threshold)
  const inkToKeep = contentOverlaps.inkOverlaps.filter((i) => i.overlap < threshold);

  // Check if anything was erased
  const pointsErased = pointsToKeep.length < contentOverlaps.pointOverlaps.length;
  const inkErased = inkToKeep.length < contentOverlaps.inkOverlaps.length;

  if (!pointsErased && !inkErased) {
    // Nothing to erase, return null to indicate no change
    return null;
  }

  // Build new element with remaining content
  const newPoints = pointsToKeep.map((p) => p.point);
  const newInkStrokes = inkToKeep.map((i) => i.ink);

  return {
    ...element,
    points: newPoints,
    inkStrokes: newInkStrokes,
  };
}

/**
 * Perform scribble-based erasure.
 * Computes a concave hull from the scribble points, then removes elements
 * that have significant overlap (>threshold) with the hull.
 * For InkText elements, supports partial erasure at the token level.
 */
export function performScribbleErase(
  elements: Element[],
  scribblePoints: Offset[],
  options: ScribbleEraseOptions = {}
): ScribbleEraseResult {
  const {
    overlapThreshold = 0.5,
    maxPointsForHull = 500,
    hullConcavity = 2,
    ...overlapOptions
  } = options;

  // Simplify points if too many
  const pointsForHull = simplifyPoints(scribblePoints, maxPointsForHull);

  // Compute concave hull
  const hull = computeConcaveHull(pointsForHull, { concavity: hullConcavity });

  if (!hull || hull.length < 3) {
    return {
      success: false,
      removedElementIds: [],
      modifiedElements: [],
      remainingElements: elements,
    };
  }

  // Get hull bounding box for quick filtering
  const hullBounds = getHullBounds(hull);
  if (!hullBounds) {
    return {
      success: false,
      removedElementIds: [],
      modifiedElements: [],
      remainingElements: elements,
    };
  }

  // Calculate overlap for each element and determine which to remove/modify
  const removedElementIds: string[] = [];
  const modifiedElements: Element[] = [];
  const remainingElements: Element[] = [];

  for (const element of elements) {
    // Special handling for InkText elements: token-level erasure
    if (element.type === 'inkText') {
      const tokenOverlapResult = calculateInkTextTokenOverlaps(
        element,
        hull,
        hullBounds,
        overlapOptions
      );

      // Check if any tokens have overlap >= threshold
      const hasErasedTokens = tokenOverlapResult.tokenOverlaps.some(
        (t) => t.overlap >= overlapThreshold
      );

      if (!hasErasedTokens) {
        // No tokens to erase, keep element unchanged
        remainingElements.push(element);
        continue;
      }

      // Apply partial erasure
      const modifiedElement = applyPartialInkTextErase(
        element,
        tokenOverlapResult.tokenOverlaps,
        overlapThreshold
      );

      if (modifiedElement === null) {
        // All tokens erased, delete entire element
        removedElementIds.push(element.id);
      } else if (modifiedElement === element) {
        // No change (shouldn't happen given hasErasedTokens check)
        remainingElements.push(element);
      } else {
        // Partial erasure: element was modified
        modifiedElements.push(modifiedElement);
        remainingElements.push(modifiedElement);
      }
      continue;
    }

    // Special handling for CoordinatePlane elements: full deletion or point/ink-level erasure
    if (element.type === 'coordinatePlane') {
      // First check if the scribble covers at least 2/3 of the element's area
      // If so, delete the entire element
      const COORDINATE_PLANE_DELETE_THRESHOLD = 2 / 3; // ~66.67%
      const elementOverlap = calculateElementOverlap(element, hull, hullBounds, overlapOptions);

      if (elementOverlap >= COORDINATE_PLANE_DELETE_THRESHOLD) {
        // Scribble covers ≥ 2/3 of element area, delete entire element
        removedElementIds.push(element.id);
        continue;
      }

      // Otherwise, try partial erasure of points and ink strokes
      const contentOverlapResult = calculateCoordinatePlaneContentOverlaps(
        element,
        hull,
        hullBounds,
        overlapOptions
      );

      // Check if any points or ink strokes have overlap >= threshold
      const hasErasedPoints = contentOverlapResult.pointOverlaps.some(
        (p) => p.overlap >= overlapThreshold
      );
      const hasErasedInk = contentOverlapResult.inkOverlaps.some(
        (i) => i.overlap >= overlapThreshold
      );

      if (!hasErasedPoints && !hasErasedInk) {
        // Nothing to erase, keep element unchanged
        remainingElements.push(element);
        continue;
      }

      // Apply partial erasure
      const modifiedElement = applyPartialCoordinatePlaneErase(
        element,
        contentOverlapResult,
        overlapThreshold
      );

      if (modifiedElement === null) {
        // No change (shouldn't happen given the checks above)
        remainingElements.push(element);
      } else {
        // Partial erasure: element was modified
        modifiedElements.push(modifiedElement);
        remainingElements.push(modifiedElement);
      }
      continue;
    }

    // Standard overlap calculation for other element types
    const overlap = calculateElementOverlap(element, hull, hullBounds, overlapOptions);

    if (overlap >= overlapThreshold) {
      removedElementIds.push(element.id);
    } else {
      remainingElements.push(element);
    }
  }

  return {
    success: removedElementIds.length > 0 || modifiedElements.length > 0,
    removedElementIds,
    modifiedElements,
    remainingElements,
  };
}
