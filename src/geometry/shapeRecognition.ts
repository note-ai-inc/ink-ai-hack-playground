// Shape recognition: feature extraction, classification, and beautification

import type { Offset, BoundingBox } from '../types/primitives';
import { offsetDistance, boundingBoxFromOffsets } from '../types/primitives';
import type { Stroke } from '../types/brush';
import type { ShapePath, ShapePathCommand } from '../elements/shape/types';
import type { Corner } from './cornerDetection';
import {
  detectCorners,
  rdpSimplify,
  pathLength,
  isPathClosed,
  closureGapRatio,
  estimateStrokeNoise,
} from './cornerDetection';
import { polygonArea, polygonCentroid } from './polygon';
import { debugLog } from '../debug/DebugLogger';

// Configuration constants
const CLOSURE_GAP_RATIO = 0.15; // 15% of perimeter
const CIRCLE_COMPACTNESS_THRESHOLD = 0.75;
const CIRCLE_RADIUS_VARIANCE_MAX = 0.25;
const CIRCLE_MAX_CORNERS = 5; // Circles may have several detected corners due to hand-drawn wobble
const RECTANGLE_ANGLE_TOLERANCE = Math.PI / 12; // 15 degrees
const MIN_CONFIDENCE = 0.70;

// Bezier magic number for approximating circles with cubic beziers
const BEZIER_CIRCLE_CONSTANT = 0.5522847498;

// Supported shape types
export type ShapeType = 'circle' | 'rectangle' | 'triangle' | 'pentagon' | 'hexagon' | 'octagon';

export interface StrokeFeatures {
  points: Offset[];
  centroid: Offset;
  boundingBox: BoundingBox;
  pathLength: number;
  isClosed: boolean;
  closureGap: number;
  closureGapRatio: number;
  corners: Corner[];
  compactness: number;
  radiusVariance: number;
  averageRadius: number;
  noiseLevel: number;
  adaptedEpsilon: number;
}

export interface ClassificationResult {
  shape: ShapeType;
  confidence: number;
  corners: Corner[];
}

/**
 * Extract all points from strokes into a single array.
 */
export function extractPoints(strokes: Stroke[]): Offset[] {
  const points: Offset[] = [];
  for (const stroke of strokes) {
    for (const input of stroke.inputs.inputs) {
      points.push({ x: input.x, y: input.y });
    }
  }
  return points;
}

/**
 * Merge multi-stroke paths if endpoints are close.
 * Returns a single path with connected points.
 */
export function mergeStrokePaths(strokes: Stroke[], connectionThreshold: number = 20): Offset[] {
  if (strokes.length === 0) return [];
  if (strokes.length === 1) {
    return strokes[0].inputs.inputs.map(input => ({ x: input.x, y: input.y }));
  }

  // Extract paths from each stroke
  const paths: Offset[][] = strokes.map(stroke =>
    stroke.inputs.inputs.map(input => ({ x: input.x, y: input.y }))
  );

  // Simple merge: just concatenate points if they're close enough
  const merged = [...paths[0]];

  for (let i = 1; i < paths.length; i++) {
    const path = paths[i];
    if (path.length === 0) continue;

    const mergedEnd = merged[merged.length - 1];
    const pathStart = path[0];
    const pathEnd = path[path.length - 1];

    // Check which end of the new path is closer to our current end
    const distToStart = offsetDistance(mergedEnd, pathStart);
    const distToEnd = offsetDistance(mergedEnd, pathEnd);

    if (distToStart <= connectionThreshold || distToEnd <= connectionThreshold) {
      // Connect paths
      if (distToEnd < distToStart) {
        // Reverse the path
        merged.push(...path.reverse());
      } else {
        merged.push(...path);
      }
    } else {
      // Gap too large, just append
      merged.push(...path);
    }
  }

  return merged;
}

/**
 * Calculate radius variance from centroid.
 * Returns { variance, average } where variance is normalized (0-1).
 */
function calculateRadiusStats(points: Offset[], centroid: Offset): { variance: number; average: number } {
  if (points.length === 0) return { variance: 1, average: 0 };

  const radii = points.map(p => offsetDistance(p, centroid));
  const average = radii.reduce((a, b) => a + b, 0) / radii.length;

  if (average === 0) return { variance: 1, average: 0 };

  // Calculate variance
  const sumSquaredDiff = radii.reduce((sum, r) => sum + (r - average) ** 2, 0);
  const stdDev = Math.sqrt(sumSquaredDiff / radii.length);

  // Normalize by average radius
  const variance = stdDev / average;

  return { variance, average };
}

