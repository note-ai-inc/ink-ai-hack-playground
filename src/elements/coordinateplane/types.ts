// CoordinatePlaneElement: Interactive coordinate plane
//
// Coordinate system:
// - transform.values[6,7] positions the top-left corner of the bounding box in canvas coords
// - All internal coordinates (origin, points, strokes) are in LOCAL space relative to transform
// - Local (0,0) is at the top-left corner of the element's bounding box
// - To convert local to canvas: canvasX = localX + transform.values[6]

import type { Offset, Matrix } from '../../types/primitives';
import { generateId } from '../../types/primitives';
import type { TransformableElement } from '../../types/primitives';
import type { Stroke } from '../../types/brush';

export interface PlottedPoint {
  x: number;                // Grid coordinate (-5, -4, ..., 4, 5)
  y: number;                // Grid coordinate (-5, -4, ..., 4, 5)
  position: Offset;         // Position in LOCAL coordinates (relative to element's top-left)
}

// Ink stroke stored in the coordinate plane's local coordinate system
export interface RelativeStroke {
  stroke: Stroke;           // Stroke with inputs in LOCAL coordinates
  originOffset: Offset;     // Offset from plane origin when stroke was drawn (for reference)
}

export interface CoordinatePlaneElement extends TransformableElement {
  type: 'coordinatePlane';
  origin: Offset;           // Where axes intersect in LOCAL coordinates (relative to top-left)

  // Axis lengths in each direction from origin
  xAxisPositive: number;    // Length extending right (+X)
  xAxisNegative: number;    // Length extending left (-X)
  yAxisPositive: number;    // Length extending up (+Y)
  yAxisNegative: number;    // Length extending down (-Y)

  gridSpacing: number;      // Distance between grid lines
  gridCount: number;        // Number of grid divisions per direction (default 5)
  points: PlottedPoint[];   // User-plotted points (in LOCAL coordinates)
  sourceStrokes: Stroke[];  // Original arrow strokes (in LOCAL coordinates)
  inkStrokes: RelativeStroke[];  // User-drawn ink (in LOCAL coordinates)
}
/**
 * Create a CoordinatePlaneElement with proper transform-based positioning.
 *
 * The function computes the bounding box, sets transform to the top-left corner,
 * and converts all coordinates to LOCAL space.
 */
export function createCoordinatePlaneElement(
  canvasOrigin: Offset,
  xAxisPositive: number,
  xAxisNegative: number,
  yAxisPositive: number,
  yAxisNegative: number,
  gridSpacing: number,
  gridCount: number,
  canvasSourceStrokes: Stroke[],
  id?: string
): CoordinatePlaneElement {
  const padding = 30;
  const topLeftX = canvasOrigin.x - xAxisNegative - padding;
  const topLeftY = canvasOrigin.y - yAxisPositive - padding;

  const transform: Matrix = {
    values: [1, 0, 0, 0, 1, 0, topLeftX, topLeftY, 1],
  };

  const localOrigin: Offset = {
    x: canvasOrigin.x - topLeftX,
    y: canvasOrigin.y - topLeftY,
  };

  const localSourceStrokes = canvasSourceStrokes.map(stroke => ({
    ...stroke,
    inputs: {
      ...stroke.inputs,
      inputs: stroke.inputs.inputs.map(input => ({
        ...input,
        x: input.x - topLeftX,
        y: input.y - topLeftY,
      })),
    },
  }));

  return {
    type: 'coordinatePlane',
    id: id ?? generateId(),
    transform,
    origin: localOrigin,
    xAxisPositive,
    xAxisNegative,
    yAxisPositive,
    yAxisNegative,
    gridSpacing,
    gridCount,
    points: [],
    sourceStrokes: localSourceStrokes,
    inkStrokes: [],
  };
}
