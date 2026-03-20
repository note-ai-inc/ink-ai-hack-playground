// Overlap calculation utilities for scribble eraser

import type { Offset, BoundingBox, Quad, Stroke, Element } from '../types';
import type { StrokeElement } from '../elements/stroke/types';
import type { ShapeElement } from '../elements/shape/types';
import type { GlyphElement } from '../elements/glyph/types';
import type { InkTextElement, InkTextToken } from '../elements/inktext/types';
import type { TicTacToeElement } from '../elements/tictactoe/types';
import type { CoordinatePlaneElement, PlottedPoint, RelativeStroke } from '../elements/coordinateplane/types';
import type { ImageElement } from '../elements/image/types';
import { pointInPolygon } from '../geometry';
import { getElementBounds } from '../elements/rendering/ElementRenderer';
import { boundingBoxesIntersect } from '../types/primitives';

export interface OverlapCalculationOptions {
  sampleInterval?: number; // Distance between sample points along strokes (default: 5)
  gridDensity?: number; // Number of samples per axis for grid sampling (default: 10)
}

// Token-level overlap result for InkText elements
export interface TokenOverlapResult {
  lineIndex: number;
  tokenIndex: number;
  overlap: number;
  token: InkTextToken;
}

export interface InkTextTokenOverlapResult {
  tokenOverlaps: TokenOverlapResult[];
}

// Point-level overlap result for CoordinatePlane elements
export interface CoordinatePlanePointOverlapResult {
  pointIndex: number;
  overlap: number;  // 1.0 if inside hull, 0.0 if outside
  point: PlottedPoint;
}

// Ink stroke overlap result for CoordinatePlane elements
export interface CoordinatePlaneInkOverlapResult {
  inkIndex: number;
  overlap: number;  // Ratio of stroke points inside hull
  ink: RelativeStroke;
}

export interface CoordinatePlaneContentOverlapResult {
  pointOverlaps: CoordinatePlanePointOverlapResult[];
  inkOverlaps: CoordinatePlaneInkOverlapResult[];
}

/**
 * Sample points along a stroke path at regular intervals.
 */