/**
 * Calculate compactness: 4 * PI * area / perimeter^2
 * A perfect circle has compactness = 1.0
 */
function calculateCompactness(points: Offset[], perimeter: number): number {
  if (points.length < 3 || perimeter === 0) return 0;

  // Close the polygon for area calculation if not already closed
  const closed = [...points];
  if (offsetDistance(closed[0], closed[closed.length - 1]) > 1) {
    closed.push(closed[0]);
  }

  const area = polygonArea(closed);
  return (4 * Math.PI * area) / (perimeter * perimeter);
}

/**
 * Extract geometric features from strokes.
 */
export function extractFeatures(strokes: Stroke[]): StrokeFeatures | null {
  const points = mergeStrokePaths(strokes);

  if (points.length < 3) return null;

  const bbox = boundingBoxFromOffsets(points);
  if (!bbox) return null;

  /*
   * Estimate input noise and derive adaptive epsilons. At noise <= 4px the
   * clamp floors reproduce the previous hardcoded values (epsilon=8,
   * smoothing=3). Above ~4.5px noise the epsilons scale up so that RDP
   * filters out jitter before corner detection.
   */
  const noiseLevel = estimateStrokeNoise(points);
  const adaptedEpsilon = Math.min(20, Math.max(8, noiseLevel * 1.8));
  const smoothingEpsilon = Math.min(8, Math.max(3, noiseLevel * 0.6));

  const smoothed = rdpSimplify(points, smoothingEpsilon);

  const perimeter = pathLength(smoothed);
  const centroid = polygonCentroid(smoothed);
  const closed = isPathClosed(smoothed);
  const gapRatio = closureGapRatio(smoothed);
  const gap = offsetDistance(smoothed[0], smoothed[smoothed.length - 1]);
  const corners = detectCorners(points, { epsilon: adaptedEpsilon });
  const compactness = calculateCompactness(smoothed, perimeter);
  const { variance: radiusVariance, average: averageRadius } = calculateRadiusStats(smoothed, centroid);

  return {
    points,
    centroid,
    boundingBox: bbox,
    pathLength: perimeter,
    isClosed: closed,
    closureGap: gap,
    closureGapRatio: gapRatio,
    corners,
    compactness,
    radiusVariance,
    averageRadius,
    noiseLevel,
    adaptedEpsilon,
  };
}

/**
 * Check if shape is a circle.
 */
function isCircle(features: StrokeFeatures): { match: boolean; confidence: number } {
  debugLog.info('isCircle: checking shape', {
    isClosed: features.isClosed,
    closureGapRatio: features.closureGapRatio.toFixed(3),
    closureThreshold: CLOSURE_GAP_RATIO,
    compactness: features.compactness.toFixed(3),
    compactnessThreshold: CIRCLE_COMPACTNESS_THRESHOLD,
    radiusVariance: features.radiusVariance.toFixed(3),
    radiusVarianceMax: CIRCLE_RADIUS_VARIANCE_MAX,
    corners: features.corners.length,
    maxCorners: CIRCLE_MAX_CORNERS,
  });

  // Must be closed
  if (!features.isClosed && features.closureGapRatio > CLOSURE_GAP_RATIO) {
    debugLog.warn('isCircle: FAILED - not closed enough', {
      closureGapRatio: features.closureGapRatio.toFixed(3),
      threshold: CLOSURE_GAP_RATIO,
      gap: features.closureGap.toFixed(1) + 'px',
    });
    return { match: false, confidence: 0 };
  }
  debugLog.info('isCircle: ✓ closure check passed');

  // Must have high compactness
  if (features.compactness < CIRCLE_COMPACTNESS_THRESHOLD) {
    debugLog.warn('isCircle: FAILED - compactness too low (shape not round enough)', {
      compactness: features.compactness.toFixed(3),
      threshold: CIRCLE_COMPACTNESS_THRESHOLD,
      hint: 'Perfect circle = 1.0, your shape is too elongated or irregular',
    });
    return { match: false, confidence: 0 };
  }
  debugLog.info('isCircle: ✓ compactness check passed');

  // Must have low radius variance
  if (features.radiusVariance > CIRCLE_RADIUS_VARIANCE_MAX) {
    debugLog.warn('isCircle: FAILED - radius variance too high (not circular enough)', {
      radiusVariance: features.radiusVariance.toFixed(3),
      threshold: CIRCLE_RADIUS_VARIANCE_MAX,
      hint: 'Distance from center to edge is too inconsistent (oval-like)',
    });
    return { match: false, confidence: 0 };
  }
  debugLog.info('isCircle: ✓ radius variance check passed');

  // Should have few corners (circles can have noise-induced corners)
  if (features.corners.length > CIRCLE_MAX_CORNERS) {
    debugLog.warn('isCircle: FAILED - too many corners detected', {
      corners: features.corners.length,
      maxCorners: CIRCLE_MAX_CORNERS,
      hint: 'Shape has too many sharp angle changes, looks more like a polygon',
    });
    return { match: false, confidence: 0 };
  }
  debugLog.info('isCircle: ✓ corner count check passed');

  // Calculate confidence based on how "circular" the shape is
  const compactnessScore = Math.min(1, features.compactness / 1.0); // Perfect circle = 1.0
  const radiusScore = 1 - (features.radiusVariance / CIRCLE_RADIUS_VARIANCE_MAX);
  const closureScore = 1 - features.closureGapRatio;

  const confidence = (compactnessScore * 0.4 + radiusScore * 0.4 + closureScore * 0.2);

  debugLog.info('isCircle: ALL CHECKS PASSED - calculating confidence', {
    compactnessScore: compactnessScore.toFixed(3) + ' (40% weight)',
    radiusScore: radiusScore.toFixed(3) + ' (40% weight)',
    closureScore: closureScore.toFixed(3) + ' (20% weight)',
    rawConfidence: confidence.toFixed(3),
    finalConfidence: Math.min(0.90, confidence).toFixed(3),
  });

  return { match: true, confidence: Math.min(0.90, confidence) };
}

