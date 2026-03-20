// Lasso containment checking utilities
// Determines which elements are selected by a lasso polygon

import type { Offset, BoundingBox, Element, Stroke } from '../types';
import { boundingBoxCenter } from '../types';
import { getElementBounds } from '../elements/rendering/ElementRenderer';
import { pointInPolygon, polygonBoundingBox, boundingBoxInPolygon, boundingBoxIntersectsPolygon } from '../geometry/polygon';
import { computeConcaveHull, simplifyPoints } from '../geometry/concaveHull';
import { createClosedPolygon, isValidLasso } from './lassoDetection';
import { debugLog } from '../debug/DebugLogger';

// Minimum overlap coverage to consider an element selected
const MIN_COVERAGE_THRESHOLD = 0.3;

/**
 * Result of finding elements in a lasso selection.
 */
export interface LassoSelectionResult {
  /** Elements selected by the lasso */
  selectedElements: Element[];

  /** The polygon used for selection (may be processed/closed) */
  selectionPolygon: Offset[];

  /** Bounding box of the selection polygon */
  selectionBounds: BoundingBox;

  /** Whether this is a valid lasso selection */
  isValid: boolean;
}

/**
 * Find elements that are selected by a lasso path.
 * Uses multiple fallback strategies similar to Android implementation.
 */
export function findElementsInLasso(
  lassoPoints: Offset[],
  elements: Element[],
  lassoStroke?: Stroke
): LassoSelectionResult {
  debugLog.info('Lasso containment check starting', {
    pointCount: lassoPoints.length,
    elementCount: elements.length
  });

  const invalidResult: LassoSelectionResult = {
    selectedElements: [],
    selectionPolygon: [],
    selectionBounds: { left: 0, top: 0, right: 0, bottom: 0 },
    isValid: false,
  };

  // Validate lasso quality
  if (!isValidLasso(lassoPoints)) {
    debugLog.info('Lasso containment: invalid lasso, aborting');
    return invalidResult;
  }

  // Create closed polygon from lasso points
  const closedPolygon = createClosedPolygon(lassoPoints);
  if (closedPolygon.length < 3) {
    debugLog.info('Lasso containment: closed polygon too small', { polygonLength: closedPolygon.length });
    return invalidResult;
  }

  const selectionBounds = polygonBoundingBox(closedPolygon);
  if (!selectionBounds) {
    debugLog.info('Lasso containment: no selection bounds');
    return invalidResult;
  }

  debugLog.info('Lasso polygon created', {
    polygonPoints: closedPolygon.length,
    bounds: {
      w: Math.round(selectionBounds.right - selectionBounds.left),
      h: Math.round(selectionBounds.bottom - selectionBounds.top)
    }
  });

  // Filter out the lasso stroke itself from elements
  const filteredElements = filterLassoStroke(elements, lassoStroke, lassoPoints);
  debugLog.info('Lasso: elements after filtering lasso stroke', {
    original: elements.length,
    filtered: filteredElements.length
  });

  // Try different selection strategies in order of preference
  let selectedElements = tryClosedPolygonSelection(filteredElements, closedPolygon);
  debugLog.info('Lasso strategy 1 (closed polygon)', { selected: selectedElements.length });

  // If no results, try hull-based selection
  if (selectedElements.length === 0) {
    selectedElements = tryHullBasedSelection(filteredElements, lassoPoints);
    debugLog.info('Lasso strategy 2 (hull-based)', { selected: selectedElements.length });
  }

  // If still no results, try bounding box selection
  if (selectedElements.length === 0) {
    selectedElements = tryBoundingBoxSelection(filteredElements, selectionBounds);
    debugLog.info('Lasso strategy 3 (bounding box)', { selected: selectedElements.length });
  }

  debugLog.info('Lasso containment result', {
    isValid: selectedElements.length > 0,
    selectedCount: selectedElements.length,
    selectedTypes: selectedElements.map(e => e.type)
  });

  return {
    selectedElements,
    selectionPolygon: closedPolygon,
    selectionBounds,
    isValid: selectedElements.length > 0,
  };
}

/**
 * Filter out the lasso stroke from elements list.
 */
