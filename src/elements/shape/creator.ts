// Shape creator - recognizes hand-drawn shapes and converts to vector shapes

import type { Stroke } from '../../types';
import type { ShapeElement } from './types';
import { generateId } from '../../types/primitives';
import { IDENTITY_MATRIX } from '../../types/primitives';
import { getStrokeBoundingBox } from '../../types/brush';
import type { CreationContext, CreationResult } from '../registry/ElementPlugin';
import { debugLog } from '../../debug/DebugLogger';
import {
  extractFeatures,
  classifyShapeWithAlternatives,
  beautifyShape,
} from '../../geometry/shapeRecognition';
import { DISAMBIGUATION_THRESHOLD, getShapeLabel } from '../../disambiguation/DisambiguationIntent';

// Validation constants
const MIN_SIZE = 30; // Minimum dimension in pixels
const MAX_SIZE = 1500; // Maximum dimension in pixels
const MIN_STROKES = 1;
const MAX_STROKES = 4;
const MIN_CONFIDENCE = 0.70;

/**
 * Validate the overall bounds of the strokes for shape recognition.
 */
function validateBounds(strokes: Stroke[]): { valid: boolean; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    const bounds = getStrokeBoundingBox(stroke);
    if (bounds) {
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;

  const valid =
    width >= MIN_SIZE &&
    width <= MAX_SIZE &&
    height >= MIN_SIZE &&
    height <= MAX_SIZE;

  return { valid, width, height };
}

/**
 * Get stroke color and width from the first stroke.
 */
function getStrokeStyle(strokes: Stroke[]): { color: number; width: number } {
  if (strokes.length === 0) {
    return { color: 0xff000000, width: 2 }; // Default black, 2px
  }

  const brush = strokes[0].brush;
  return {
    color: brush.color,
    width: brush.size,
  };
}

/**
 * Check if this creator can potentially create a Shape from these strokes.
 */
export function canCreate(strokes: Stroke[]): boolean {
  debugLog.info('Shape canCreate called', { strokeCount: strokes.length });

  // Quick check: must have 1-3 strokes
  if (strokes.length < MIN_STROKES || strokes.length > MAX_STROKES) {
    debugLog.info('Shape canCreate: wrong stroke count', { count: strokes.length, min: MIN_STROKES, max: MAX_STROKES });
    return false;
  }

  // Check bounds
  const { valid, width, height } = validateBounds(strokes);
  debugLog.info('Shape canCreate: bounds check', {
    valid,
    width: Math.round(width),
    height: Math.round(height),
    minSize: MIN_SIZE,
    maxSize: MAX_SIZE,
  });

  if (!valid) {
    return false;
  }

  debugLog.info('Shape canCreate: returning true');
  return true;
}

/**
 * Create a Shape element from strokes.
 */
export async function createFromInk(
  strokes: Stroke[],
  _context: CreationContext
): Promise<CreationResult | null> {
  debugLog.info('=== Shape createFromInk START ===', { strokeCount: strokes.length });

  // Validate stroke count
  if (strokes.length < MIN_STROKES || strokes.length > MAX_STROKES) {
    debugLog.warn('Shape: wrong stroke count', { count: strokes.length });
    return null;
  }

  // Validate bounds
  const { valid, width, height } = validateBounds(strokes);
  if (!valid) {
    debugLog.warn('Shape: invalid bounds', {
      width: Math.round(width),
      height: Math.round(height),
    });
    return null;
  }

  // Extract features
  debugLog.info('Shape: extracting features...');
  const features = extractFeatures(strokes);
  if (!features) {
    debugLog.warn('Shape: could not extract features');
    return null;
  }

  debugLog.info('Shape: features extracted', {
    pointCount: features.points.length,
    pathLength: Math.round(features.pathLength),
    corners: features.corners.length,
    cornerAngles: features.corners.map(c => (c.angle * 180 / Math.PI).toFixed(1) + '°'),
    compactness: features.compactness.toFixed(3),
    radiusVariance: features.radiusVariance.toFixed(3),
    averageRadius: features.averageRadius.toFixed(1),
    isClosed: features.isClosed,
    closureGap: features.closureGap.toFixed(1),
    closureGapRatio: features.closureGapRatio.toFixed(3),
  });

  // Classify shape with alternatives for disambiguation
  debugLog.info('Shape: classifying with alternatives...');
  const allClassifications = classifyShapeWithAlternatives(features);

  if (allClassifications.length === 0) {
    debugLog.info('Shape: could not classify - no matching shape type');
    return null;
  }

  // Use the best classification
  const classification = allClassifications[0];

  debugLog.info('Shape: classification result', {
    shape: classification.shape,
    confidence: classification.confidence.toFixed(3),
    corners: classification.corners.length,
    alternativeCount: allClassifications.length - 1,
  });

  if (classification.confidence < MIN_CONFIDENCE) {
    debugLog.info('Shape: confidence too low', {
      shape: classification.shape,
      confidence: classification.confidence.toFixed(3),
      threshold: MIN_CONFIDENCE,
    });
    return null;
  }

  debugLog.info('Shape: ACCEPTED', {
    shape: classification.shape,
    confidence: classification.confidence.toFixed(3),
  });

  // Build alternative candidates for disambiguation
  // Include candidates that are within the threshold of the best
  const alternativeCandidates = allClassifications
    .filter(c => c.confidence >= MIN_CONFIDENCE &&
                 classification.confidence - c.confidence < DISAMBIGUATION_THRESHOLD)
    .map(c => ({
      label: getShapeLabel(c.shape),
      elementType: 'shape',
      shapeType: c.shape,
      confidence: c.confidence,
    }));

  debugLog.info('=== SHAPE CREATOR: DISAMBIGUATION DECISION ===', {
    totalClassifications: allClassifications.length,
    minConfidence: MIN_CONFIDENCE,
    disambiguationThreshold: DISAMBIGUATION_THRESHOLD,
    alternativeCandidatesCount: alternativeCandidates.length,
    alternativeCandidates: alternativeCandidates.map(c => `${c.label}(${c.confidence.toFixed(3)})`),
    willAttachAlternatives: alternativeCandidates.length > 1,
  });

  // Get stroke style from original strokes
  const { color, width: strokeWidth } = getStrokeStyle(strokes);

  // Beautify shape
  const shapePath = beautifyShape(classification.shape, features, color, strokeWidth);

  // Create ShapeElement
  const element: ShapeElement = {
    type: 'shape',
    id: generateId(),
    transform: IDENTITY_MATRIX,
    paths: [shapePath],
    sourceStrokes: strokes,
  };

  // Only include alternativeCandidates if there are multiple viable options
  const result: CreationResult = {
    elements: [element],
    consumedStrokes: strokes,
    confidence: classification.confidence,
  };

  if (alternativeCandidates.length > 1) {
    result.alternativeCandidates = alternativeCandidates;
  }

  return result;
}