/**
 * Check if a 4-corner shape is a rectangle (has ~90 degree angles).
 */
function isRectangle(corners: Corner[]): { match: boolean; confidence: number } {
  if (corners.length !== 4) {
    return { match: false, confidence: 0 };
  }

  const rightAngle = Math.PI / 2;
  let rightAngleCount = 0;
  let totalAngleDeviation = 0;

  for (const corner of corners) {
    const deviation = Math.abs(corner.angle - rightAngle);
    totalAngleDeviation += deviation;

    if (deviation < RECTANGLE_ANGLE_TOLERANCE) {
      rightAngleCount++;
    }
  }

  // Need at least 3 right angles
  if (rightAngleCount < 3) {
    return { match: false, confidence: 0 };
  }

  // Calculate confidence based on angle regularity
  const avgDeviation = totalAngleDeviation / 4;
  const confidence = Math.max(0, 1 - (avgDeviation / (Math.PI / 4)));

  return { match: true, confidence: Math.min(0.88, confidence) };
}

/**
 * Try to infer a rectangle from 3 detected corners.
 * This handles cases where one corner is too rounded to be detected.
 */
function tryInferRectangleFrom3Corners(features: StrokeFeatures): ClassificationResult | null {
  const corners = features.corners;
  if (corners.length !== 3) return null;

  // Must be well-closed
  if (features.closureGapRatio > CLOSURE_GAP_RATIO) {
    return null;
  }

  const rightAngle = Math.PI / 2;
  let rightAngleCount = 0;
  let totalAngleDeviation = 0;

  // Check if all 3 detected corners have ~90° angles
  for (const corner of corners) {
    const deviation = Math.abs(corner.angle - rightAngle);
    totalAngleDeviation += deviation;

    if (deviation < RECTANGLE_ANGLE_TOLERANCE) {
      rightAngleCount++;
    }
  }

  // Need all 3 detected corners to be right angles
  if (rightAngleCount < 3) {
    return null;
  }

  // Verify the shape's bounding box is roughly rectangular
  const bbox = features.boundingBox;
  const bboxWidth = bbox.right - bbox.left;
  const bboxHeight = bbox.bottom - bbox.top;
  const bboxArea = bboxWidth * bboxHeight;

  // Check that the shape fills most of its bounding box (rectangles should)
  const shapeArea = Math.abs(polygonArea(features.points));
  const fillRatio = shapeArea / bboxArea;

  // Rectangles typically fill 70-100% of their bounding box
  if (fillRatio < 0.65) {
    return null;
  }

  // Calculate confidence - lower than 4-corner detection since we're inferring
  const avgDeviation = totalAngleDeviation / 3;
  const angleScore = Math.max(0, 1 - (avgDeviation / (Math.PI / 4)));
  const closureScore = 1 - features.closureGapRatio;

  const confidence = (angleScore * 0.5 + closureScore * 0.3 + fillRatio * 0.2);

  // Cap at 0.75 since we're inferring the 4th corner
  if (confidence < MIN_CONFIDENCE) {
    return null;
  }

  debugLog.info('tryInferRectangleFrom3Corners: success', {
    rightAngleCount,
    avgDeviation: (avgDeviation * 180 / Math.PI).toFixed(1) + '°',
    fillRatio: fillRatio.toFixed(2),
    confidence: confidence.toFixed(2),
  });

  return {
    shape: 'rectangle',
    confidence: Math.min(0.75, confidence),
    corners: features.corners,
  };
}

