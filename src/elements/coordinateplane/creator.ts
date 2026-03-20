// CoordinatePlane creator - recognizes two arrow strokes and creates coordinate plane

import type { Stroke } from '../../types';
import { createCoordinatePlaneElement } from './types';
import type { CreationContext, CreationResult } from '../registry/ElementPlugin';
import { detectAndMatchArrows, type ArrowMatchResult } from './arrowDetection';
import { debugLog } from '../../debug/DebugLogger';

// Validation constants
const MIN_STROKES = 2;
const MIN_POINTS_PER_STROKE = 10;
const DEFAULT_GRID_COUNT = 5;

/**
 * Check if this creator can potentially create a CoordinatePlane from these strokes.
 */
export function canCreate(strokes: Stroke[]): boolean {
  debugLog.info('[CoordPlane] canCreate called', { strokeCount: strokes.length });

  // Need at least 2 strokes
  if (strokes.length < MIN_STROKES) {
    debugLog.info('[CoordPlane] canCreate: FALSE - need at least 2 strokes', {
      count: strokes.length,
      required: MIN_STROKES,
    });
    return false;
  }

  // Count how many strokes have enough points to be potential arrows
  let potentialArrows = 0;
  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i];
    if (stroke.inputs.inputs.length >= MIN_POINTS_PER_STROKE) {
      potentialArrows++;
    }
  }

  if (potentialArrows < 2) {
    debugLog.info('[CoordPlane] canCreate: FALSE - not enough strokes with sufficient points', {
      potentialArrows,
      required: 2,
    });
    return false;
  }

  debugLog.info('[CoordPlane] canCreate: TRUE - have potential arrows', { potentialArrows });
  return true;
}

/**
 * Create a CoordinatePlane element from strokes.
 */
export async function createFromInk(
  strokes: Stroke[],
  _context: CreationContext
): Promise<CreationResult | null> {
  debugLog.info('[CoordPlane] createFromInk called', { strokeCount: strokes.length });

  // Filter strokes with enough points to be potential arrows
  const candidateStrokes = strokes.filter(s => s.inputs.inputs.length >= MIN_POINTS_PER_STROKE);

  debugLog.info('[CoordPlane] createFromInk: filtering strokes', {
    total: strokes.length,
    candidates: candidateStrokes.length,
  });

  if (candidateStrokes.length < 2) {
    debugLog.warn('[CoordPlane] createFromInk: REJECTED - not enough candidate strokes');
    return null;
  }

  // Try all pairs of candidate strokes to find a valid coordinate plane
  let bestMatch: { matchResult: ArrowMatchResult; strokes: Stroke[] } | null = null;

  for (let i = 0; i < candidateStrokes.length; i++) {
    for (let j = i + 1; j < candidateStrokes.length; j++) {
      const pair = [candidateStrokes[i], candidateStrokes[j]];
      const matchResult = detectAndMatchArrows(pair);

      if (matchResult) {
        // Found a valid match - use the first one found (could improve to find best)
        bestMatch = { matchResult, strokes: pair };
        break;
      }
    }
    if (bestMatch) break;
  }

  if (!bestMatch) {
    debugLog.warn('[CoordPlane] createFromInk: REJECTED - no valid arrow pair found');
    return null;
  }

  const { matchResult, strokes: consumedStrokes } = bestMatch;
  const { horizontalArrow, verticalArrow, origin, confidence, method } = matchResult;

  debugLog.info('CoordinatePlane: arrows matched', {
    method,
    originX: origin.x.toFixed(0),
    originY: origin.y.toFixed(0),
    hLength: horizontalArrow.length.toFixed(0),
    vLength: verticalArrow.length.toFixed(0),
    confidence: confidence.toFixed(2),
  });

  // Calculate axis lengths from origin
  // For horizontal arrow pointing right: head is positive end
  // The tail might be at or near origin, or we calculate from origin
  let xAxisPositive: number;
  let xAxisNegative: number;

  if (method === 'tail_proximity') {
    // Tails meet at origin, so full length extends positive
    xAxisPositive = horizontalArrow.length;
    xAxisNegative = 0;
  } else {
    // Center intersection - calculate distances from origin
    const xDistToHead = horizontalArrow.head.x - origin.x;
    const xDistToTail = origin.x - horizontalArrow.tail.x;
    xAxisPositive = Math.max(0, xDistToHead);
    xAxisNegative = Math.max(0, xDistToTail);
  }

  // For vertical arrow pointing up: head is positive end (up = negative Y in canvas)
  let yAxisPositive: number;
  let yAxisNegative: number;

  if (method === 'tail_proximity') {
    // Tails meet at origin, so full length extends positive (upward)
    yAxisPositive = verticalArrow.length;
    yAxisNegative = 0;
  } else {
    // Center intersection - calculate distances from origin
    // Remember: up is negative Y in canvas coordinates
    const yDistToHead = origin.y - verticalArrow.head.y; // Head is up (lower Y)
    const yDistToTail = verticalArrow.tail.y - origin.y; // Tail is down (higher Y)
    yAxisPositive = Math.max(0, yDistToHead);
    yAxisNegative = Math.max(0, yDistToTail);
  }

  // Calculate grid spacing based on axis lengths
  const maxAxisLength = Math.max(xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative);
  const gridSpacing = maxAxisLength / DEFAULT_GRID_COUNT;

  debugLog.info('CoordinatePlane: creating element', {
    xAxisPositive: xAxisPositive.toFixed(0),
    xAxisNegative: xAxisNegative.toFixed(0),
    yAxisPositive: yAxisPositive.toFixed(0),
    yAxisNegative: yAxisNegative.toFixed(0),
    gridSpacing: gridSpacing.toFixed(1),
  });

  const element = createCoordinatePlaneElement(
    origin,
    xAxisPositive,
    xAxisNegative,
    yAxisPositive,
    yAxisNegative,
    gridSpacing,
    DEFAULT_GRID_COUNT,
    consumedStrokes
  );

  return {
    elements: [element],
    consumedStrokes,
    confidence,
  };
}