export function sampleStrokePoints(stroke: Stroke, interval: number = 5): Offset[] {
  const inputs = stroke.inputs.inputs;
  if (inputs.length === 0) return [];
  if (inputs.length === 1) return [{ x: inputs[0].x, y: inputs[0].y }];

  const samples: Offset[] = [];
  let accumulatedDistance = 0;

  // Always include the first point
  samples.push({ x: inputs[0].x, y: inputs[0].y });

  for (let i = 1; i < inputs.length; i++) {
    const prev = inputs[i - 1];
    const curr = inputs[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (segmentLength === 0) continue;

    // Add points along this segment at the sample interval
    let distanceInSegment = interval - accumulatedDistance;

    while (distanceInSegment <= segmentLength) {
      const t = distanceInSegment / segmentLength;
      samples.push({
        x: prev.x + t * dx,
        y: prev.y + t * dy,
      });
      distanceInSegment += interval;
    }

    accumulatedDistance = segmentLength - (distanceInSegment - interval);
  }

  // Always include the last point
  const last = inputs[inputs.length - 1];
  const lastSample = samples[samples.length - 1];
  if (lastSample.x !== last.x || lastSample.y !== last.y) {
    samples.push({ x: last.x, y: last.y });
  }

  return samples;
}

/**
 * Generate grid sample points within a bounding box.
 */
export function generateGridSamples(bounds: BoundingBox, density: number = 10): Offset[] {
  const samples: Offset[] = [];
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;

  if (width <= 0 || height <= 0) return [];

  const stepX = width / density;
  const stepY = height / density;

  for (let i = 0; i <= density; i++) {
    for (let j = 0; j <= density; j++) {
      samples.push({
        x: bounds.left + i * stepX,
        y: bounds.top + j * stepY,
      });
    }
  }

  return samples;
}

/**
 * Convert a quad to a bounding box for quick rejection tests.
 */
export function quadToBoundingBox(quad: Quad): BoundingBox {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let left = points[0].x;
  let top = points[0].y;
  let right = points[0].x;
  let bottom = points[0].y;

  for (const p of points) {
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }

  return { left, top, right, bottom };
}

/**
 * Generate sample points within a quad using bilinear interpolation.
 * This handles non-rectangular quads (e.g., from rotated text).
 */
export function generateQuadGridSamples(quad: Quad, density: number = 10): Offset[] {
  const samples: Offset[] = [];

  for (let i = 0; i <= density; i++) {
    const u = i / density; // 0 to 1 along top/bottom edges
    for (let j = 0; j <= density; j++) {
      const v = j / density; // 0 to 1 along left/right edges

      // Bilinear interpolation within the quad
      // Top edge interpolation
      const topX = quad.topLeft.x + u * (quad.topRight.x - quad.topLeft.x);
      const topY = quad.topLeft.y + u * (quad.topRight.y - quad.topLeft.y);

      // Bottom edge interpolation
      const bottomX = quad.bottomLeft.x + u * (quad.bottomRight.x - quad.bottomLeft.x);
      const bottomY = quad.bottomLeft.y + u * (quad.bottomRight.y - quad.bottomLeft.y);

      // Vertical interpolation between top and bottom
      samples.push({
        x: topX + v * (bottomX - topX),
        y: topY + v * (bottomY - topY),
      });
    }
  }

  return samples;
}

/**
 * Calculate the overlap ratio of sample points inside a polygon.
 */
function calculateOverlapFromSamples(samples: Offset[], hull: Offset[]): number {
  if (samples.length === 0 || hull.length < 3) return 0;

  let insideCount = 0;
  for (const point of samples) {
    if (pointInPolygon(point, hull)) {
      insideCount++;
    }
  }

  return insideCount / samples.length;
}

/**
 * Calculate overlap for a StrokeElement with a hull polygon.
 * Uses raw stroke input points directly (matching Android's pointsCoverage behavior).
 */
export function calculateStrokeOverlap(
  element: StrokeElement,
  hull: Offset[],
  _hullBounds: BoundingBox,
  _options: OverlapCalculationOptions = {}
): number {
  // Use all raw stroke points directly (matches Android's Polygon.strokeCoverage)
  // This is more accurate than sampling at fixed intervals since it respects
  // the actual point density of the stroke.
  const allPoints: Offset[] = [];

  for (const stroke of element.strokes) {
    for (const input of stroke.inputs.inputs) {
      allPoints.push({ x: input.x, y: input.y });
    }
  }

  return calculateOverlapFromSamples(allPoints, hull);
}

/**
 * Calculate overlap for a ShapeElement with a hull polygon.
 */
export function calculateShapeOverlap(
  element: ShapeElement,
  hull: Offset[],
  _hullBounds: BoundingBox,
  options: OverlapCalculationOptions = {}
): number {
  const { gridDensity = 10, sampleInterval = 5 } = options;

  // If the shape has source strokes, use those for better accuracy
  if (element.sourceStrokes && element.sourceStrokes.length > 0) {
    const allSamples: Offset[] = [];
    for (const stroke of element.sourceStrokes) {
      const samples = sampleStrokePoints(stroke, sampleInterval);
      allSamples.push(...samples);
    }
    return calculateOverlapFromSamples(allSamples, hull);
  }

  // Otherwise, use grid sampling within bounds
  const bounds = getElementBounds(element);
  if (!bounds) return 0;

  const samples = generateGridSamples(bounds, gridDensity);
  return calculateOverlapFromSamples(samples, hull);
}

/**
 * Calculate overlap for a GlyphElement with a hull polygon.
 */
export function calculateGlyphOverlap(
  element: GlyphElement,
  hull: Offset[],
  _hullBounds: BoundingBox,
  options: OverlapCalculationOptions = {}
): number {
  const { gridDensity = 10 } = options;

  const bounds = getElementBounds(element);
  if (!bounds) return 0;

  const samples = generateGridSamples(bounds, gridDensity);
  return calculateOverlapFromSamples(samples, hull);
}

/**
 * Calculate overlap for an InkTextElement with a hull polygon.
 */
export function calculateInkTextOverlap(
  element: InkTextElement,
  hull: Offset[],
  _hullBounds: BoundingBox,
  options: OverlapCalculationOptions = {}
): number {
  const { sampleInterval = 5 } = options;

  // Use source strokes for better accuracy
  if (element.sourceStrokes && element.sourceStrokes.length > 0) {
    const allSamples: Offset[] = [];
    for (const stroke of element.sourceStrokes) {
      const samples = sampleStrokePoints(stroke, sampleInterval);
      allSamples.push(...samples);
    }
    return calculateOverlapFromSamples(allSamples, hull);
  }

  // Fallback to grid sampling
  const { gridDensity = 10 } = options;
  const bounds = getElementBounds(element);
  if (!bounds) return 0;

  const samples = generateGridSamples(bounds, gridDensity);
  return calculateOverlapFromSamples(samples, hull);
}

/**
 * Calculate overlap for each token in an InkTextElement individually.
 * Returns per-token overlap information for partial erasure support.
 */
export function calculateInkTextTokenOverlaps(
  element: InkTextElement,
  hull: Offset[],
  hullBounds: BoundingBox,
  options: OverlapCalculationOptions = {}
): InkTextTokenOverlapResult {
  const { gridDensity = 10 } = options;
  const tokenOverlaps: TokenOverlapResult[] = [];

  for (let lineIndex = 0; lineIndex < element.lines.length; lineIndex++) {
    const line = element.lines[lineIndex];
    for (let tokenIndex = 0; tokenIndex < line.tokens.length; tokenIndex++) {
      const token = line.tokens[tokenIndex];

      // Quick rejection: check if token quad bbox intersects hull bbox
      const tokenBounds = quadToBoundingBox(token.quad);
      if (!boundingBoxesIntersect(tokenBounds, hullBounds)) {
        tokenOverlaps.push({
          lineIndex,
          tokenIndex,
          overlap: 0,
          token,
        });
        continue;
      }

      // Generate samples within the token's quad using bilinear interpolation
      const samples = generateQuadGridSamples(token.quad, gridDensity);
      const overlap = calculateOverlapFromSamples(samples, hull);

      tokenOverlaps.push({
        lineIndex,
        tokenIndex,
        overlap,
        token,
      });
    }
  }

  return { tokenOverlaps };
}

/**
 * Calculate overlap for a TicTacToeElement with a hull polygon.
 */
export function calculateTicTacToeOverlap(
  element: TicTacToeElement,
  hull: Offset[],
  _hullBounds: BoundingBox,
  options: OverlapCalculationOptions = {}
): number {
  const { gridDensity = 10, sampleInterval = 5 } = options;

  // Sample from grid strokes
  const allSamples: Offset[] = [];
  for (const stroke of element.gridStrokes) {
    const samples = sampleStrokePoints(stroke, sampleInterval);
    allSamples.push(...samples);
  }

  // Also sample from piece strokes in cells
  for (const cell of element.cells) {
    if (cell.pieceStrokes) {
      for (const stroke of cell.pieceStrokes) {
        const samples = sampleStrokePoints(stroke, sampleInterval);
        allSamples.push(...samples);
      }
    }
  }

  // If no stroke samples, use grid sampling
  if (allSamples.length === 0) {
    const bounds = getElementBounds(element);
    if (!bounds) return 0;
    return calculateOverlapFromSamples(generateGridSamples(bounds, gridDensity), hull);
  }

  return calculateOverlapFromSamples(allSamples, hull);
}

/**
 * Calculate overlap for a CoordinatePlaneElement with a hull polygon.
 * Uses grid sampling on the element's bounding box to calculate area coverage.
 * This enables full element deletion when the scribble covers a significant portion.
 */
export function calculateCoordinatePlaneOverlap(
  element: CoordinatePlaneElement,
  hull: Offset[],
  _hullBounds: BoundingBox,
  options: OverlapCalculationOptions = {}
): number {
  const { gridDensity = 10 } = options;

  const bounds = getElementBounds(element);
  if (!bounds) return 0;

  const samples = generateGridSamples(bounds, gridDensity);
  return calculateOverlapFromSamples(samples, hull);
}

/**
 * Calculate overlap for each plotted point and ink stroke in a CoordinatePlaneElement.
 * Points are checked for containment in the hull.
 * Ink strokes use sample-based overlap calculation.
 * The hull is in CANVAS coordinates, so we need to transform element content accordingly.
 */
export function calculateCoordinatePlaneContentOverlaps(
  element: CoordinatePlaneElement,
  hull: Offset[],
  hullBounds: BoundingBox,
  options: OverlapCalculationOptions = {}
): CoordinatePlaneContentOverlapResult {
  const { sampleInterval = 5 } = options;
  const pointOverlaps: CoordinatePlanePointOverlapResult[] = [];
  const inkOverlaps: CoordinatePlaneInkOverlapResult[] = [];

  // Get transform offsets to convert from local to canvas coordinates
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  // Check each plotted point
  for (let i = 0; i < element.points.length; i++) {
    const point = element.points[i];
    // Convert point position from local to canvas coordinates
    const canvasPos: Offset = {
      x: point.position.x + tx,
      y: point.position.y + ty,
    };

    // Quick bbox check first
    const inBounds =
      canvasPos.x >= hullBounds.left &&
      canvasPos.x <= hullBounds.right &&
      canvasPos.y >= hullBounds.top &&
      canvasPos.y <= hullBounds.bottom;

    let overlap = 0;
    if (inBounds && pointInPolygon(canvasPos, hull)) {
      overlap = 1.0;  // Point is inside the hull
    }

    pointOverlaps.push({
      pointIndex: i,
      overlap,
      point,
    });
  }

  // Check each ink stroke
  const inkStrokes = element.inkStrokes || [];
  for (let i = 0; i < inkStrokes.length; i++) {
    const relStroke = inkStrokes[i];
    const stroke = relStroke.stroke;

    // Sample points along the stroke and convert to canvas coordinates
    const samples: Offset[] = [];
    for (const input of stroke.inputs.inputs) {
      samples.push({
        x: input.x + tx,
        y: input.y + ty,
      });
    }

    // If stroke is small, also consider it at a minimum sample interval
    if (samples.length > 1) {
      const sampledPoints = sampleStrokePoints(
        {
          ...stroke,
          inputs: {
            ...stroke.inputs,
            inputs: stroke.inputs.inputs.map(inp => ({
              ...inp,
              x: inp.x + tx,
              y: inp.y + ty,
            })),
          },
        },
        sampleInterval
      );
      // Use sampled points if there are more
      if (sampledPoints.length > samples.length) {
        samples.length = 0;
        samples.push(...sampledPoints);
      }
    }

    // Calculate overlap for this stroke
    const overlap = calculateOverlapFromSamples(samples, hull);

    inkOverlaps.push({
      inkIndex: i,
      overlap,
      ink: relStroke,
    });
  }

  return { pointOverlaps, inkOverlaps };
}

/**
 * Calculate overlap for an ImageElement with a hull polygon.
 * Uses grid sampling within the image's display bounds.
 */
export function calculateImageOverlap(
  element: ImageElement,
  hull: Offset[],
  _hullBounds: BoundingBox,
  options: OverlapCalculationOptions = {}
): number {
  const { gridDensity = 10 } = options;

  const bounds = getElementBounds(element);
  if (!bounds) return 0;

  const samples = generateGridSamples(bounds, gridDensity);
  return calculateOverlapFromSamples(samples, hull);
}

/**
 * Calculate overlap for any element type with a hull polygon.
 */
export function calculateElementOverlap(
  element: Element,
  hull: Offset[],
  hullBounds: BoundingBox,
  options: OverlapCalculationOptions = {}
): number {
  // Quick bounding box pre-filter
  const elementBounds = getElementBounds(element);
  if (!elementBounds || !boundingBoxesIntersect(elementBounds, hullBounds)) {
    return 0;
  }

  switch (element.type) {
    case 'stroke':
      return calculateStrokeOverlap(element, hull, hullBounds, options);
    case 'shape':
      return calculateShapeOverlap(element, hull, hullBounds, options);
    case 'glyph':
      return calculateGlyphOverlap(element, hull, hullBounds, options);
    case 'inkText':
      return calculateInkTextOverlap(element, hull, hullBounds, options);
    case 'tictactoe':
      return calculateTicTacToeOverlap(element, hull, hullBounds, options);
    case 'coordinatePlane':
      return calculateCoordinatePlaneOverlap(element, hull, hullBounds, options);
    case 'image':
      return calculateImageOverlap(element, hull, hullBounds, options);
    case 'sketchableImage': {
      const samples = generateGridSamples(elementBounds, options.gridDensity ?? 10);
      return calculateOverlapFromSamples(samples, hull);
    }
    default: {
      const samples = generateGridSamples(elementBounds, options.gridDensity ?? 10);
      return calculateOverlapFromSamples(samples, hull);
    }
  }
}