/**
 * Check polygon angle regularity for regular polygon detection.
 */
function calculatePolygonRegularity(corners: Corner[], expectedAngle: number): number {
  if (corners.length === 0) return 0;

  let totalDeviation = 0;
  for (const corner of corners) {
    totalDeviation += Math.abs(corner.angle - expectedAngle);
  }

  const avgDeviation = totalDeviation / corners.length;
  return Math.max(0, 1 - (avgDeviation / (Math.PI / 4)));
}

/**
 * Check if a 3-corner shape is a triangle.
 * Triangles don't need to be regular - any triangle whose angles sum to ~180° is valid.
 */
function isTriangle(features: StrokeFeatures): { match: boolean; confidence: number } {
  const corners = features.corners;
  if (corners.length !== 3) {
    return { match: false, confidence: 0 };
  }

  // Must be closed
  if (!features.isClosed && features.closureGapRatio > CLOSURE_GAP_RATIO) {
    return { match: false, confidence: 0 };
  }

  // Sum of interior angles should be ~180° (π radians)
  const angleSum = corners.reduce((sum, c) => sum + c.angle, 0);
  const expectedSum = Math.PI; // 180 degrees
  const sumDeviation = Math.abs(angleSum - expectedSum);

  // Allow up to 30° total deviation from 180°
  const maxSumDeviation = Math.PI / 6; // 30 degrees
  if (sumDeviation > maxSumDeviation) {
    return { match: false, confidence: 0 };
  }

  // Each angle should be reasonable (between 15° and 150°)
  const minAngle = Math.PI / 12; // 15 degrees
  const maxAngle = (5 * Math.PI) / 6; // 150 degrees
  for (const corner of corners) {
    if (corner.angle < minAngle || corner.angle > maxAngle) {
      return { match: false, confidence: 0 };
    }
  }

  // Calculate confidence based on how close angle sum is to 180°
  const sumScore = 1 - (sumDeviation / maxSumDeviation);
  const closureScore = 1 - features.closureGapRatio;

  const confidence = sumScore * 0.6 + closureScore * 0.4;

  debugLog.info('isTriangle: matched', {
    angleSum: (angleSum * 180 / Math.PI).toFixed(1) + '°',
    sumDeviation: (sumDeviation * 180 / Math.PI).toFixed(1) + '°',
    confidence: confidence.toFixed(2),
  });

  return { match: true, confidence: Math.min(0.88, confidence) };
}

/**
 * Classify a polygon based on corner count.
 */
function classifyPolygon(features: StrokeFeatures): ClassificationResult | null {
  const cornerCount = features.corners.length;

  // Must be closed
  if (!features.isClosed && features.closureGapRatio > CLOSURE_GAP_RATIO) {
    return null;
  }

  // Expected interior angles for regular polygons
  const expectedAngles: Record<number, { shape: ShapeType; angle: number }> = {
    3: { shape: 'triangle', angle: Math.PI / 3 }, // 60 degrees
    4: { shape: 'rectangle', angle: Math.PI / 2 }, // 90 degrees
    5: { shape: 'pentagon', angle: (3 * Math.PI) / 5 }, // 108 degrees
    6: { shape: 'hexagon', angle: (2 * Math.PI) / 3 }, // 120 degrees
    8: { shape: 'octagon', angle: (3 * Math.PI) / 4 }, // 135 degrees
  };

  const expected = expectedAngles[cornerCount];
  if (!expected) return null;

  // Special handling for rectangles
  if (cornerCount === 4) {
    const rectResult = isRectangle(features.corners);
    if (rectResult.match) {
      return {
        shape: 'rectangle',
        confidence: rectResult.confidence,
        corners: features.corners,
      };
    }
  }

  // Try 3-corner rectangle fallback (one corner may be too rounded to detect)
  if (cornerCount === 3) {
    const inferredRect = tryInferRectangleFrom3Corners(features);
    if (inferredRect) {
      return inferredRect;
    }
    // Try triangle detection (allows any triangle, not just equilateral)
    const triangleResult = isTriangle(features);
    if (triangleResult.match && triangleResult.confidence >= MIN_CONFIDENCE) {
      return {
        shape: 'triangle',
        confidence: triangleResult.confidence,
        corners: features.corners,
      };
    }
    return null;
  }

  // Calculate regularity for other polygons (pentagon, hexagon, octagon)
  const regularity = calculatePolygonRegularity(features.corners, expected.angle);
  const closureScore = 1 - features.closureGapRatio;

  // Confidence based on regularity and closure
  const confidence = regularity * 0.7 + closureScore * 0.3;

  if (confidence < MIN_CONFIDENCE) {
    return null;
  }

  return {
    shape: expected.shape,
    confidence: Math.min(0.88, confidence),
    corners: features.corners,
  };
}