function filterLassoStroke(
  elements: Element[],
  lassoStroke: Stroke | undefined,
  lassoPoints: Offset[]
): Element[] {
  if (!lassoStroke) return elements;

  return elements.filter(element => {
    if (element.type !== 'stroke') return true;

    // Check if this element contains the lasso stroke
    for (const stroke of element.strokes) {
      if (stroke === lassoStroke) return false;

      // Also check if stroke points match the lasso points (within tolerance)
      if (stroke.inputs.inputs.length === lassoPoints.length) {
        let matches = true;
        for (let i = 0; i < Math.min(5, stroke.inputs.inputs.length); i++) {
          const dx = stroke.inputs.inputs[i].x - lassoPoints[i].x;
          const dy = stroke.inputs.inputs[i].y - lassoPoints[i].y;
          if (Math.sqrt(dx * dx + dy * dy) > 10) {
            matches = false;
            break;
          }
        }
        if (matches) return false;
      }
    }
    return true;
  });
}

/**
 * Try selection using closed polygon containment.
 * An element is selected if 2+ of its 5 test points are inside the polygon.
 */
function tryClosedPolygonSelection(
  elements: Element[],
  polygon: Offset[]
): Element[] {
  const selected: Element[] = [];

  for (const element of elements) {
    const bounds = getElementBounds(element);
    if (!bounds) continue;

    // Test 5 points: center + 4 corners
    const testPoints: Offset[] = [
      boundingBoxCenter(bounds),
      { x: bounds.left, y: bounds.top },
      { x: bounds.right, y: bounds.top },
      { x: bounds.right, y: bounds.bottom },
      { x: bounds.left, y: bounds.bottom },
    ];

    // Count how many test points are inside the polygon
    let insideCount = 0;
    for (const point of testPoints) {
      if (pointInPolygon(point, polygon)) {
        insideCount++;
      }
    }

    // Element is selected if 2+ points are inside (similar to 50% coverage)
    if (insideCount >= 2) {
      selected.push(element);
    }
  }

  return selected;
}

/**
 * Try selection using expanded hull approach.
 */
function tryHullBasedSelection(
  elements: Element[],
  lassoPoints: Offset[]
): Element[] {
  // Simplify points and compute hull
  const simplified = simplifyPoints(lassoPoints, 500);
  const hull = computeConcaveHull(simplified, { concavity: 2 });

  if (!hull || hull.length < 3) {
    return [];
  }

  const selected: Element[] = [];

  for (const element of elements) {
    const bounds = getElementBounds(element);
    if (!bounds) continue;

    // Check if element bounds intersect with hull
    if (boundingBoxIntersectsPolygon(bounds, hull)) {
      // Calculate approximate overlap
      const overlap = calculateOverlapRatio(bounds, hull);
      if (overlap >= MIN_COVERAGE_THRESHOLD) {
        selected.push(element);
      }
    }
  }

  return selected;
}

/**
 * Try selection using simple bounding box overlap.
 */
function tryBoundingBoxSelection(
  elements: Element[],
  lassoBounds: BoundingBox
): Element[] {
  const selected: Element[] = [];

  for (const element of elements) {
    const bounds = getElementBounds(element);
    if (!bounds) continue;

    // Check if element is fully contained in lasso bounds
    if (boundingBoxInPolygon(bounds, [
      { x: lassoBounds.left, y: lassoBounds.top },
      { x: lassoBounds.right, y: lassoBounds.top },
      { x: lassoBounds.right, y: lassoBounds.bottom },
      { x: lassoBounds.left, y: lassoBounds.bottom },
    ])) {
      selected.push(element);
    }
  }

  return selected;
}

/**
 * Calculate approximate overlap ratio between bounds and polygon.
 */
function calculateOverlapRatio(bounds: BoundingBox, polygon: Offset[]): number {
  // Sample grid of points within bounds
  const gridSize = 3;
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;

  if (width === 0 || height === 0) {
    // Zero-size element - check if center is inside
    const center = boundingBoxCenter(bounds);
    return pointInPolygon(center, polygon) ? 1 : 0;
  }

  let insideCount = 0;
  let totalCount = 0;

  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const point: Offset = {
        x: bounds.left + (width * i) / gridSize,
        y: bounds.top + (height * j) / gridSize,
      };
      totalCount++;
      if (pointInPolygon(point, polygon)) {
        insideCount++;
      }
    }
  }

  return totalCount > 0 ? insideCount / totalCount : 0;
}

/**
 * Get points from a stroke for lasso detection.
 */
export function getStrokePoints(stroke: Stroke): Offset[] {
  return stroke.inputs.inputs.map(input => ({ x: input.x, y: input.y }));
}

/**
 * Get combined points from multiple strokes.
 */
export function getMultiStrokeLassoPoints(strokes: Stroke[]): Offset[] {
  const points: Offset[] = [];
  for (const stroke of strokes) {
    points.push(...getStrokePoints(stroke));
  }
  return points;
}