/**
 * Classify the shape from features.
 */
export function classifyShape(features: StrokeFeatures): ClassificationResult | null {
  debugLog.info('classifyShape: checking closure', {
    isClosed: features.isClosed,
    closureGapRatio: features.closureGapRatio.toFixed(3),
    threshold: CLOSURE_GAP_RATIO,
  });

  // Must be closed (or nearly closed)
  if (!features.isClosed && features.closureGapRatio > CLOSURE_GAP_RATIO) {
    debugLog.info('classifyShape: REJECTED - not closed');
    return null;
  }

  // First, check for circle
  debugLog.info('classifyShape: checking circle', {
    compactness: features.compactness.toFixed(3),
    compactnessThreshold: CIRCLE_COMPACTNESS_THRESHOLD,
    radiusVariance: features.radiusVariance.toFixed(3),
    radiusVarianceMax: CIRCLE_RADIUS_VARIANCE_MAX,
    corners: features.corners.length,
    maxCorners: CIRCLE_MAX_CORNERS,
  });

  const circleResult = isCircle(features);
  debugLog.info('classifyShape: circle result', circleResult);

  if (circleResult.match && circleResult.confidence >= MIN_CONFIDENCE) {
    return {
      shape: 'circle',
      confidence: circleResult.confidence,
      corners: [],
    };
  }

  // Try polygon classification
  debugLog.info('classifyShape: checking polygon', {
    cornerCount: features.corners.length,
    supportedCounts: [3, 4, 5, 6, 8],
  });

  const polygonResult = classifyPolygon(features);
  debugLog.info('classifyShape: polygon result', polygonResult);

  if (polygonResult) {
    return polygonResult;
  }

  return null;
}

/**
 * Create a circle path using cubic bezier curves.
 */
export function beautifyCircle(features: StrokeFeatures, strokeColor: number, strokeWidth: number): ShapePath {
  const cx = features.centroid.x;
  const cy = features.centroid.y;
  const r = features.averageRadius;

  const k = BEZIER_CIRCLE_CONSTANT * r;

  const commands: ShapePathCommand[] = [
    { type: 'moveTo', points: [{ x: cx + r, y: cy }] },
    // Top-right quarter
    {
      type: 'cubicTo',
      points: [
        { x: cx + r, y: cy - k },
        { x: cx + k, y: cy - r },
        { x: cx, y: cy - r },
      ],
    },
    // Top-left quarter
    {
      type: 'cubicTo',
      points: [
        { x: cx - k, y: cy - r },
        { x: cx - r, y: cy - k },
        { x: cx - r, y: cy },
      ],
    },
    // Bottom-left quarter
    {
      type: 'cubicTo',
      points: [
        { x: cx - r, y: cy + k },
        { x: cx - k, y: cy + r },
        { x: cx, y: cy + r },
      ],
    },
    // Bottom-right quarter
    {
      type: 'cubicTo',
      points: [
        { x: cx + k, y: cy + r },
        { x: cx + r, y: cy + k },
        { x: cx + r, y: cy },
      ],
    },
    { type: 'close' },
  ];

  return {
    commands,
    strokeColor,
    strokeWidth,
  };
}

/**
 * Create a regular polygon path.
 */
export function beautifyPolygon(
  n: number,
  features: StrokeFeatures,
  strokeColor: number,
  strokeWidth: number
): ShapePath {
  const cx = features.centroid.x;
  const cy = features.centroid.y;
  const r = features.averageRadius;

  // Determine starting angle based on detected corners
  let startAngle = -Math.PI / 2; // Default: first vertex at top

  if (features.corners.length > 0) {
    // Use the angle from centroid to first corner
    const firstCorner = features.corners[0].point;
    startAngle = Math.atan2(firstCorner.y - cy, firstCorner.x - cx);
  }

  // Generate vertices
  const vertices: Offset[] = [];
  for (let i = 0; i < n; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / n;
    vertices.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }

  // Build path commands
  const commands: ShapePathCommand[] = [
    { type: 'moveTo', points: [vertices[0]] },
  ];

  for (let i = 1; i < vertices.length; i++) {
    commands.push({ type: 'lineTo', points: [vertices[i]] });
  }

  commands.push({ type: 'close' });

  return {
    commands,
    strokeColor,
    strokeWidth,
  };
}

/**
 * Create a rectangle path preserving orientation.
 */
export function beautifyRectangle(
  features: StrokeFeatures,
  strokeColor: number,
  strokeWidth: number
): ShapePath {
  const corners = features.corners;

  if (corners.length !== 4) {
    // Fallback to bounding box
    const bbox = features.boundingBox;
    const commands: ShapePathCommand[] = [
      { type: 'moveTo', points: [{ x: bbox.left, y: bbox.top }] },
      { type: 'lineTo', points: [{ x: bbox.right, y: bbox.top }] },
      { type: 'lineTo', points: [{ x: bbox.right, y: bbox.bottom }] },
      { type: 'lineTo', points: [{ x: bbox.left, y: bbox.bottom }] },
      { type: 'close' },
    ];

    return {
      commands,
      strokeColor,
      strokeWidth,
    };
  }

  // Sort corners to form proper rectangle (clockwise from top-left)
  const sorted = [...corners].sort((a, b) => {
    // First by y (top to bottom)
    const yDiff = a.point.y - b.point.y;
    if (Math.abs(yDiff) > 20) return yDiff;
    // Then by x (left to right)
    return a.point.x - b.point.x;
  });

  // Top row sorted left to right
  const topRow = [sorted[0], sorted[1]].sort((a, b) => a.point.x - b.point.x);
  // Bottom row sorted left to right
  const bottomRow = [sorted[2], sorted[3]].sort((a, b) => a.point.x - b.point.x);

  const topLeft = topRow[0].point;
  const topRight = topRow[1].point;
  const bottomRight = bottomRow[1].point;
  const bottomLeft = bottomRow[0].point;

  // Calculate average dimensions for regularization
  const topWidth = offsetDistance(topLeft, topRight);
  const bottomWidth = offsetDistance(bottomLeft, bottomRight);
  const leftHeight = offsetDistance(topLeft, bottomLeft);
  const rightHeight = offsetDistance(topRight, bottomRight);

  const avgWidth = (topWidth + bottomWidth) / 2;
  const avgHeight = (leftHeight + rightHeight) / 2;

  // Use centroid and average dimensions for regularized rectangle
  const cx = features.centroid.x;
  const cy = features.centroid.y;

  const halfW = avgWidth / 2;
  const halfH = avgHeight / 2;

  // Calculate rotation angle from the original rectangle
  const angle = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x);

  // Create regularized corners
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const rotate = (dx: number, dy: number): Offset => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  });

  const rectCorners = [
    rotate(-halfW, -halfH), // top-left
    rotate(halfW, -halfH),  // top-right
    rotate(halfW, halfH),   // bottom-right
    rotate(-halfW, halfH),  // bottom-left
  ];

  const commands: ShapePathCommand[] = [
    { type: 'moveTo', points: [rectCorners[0]] },
    { type: 'lineTo', points: [rectCorners[1]] },
    { type: 'lineTo', points: [rectCorners[2]] },
    { type: 'lineTo', points: [rectCorners[3]] },
    { type: 'close' },
  ];

  return {
    commands,
    strokeColor,
    strokeWidth,
  };
}

/**
 * Beautify a shape based on classification result.
 */
export function beautifyShape(
  type: ShapeType,
  features: StrokeFeatures,
  strokeColor: number,
  strokeWidth: number
): ShapePath {
  switch (type) {
    case 'circle':
      return beautifyCircle(features, strokeColor, strokeWidth);
    case 'rectangle':
      return beautifyRectangle(features, strokeColor, strokeWidth);
    case 'triangle':
      return beautifyPolygon(3, features, strokeColor, strokeWidth);
    case 'pentagon':
      return beautifyPolygon(5, features, strokeColor, strokeWidth);
    case 'hexagon':
      return beautifyPolygon(6, features, strokeColor, strokeWidth);
    case 'octagon':
      return beautifyPolygon(8, features, strokeColor, strokeWidth);
  }
}

// ============================================================================
// Multi-candidate classification for disambiguation
// ============================================================================

// Minimum confidence for a candidate to be included in alternatives
const MIN_ALTERNATIVE_CONFIDENCE = 0.60;

// Corner count tolerance for polygon matching (allows ±2 corners from target)
const CORNER_COUNT_TOLERANCE = 2;

/**
 * Try to classify shape as a specific polygon type with relaxed corner count.
 * Returns confidence if viable, or 0 if not.
 */
function tryPolygonType(
  features: StrokeFeatures,
  targetSides: number,
  expectedAngle: number
): number {
  const cornerCount = features.corners.length;

  // Check if corner count is within tolerance of target
  if (Math.abs(cornerCount - targetSides) > CORNER_COUNT_TOLERANCE) {
    return 0;
  }

  // Special handling for rectangles (4 sides)
  if (targetSides === 4) {
    const rectResult = isRectangle(features.corners);
    if (rectResult.match) {
      return rectResult.confidence;
    }
    // Also try 3-corner rectangle inference
    if (cornerCount === 3) {
      const inferredRect = tryInferRectangleFrom3Corners(features);
      if (inferredRect) {
        return inferredRect.confidence;
      }
    }
  }

  // Special handling for triangles (3 sides)
  if (targetSides === 3 && cornerCount === 3) {
    const triangleResult = isTriangle(features);
    if (triangleResult.match) {
      return triangleResult.confidence;
    }
    return 0;
  }

  // For other polygons, calculate regularity score
  if (cornerCount < 3) return 0;

  const regularity = calculatePolygonRegularity(features.corners, expectedAngle);
  const closureScore = 1 - features.closureGapRatio;

  // Adjust confidence based on how close corner count is to target
  const cornerCountDiff = Math.abs(cornerCount - targetSides);
  const cornerCountPenalty = cornerCountDiff * 0.1; // 10% penalty per corner difference

  const confidence = (regularity * 0.7 + closureScore * 0.3) - cornerCountPenalty;

  return Math.max(0, Math.min(0.88, confidence));
}

/**
 * Classify a shape and return ALL viable candidates, not just the best match.
 * This enables disambiguation when multiple shape types are close in confidence.
 *
 * @param features The extracted stroke features
 * @returns Array of classification results sorted by confidence (highest first),
 *          filtered to those above MIN_ALTERNATIVE_CONFIDENCE
 */
export function classifyShapeWithAlternatives(features: StrokeFeatures): ClassificationResult[] {
  const results: ClassificationResult[] = [];
  const allScores: { shape: string; confidence: number; reason?: string }[] = [];

  debugLog.info('=== classifyShapeWithAlternatives START ===', {
    isClosed: features.isClosed,
    closureGapRatio: features.closureGapRatio.toFixed(3),
    corners: features.corners.length,
    compactness: features.compactness.toFixed(3),
    radiusVariance: features.radiusVariance.toFixed(3),
  });

  // Must be closed (or nearly closed)
  if (!features.isClosed && features.closureGapRatio > CLOSURE_GAP_RATIO) {
    debugLog.info('classifyShapeWithAlternatives: REJECTED - not closed');
    return [];
  }

  // Try circle
  const circleResult = isCircle(features);
  allScores.push({
    shape: 'circle',
    confidence: circleResult.confidence,
    reason: circleResult.match ? 'matched' : 'no match',
  });
  if (circleResult.match && circleResult.confidence >= MIN_ALTERNATIVE_CONFIDENCE) {
    results.push({
      shape: 'circle',
      confidence: circleResult.confidence,
      corners: [],
    });
  }

  // Expected interior angles for regular polygons
  const polygonTypes: { sides: number; shape: ShapeType; angle: number }[] = [
    { sides: 3, shape: 'triangle', angle: Math.PI / 3 },      // 60 degrees
    { sides: 4, shape: 'rectangle', angle: Math.PI / 2 },     // 90 degrees
    { sides: 5, shape: 'pentagon', angle: (3 * Math.PI) / 5 }, // 108 degrees
    { sides: 6, shape: 'hexagon', angle: (2 * Math.PI) / 3 },  // 120 degrees
    { sides: 8, shape: 'octagon', angle: (3 * Math.PI) / 4 },  // 135 degrees
  ];

  // Try all polygon types
  for (const { sides, shape, angle } of polygonTypes) {
    const confidence = tryPolygonType(features, sides, angle);
    allScores.push({
      shape,
      confidence,
      reason: confidence >= MIN_ALTERNATIVE_CONFIDENCE ? 'viable' : `below ${MIN_ALTERNATIVE_CONFIDENCE}`,
    });
    if (confidence >= MIN_ALTERNATIVE_CONFIDENCE) {
      results.push({
        shape,
        confidence,
        corners: features.corners,
      });
    }
  }

  /*
   * Secondary corner detection pass: when the primary pass detects few corners
   * (due to the default angle threshold being close to the exterior angle of
   * many-sided polygons like octagons), re-run corner detection with a lower
   * threshold to discover hidden polygon structure. This helps distinguish
   * near-circular polygons from true circles.
   */
  /*
   * Secondary corner detection: when circle leads, re-run corner detection with
   * a slightly relaxed angle threshold to reveal polygon structure that the
   * primary pass misses (e.g., octagons whose 45° exterior angle sits right at
   * the default threshold). Uses the same RDP epsilon to avoid diluting corners.
   *
   * When the secondary pass discovers meaningful polygon candidates, their
   * confidence is floored to ensure disambiguation is offered. This is
   * intentional: a shape that genuinely straddles circle/polygon is ambiguous,
   * and the user should choose.
   */
  const SECONDARY_ANGLE_THRESHOLD = Math.PI / 4.5; // 40° — cleanly separates octagon corners (~42-55°) from circle noise (~20-39°)
  const DISAMBIGUATION_MARGIN = 0.08;
  const circleIsLeading = results.length > 0 && results[0]?.shape === 'circle';
  if (circleIsLeading) {
    const secondaryCorners = detectCorners(features.points, {
      epsilon: features.adaptedEpsilon,
      angleThreshold: SECONDARY_ANGLE_THRESHOLD,
    });

    const MIN_ADDITIONAL_CORNERS = 1;
    if (secondaryCorners.length >= features.corners.length + MIN_ADDITIONAL_CORNERS) {
      const circleConfidence = results[0].confidence;
      debugLog.info('=== SECONDARY CORNER DETECTION ===', {
        primaryCorners: features.corners.length,
        secondaryCorners: secondaryCorners.length,
        angleThreshold: (SECONDARY_ANGLE_THRESHOLD * 180 / Math.PI).toFixed(1) + '°',
      });

      const secondaryFeatures = { ...features, corners: secondaryCorners };
      for (const { sides, shape, angle } of polygonTypes) {
        const rawConfidence = tryPolygonType(secondaryFeatures, sides, angle);
        if (rawConfidence >= MIN_ALTERNATIVE_CONFIDENCE) {
          /*
           * Floor the confidence so it falls within the disambiguation margin
           * of the circle. This ensures the user gets to choose when the
           * secondary pass reveals genuine polygon structure.
           */
          const confidence = Math.max(rawConfidence, circleConfidence - DISAMBIGUATION_MARGIN);
          const existing = results.find(r => r.shape === shape);
          if (existing) {
            existing.confidence = Math.max(existing.confidence, confidence);
          } else {
            results.push({ shape, confidence, corners: secondaryCorners });
          }
          allScores.push({ shape, confidence, reason: `secondary pass (raw=${rawConfidence.toFixed(3)}, floored to ${confidence.toFixed(3)})` });
        }
      }
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  // Log ALL scores for debugging (sorted by confidence)
  allScores.sort((a, b) => b.confidence - a.confidence);
  debugLog.info('=== ALL SHAPE SCORES ===', {
    scores: allScores.map(s => `${s.shape}: ${s.confidence.toFixed(3)} (${s.reason})`),
  });

  debugLog.info('=== VIABLE CANDIDATES ===', {
    count: results.length,
    candidates: results.map(r => `${r.shape}(${r.confidence.toFixed(3)})`),
    minConfidence: MIN_ALTERNATIVE_CONFIDENCE,
  });

  // Check if disambiguation would be triggered
  if (results.length >= 2) {
    const gap = results[0].confidence - results[1].confidence;
    debugLog.info('=== DISAMBIGUATION CHECK ===', {
      best: `${results[0].shape}(${results[0].confidence.toFixed(3)})`,
      second: `${results[1].shape}(${results[1].confidence.toFixed(3)})`,
      gap: gap.toFixed(3),
      threshold: 0.10,
      wouldDisambiguate: gap < 0.10,
    });
  }

  return results;
}
