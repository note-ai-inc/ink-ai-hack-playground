// CoordinatePlane interaction - dot placement, axis resizing, and scribble erase
//
// COORDINATE SYSTEM:
// - Element data (origin, points, inkStrokes) are in LOCAL coordinates
// - transform.values[6,7] positions the top-left corner in canvas coords
// - Incoming stroke/point data from InkCanvas is in CANVAS coordinates
// - We convert canvas -> local for comparisons and storage

import type { Stroke, BoundingBox, Offset, Matrix } from '../../types';
import type { CoordinatePlaneElement, PlottedPoint, RelativeStroke } from './types';
import type { InteractionResult, HandleDescriptor, HandleDragPhase } from '../registry/ElementPlugin';
import { getStrokesBoundingBox } from '../registry/ElementRegistry';
import {
  isScribblePattern,
  countSelfIntersections,
  getStrokePoints,
} from '../../eraser/scribbleDetection';
import { debugLog } from '../../debug/DebugLogger';

// Interaction thresholds
const DOT_MAX_SIZE = 30; // Max width/height for a stroke to be considered a dot
const HANDLE_HIT_RADIUS = 15; // How close a stroke start must be to a handle
const MIN_AXIS_LENGTH_GRID_UNITS = 1; // Minimum axis length in grid units
const POINT_HIT_RADIUS = 12; // How close a click must be to a point to drag it

export type AxisHandle = 'xPositive' | 'xNegative' | 'yPositive' | 'yNegative';
export type PointHandle = `point-${number}`; // Handle ID for dragging points

// ============================================================================
// Coordinate Conversion Helpers
// ============================================================================

/**
 * Convert canvas coordinates to local coordinates.
 */
function canvasToLocal(element: CoordinatePlaneElement, canvasPoint: Offset): Offset {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  return {
    x: canvasPoint.x - tx,
    y: canvasPoint.y - ty,
  };
}


/**
 * Convert a stroke from canvas to local coordinates.
 */
function strokeCanvasToLocal(element: CoordinatePlaneElement, stroke: Stroke): Stroke {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  return {
    ...stroke,
    inputs: {
      ...stroke.inputs,
      inputs: stroke.inputs.inputs.map(input => ({
        ...input,
        x: input.x - tx,
        y: input.y - ty,
      })),
    },
  };
}

// ============================================================================
// Geometry Helpers
// ============================================================================

/**
 * Get the positions of all axis handles in LOCAL coordinates.
 */
function getHandlePositions(element: CoordinatePlaneElement): Record<AxisHandle, Offset> {
  const { origin, xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative } = element;

  return {
    xPositive: { x: origin.x + xAxisPositive, y: origin.y },
    xNegative: { x: origin.x - xAxisNegative, y: origin.y },
    yPositive: { x: origin.x, y: origin.y - yAxisPositive },
    yNegative: { x: origin.x, y: origin.y + yAxisNegative },
  };
}

/**
 * Calculate distance between two points.
 */
function distance(p1: Offset, p2: Offset): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if a stroke is a "dot" (small enough to be a point placement).
 */
function isDot(strokes: Stroke[]): boolean {
  const bounds = getStrokesBoundingBox(strokes);
  if (!bounds) return false;

  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;

  return width < DOT_MAX_SIZE && height < DOT_MAX_SIZE;
}

/**
 * Get the center of stroke bounds.
 */
function getStrokesCenter(strokes: Stroke[]): Offset | null {
  const bounds = getStrokesBoundingBox(strokes);
  if (!bounds) return null;

  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
}

/**
 * Convert LOCAL position to grid coordinates.
 */
function localToGrid(element: CoordinatePlaneElement, localPosition: Offset): { x: number; y: number } {
  const { origin, gridSpacing } = element;

  return {
    x: Math.round((localPosition.x - origin.x) / gridSpacing),
    y: Math.round((origin.y - localPosition.y) / gridSpacing), // Y is inverted in canvas
  };
}

/**
 * Convert grid coordinates to LOCAL position.
 */
function gridToLocal(element: CoordinatePlaneElement, gridX: number, gridY: number): Offset {
  const { origin, gridSpacing } = element;

  return {
    x: origin.x + gridX * gridSpacing,
    y: origin.y - gridY * gridSpacing, // Y is inverted in canvas
  };
}

/**
 * Check if a grid coordinate is within the current axis bounds.
 */
function isWithinBounds(element: CoordinatePlaneElement, gridX: number, gridY: number): boolean {
  const { xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative, gridSpacing } = element;

  const maxX = Math.floor(xAxisPositive / gridSpacing);
  const minX = -Math.floor(xAxisNegative / gridSpacing);
  const maxY = Math.floor(yAxisPositive / gridSpacing);
  const minY = -Math.floor(yAxisNegative / gridSpacing);

  return gridX >= minX && gridX <= maxX && gridY >= minY && gridY <= maxY;
}

/**
 * Check if a point already exists at the given grid coordinates.
 */
function pointExistsAt(element: CoordinatePlaneElement, gridX: number, gridY: number): boolean {
  return element.points.some(p => p.x === gridX && p.y === gridY);
}

// ============================================================================
// Point Placement
// ============================================================================

/**
 * Try to place a point on the grid.
 * Strokes are in CANVAS coordinates.
 */
function tryPlacePoint(
  element: CoordinatePlaneElement,
  strokes: Stroke[]
): InteractionResult | null {
  if (!isDot(strokes)) {
    return null;
  }

  const canvasCenter = getStrokesCenter(strokes);
  if (!canvasCenter) {
    return null;
  }

  // Convert to local coordinates
  const localCenter = canvasToLocal(element, canvasCenter);

  // Convert to grid coordinates (snaps to nearest intersection)
  const gridCoords = localToGrid(element, localCenter);

  debugLog.info('CoordinatePlane: trying to place point', {
    canvasX: canvasCenter.x.toFixed(0),
    canvasY: canvasCenter.y.toFixed(0),
    localX: localCenter.x.toFixed(0),
    localY: localCenter.y.toFixed(0),
    gridX: gridCoords.x,
    gridY: gridCoords.y,
  });

  // Check bounds
  if (!isWithinBounds(element, gridCoords.x, gridCoords.y)) {
    debugLog.info('CoordinatePlane: point outside bounds');
    return null;
  }

  // Check if point already exists
  if (pointExistsAt(element, gridCoords.x, gridCoords.y)) {
    debugLog.info('CoordinatePlane: point already exists at location');
    return null;
  }

  // Create new point with LOCAL position
  const localPosition = gridToLocal(element, gridCoords.x, gridCoords.y);
  const newPoint: PlottedPoint = {
    x: gridCoords.x,
    y: gridCoords.y,
    position: localPosition,
  };

  const newElement: CoordinatePlaneElement = {
    ...element,
    points: [...element.points, newPoint],
  };

  debugLog.info('CoordinatePlane: point placed', {
    gridX: gridCoords.x,
    gridY: gridCoords.y,
  });

  return {
    element: newElement,
    consumed: true,
    strokesConsumed: strokes,
  };
}

// ============================================================================
// Axis Resizing
// ============================================================================

/**
 * Check which handle (if any) the stroke starts near.
 * Strokes are in CANVAS coordinates.
 */
function getHandleAtStrokeStart(
  element: CoordinatePlaneElement,
  strokes: Stroke[]
): AxisHandle | null {
  if (strokes.length === 0) return null;

  const firstStroke = strokes[0];
  const inputs = firstStroke.inputs.inputs;
  if (inputs.length === 0) return null;

  // Convert stroke start to local coordinates
  const canvasStart: Offset = { x: inputs[0].x, y: inputs[0].y };
  const localStart = canvasToLocal(element, canvasStart);

  // Handle positions are in local coordinates
  const handles = getHandlePositions(element);

  for (const [handle, position] of Object.entries(handles) as [AxisHandle, Offset][]) {
    if (distance(localStart, position) <= HANDLE_HIT_RADIUS) {
      return handle;
    }
  }

  return null;
}

/**
 * Try to resize an axis by dragging a handle.
 * Strokes are in CANVAS coordinates.
 */
function tryResizeAxis(
  element: CoordinatePlaneElement,
  strokes: Stroke[]
): InteractionResult | null {
  const handle = getHandleAtStrokeStart(element, strokes);
  if (!handle) {
    return null;
  }

  // Get the end position of the stroke (where the user dragged to)
  const lastStroke = strokes[strokes.length - 1];
  const inputs = lastStroke.inputs.inputs;
  if (inputs.length === 0) return null;

  // Convert drag end to local coordinates
  const canvasDragEnd: Offset = { x: inputs[inputs.length - 1].x, y: inputs[inputs.length - 1].y };
  const localDragEnd = canvasToLocal(element, canvasDragEnd);

  debugLog.info('CoordinatePlane: resizing axis', {
    handle,
    canvasDragEndX: canvasDragEnd.x.toFixed(0),
    canvasDragEndY: canvasDragEnd.y.toFixed(0),
    localDragEndX: localDragEnd.x.toFixed(0),
    localDragEndY: localDragEnd.y.toFixed(0),
  });

  const minAxisLength = element.gridSpacing * MIN_AXIS_LENGTH_GRID_UNITS;

  // Use the shared axis resize logic
  return resizeAxisToPoint(element, handle, localDragEnd, minAxisLength, strokes);
}

/**
 * Resize an axis to reach a target point (in LOCAL coordinates).
 * Handles transform updates for xNegative and yPositive.
 */
function resizeAxisToPoint(
  element: CoordinatePlaneElement,
  handle: AxisHandle,
  localTargetPoint: Offset,
  minAxisLength: number,
  consumedStrokes: Stroke[]
): InteractionResult {
  let newElement = { ...element };
  let transformDx = 0;
  let transformDy = 0;

  switch (handle) {
    case 'xPositive': {
      // Dragging right end - just update xAxisPositive, no transform change
      const newLength = Math.max(minAxisLength, localTargetPoint.x - element.origin.x);
      newElement = { ...newElement, xAxisPositive: newLength };
      break;
    }

    case 'xNegative': {
      // Dragging left end - this moves the bounding box left edge
      // Calculate new length based on how far left the user dragged
      const newLength = Math.max(minAxisLength, element.origin.x - localTargetPoint.x);
      const lengthDelta = newLength - element.xAxisNegative;

      if (lengthDelta !== 0) {
        // Transform moves left by lengthDelta (negative = left)
        transformDx = -lengthDelta;
        // Origin moves right in local coords to compensate
        const newOrigin = { ...element.origin, x: element.origin.x + lengthDelta };
        // Shift all points and ink strokes right
        const shiftedPoints = element.points.map(p => ({
          ...p,
          position: { x: p.position.x + lengthDelta, y: p.position.y },
        }));
        const shiftedInkStrokes = (element.inkStrokes || []).map(rs => ({
          ...rs,
          stroke: shiftStroke(rs.stroke, lengthDelta, 0),
        }));
        const shiftedSourceStrokes = element.sourceStrokes.map(s => shiftStroke(s, lengthDelta, 0));

        newElement = {
          ...newElement,
          xAxisNegative: newLength,
          origin: newOrigin,
          points: shiftedPoints,
          inkStrokes: shiftedInkStrokes,
          sourceStrokes: shiftedSourceStrokes,
        };
      } else {
        newElement = { ...newElement, xAxisNegative: newLength };
      }
      break;
    }

    case 'yPositive': {
      // Dragging top end - this moves the bounding box top edge
      // Y is inverted: up is negative in canvas, so yPositive extends upward
      const newLength = Math.max(minAxisLength, element.origin.y - localTargetPoint.y);
      const lengthDelta = newLength - element.yAxisPositive;

      if (lengthDelta !== 0) {
        // Transform moves up by lengthDelta (negative = up)
        transformDy = -lengthDelta;
        // Origin moves down in local coords to compensate
        const newOrigin = { ...element.origin, y: element.origin.y + lengthDelta };
        // Shift all points and ink strokes down
        const shiftedPoints = element.points.map(p => ({
          ...p,
          position: { x: p.position.x, y: p.position.y + lengthDelta },
        }));
        const shiftedInkStrokes = (element.inkStrokes || []).map(rs => ({
          ...rs,
          stroke: shiftStroke(rs.stroke, 0, lengthDelta),
        }));
        const shiftedSourceStrokes = element.sourceStrokes.map(s => shiftStroke(s, 0, lengthDelta));

        newElement = {
          ...newElement,
          yAxisPositive: newLength,
          origin: newOrigin,
          points: shiftedPoints,
          inkStrokes: shiftedInkStrokes,
          sourceStrokes: shiftedSourceStrokes,
        };
      } else {
        newElement = { ...newElement, yAxisPositive: newLength };
      }
      break;
    }

    case 'yNegative': {
      // Dragging bottom end - just update yAxisNegative, no transform change
      const newLength = Math.max(minAxisLength, localTargetPoint.y - element.origin.y);
      newElement = { ...newElement, yAxisNegative: newLength };
      break;
    }
  }

  // Apply transform offset if needed
  if (transformDx !== 0 || transformDy !== 0) {
    const newTransform: Matrix = {
      values: [...element.transform.values] as [number, number, number, number, number, number, number, number, number],
    };
    newTransform.values[6] += transformDx;
    newTransform.values[7] += transformDy;
    newElement = { ...newElement, transform: newTransform };
  }

  debugLog.info('CoordinatePlane: axis resized', {
    handle,
    xAxisPositive: newElement.xAxisPositive.toFixed(0),
    xAxisNegative: newElement.xAxisNegative.toFixed(0),
    yAxisPositive: newElement.yAxisPositive.toFixed(0),
    yAxisNegative: newElement.yAxisNegative.toFixed(0),
    transformX: newElement.transform.values[6].toFixed(0),
    transformY: newElement.transform.values[7].toFixed(0),
  });

  return {
    element: newElement,
    consumed: true,
    strokesConsumed: consumedStrokes,
  };
}

/**
 * Shift a stroke by dx, dy.
 */
function shiftStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return {
    ...stroke,
    inputs: {
      ...stroke.inputs,
      inputs: stroke.inputs.inputs.map(input => ({
        ...input,
        x: input.x + dx,
        y: input.y + dy,
      })),
    },
  };
}

// ============================================================================
// Scribble Erase
// ============================================================================

/**
 * Check if an ink stroke overlaps with a bounding box (in LOCAL coordinates).
 */
function inkStrokeOverlapsBounds(relStroke: RelativeStroke, bounds: BoundingBox): boolean {
  const stroke = relStroke.stroke;
  if (stroke.inputs.inputs.length === 0) return false;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const input of stroke.inputs.inputs) {
    minX = Math.min(minX, input.x);
    minY = Math.min(minY, input.y);
    maxX = Math.max(maxX, input.x);
    maxY = Math.max(maxY, input.y);
  }

  return !(
    maxX < bounds.left ||
    minX > bounds.right ||
    maxY < bounds.top ||
    minY > bounds.bottom
  );
}

/**
 * Try to erase points and ink strokes with a scribble gesture.
 * Strokes are in CANVAS coordinates.
 */
function tryScribbleErase(
  element: CoordinatePlaneElement,
  strokes: Stroke[]
): InteractionResult | null {
  const hasPoints = element.points.length > 0;
  const hasInkStrokes = element.inkStrokes && element.inkStrokes.length > 0;

  if (!hasPoints && !hasInkStrokes) {
    return null; // Nothing to erase
  }

  // Check if it's a scribble pattern (in canvas coords - shape doesn't change)
  const allPoints = strokes.flatMap(s => getStrokePoints(s));
  if (allPoints.length < 10) {
    return null;
  }

  const selfIntersections = countSelfIntersections(strokes[0]);
  if (!isScribblePattern(allPoints, selfIntersections)) {
    return null;
  }

  // Get scribble bounding box in canvas coords, then convert to local
  const canvasScribbleBounds = getStrokesBoundingBox(strokes);
  if (!canvasScribbleBounds) {
    return null;
  }

  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const localScribbleBounds: BoundingBox = {
    left: canvasScribbleBounds.left - tx,
    top: canvasScribbleBounds.top - ty,
    right: canvasScribbleBounds.right - tx,
    bottom: canvasScribbleBounds.bottom - ty,
  };

  debugLog.info('CoordinatePlane: scribble detected for erase', {
    localLeft: localScribbleBounds.left.toFixed(0),
    localTop: localScribbleBounds.top.toFixed(0),
    localRight: localScribbleBounds.right.toFixed(0),
    localBottom: localScribbleBounds.bottom.toFixed(0),
  });

  // Find points within scribble bounds (points are in LOCAL coords)
  const pointsToRemove = element.points.filter(p => {
    return (
      p.position.x >= localScribbleBounds.left &&
      p.position.x <= localScribbleBounds.right &&
      p.position.y >= localScribbleBounds.top &&
      p.position.y <= localScribbleBounds.bottom
    );
  });

  // Find ink strokes that overlap with scribble bounds (ink strokes are in LOCAL coords)
  const inkStrokesToRemove = (element.inkStrokes || []).filter(rs =>
    inkStrokeOverlapsBounds(rs, localScribbleBounds)
  );

  if (pointsToRemove.length === 0 && inkStrokesToRemove.length === 0) {
    debugLog.info('CoordinatePlane: nothing in scribble area');
    return null;
  }

  // Remove the points and ink strokes
  const remainingPoints = element.points.filter(p => !pointsToRemove.includes(p));
  const remainingInkStrokes = (element.inkStrokes || []).filter(rs => !inkStrokesToRemove.includes(rs));

  debugLog.info('CoordinatePlane: erased content', {
    pointsRemoved: pointsToRemove.length,
    inkStrokesRemoved: inkStrokesToRemove.length,
    pointsRemaining: remainingPoints.length,
    inkStrokesRemaining: remainingInkStrokes.length,
  });

  const newElement: CoordinatePlaneElement = {
    ...element,
    points: remainingPoints,
    inkStrokes: remainingInkStrokes,
  };

  return {
    element: newElement,
    consumed: true,
    strokesConsumed: strokes,
  };
}

// ============================================================================
// Interest Check
// ============================================================================

/**
 * Check if this element is interested in handling the given strokes.
 * Stroke bounds are in CANVAS coordinates.
 */
export function isInterestedIn(
  element: CoordinatePlaneElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox
): boolean {
  // Get element bounds in CANVAS coordinates
  const bounds = getBoundsForInteraction(element);
  if (!bounds) return false;

  // Check if stroke bounds overlap with element bounds
  return !(
    strokeBounds.right < bounds.left ||
    strokeBounds.left > bounds.right ||
    strokeBounds.bottom < bounds.top ||
    strokeBounds.top > bounds.bottom
  );
}

/**
 * Get bounds for interaction checking in CANVAS coordinates.
 */
function getBoundsForInteraction(element: CoordinatePlaneElement): BoundingBox {
  const { origin, xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative, transform } = element;
  const padding = HANDLE_HIT_RADIUS;

  // Local bounds
  const localLeft = origin.x - xAxisNegative - padding;
  const localTop = origin.y - yAxisPositive - padding;
  const localRight = origin.x + xAxisPositive + padding;
  const localBottom = origin.y + yAxisNegative + padding;

  // Convert to canvas coordinates
  const tx = transform.values[6];
  const ty = transform.values[7];

  return {
    left: localLeft + tx,
    top: localTop + ty,
    right: localRight + tx,
    bottom: localBottom + ty,
  };
}

// ============================================================================
// Handle-Based Interaction (Unified API)
// ============================================================================

/**
 * Return all handles for this element.
 * Framework uses this for hit testing and rendering.
 * All positions are in CANVAS coordinates.
 */
export function getHandles(element: CoordinatePlaneElement): HandleDescriptor[] {
  const handles: HandleDescriptor[] = [];
  const { origin, xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative, transform } = element;
  const tx = transform.values[6];
  const ty = transform.values[7];

  // Axis handles (in local coords, converted to canvas)
  const axisHandles: Array<{ id: AxisHandle; localPos: Offset; cursor: string }> = [
    { id: 'xPositive', localPos: { x: origin.x + xAxisPositive, y: origin.y }, cursor: 'ew-resize' },
    { id: 'xNegative', localPos: { x: origin.x - xAxisNegative, y: origin.y }, cursor: 'ew-resize' },
    { id: 'yPositive', localPos: { x: origin.x, y: origin.y - yAxisPositive }, cursor: 'ns-resize' },
    { id: 'yNegative', localPos: { x: origin.x, y: origin.y + yAxisNegative }, cursor: 'ns-resize' },
  ];

  for (const { id, localPos, cursor } of axisHandles) {
    handles.push({
      id,
      position: { x: localPos.x + tx, y: localPos.y + ty },
      hitRadius: HANDLE_HIT_RADIUS,
      cursor,
      appearance: { shape: 'square', size: 10, fillColor: '#e0e0e0', strokeColor: '#666666' },
    });
  }

  // Plotted point handles
  for (let i = 0; i < element.points.length; i++) {
    const point = element.points[i];
    handles.push({
      id: `point-${i}` as PointHandle,
      position: { x: point.position.x + tx, y: point.position.y + ty },
      hitRadius: POINT_HIT_RADIUS,
      cursor: 'grab',
      appearance: { shape: 'circle', size: 12, fillColor: '#ff6b6b', strokeColor: '#cc0000' },
    });
  }

  return handles;
}

/**
 * Check if a handle ID is a point handle.
 */
function isPointHandle(handleId: string): handleId is PointHandle {
  return handleId.startsWith('point-');
}

/**
 * Extract point index from a point handle ID.
 */
function getPointIndex(handleId: PointHandle): number {
  return parseInt(handleId.slice(6), 10);
}

/**
 * Handle drag behavior for all lifecycle phases.
 * Input point is in CANVAS coordinates.
 */
export function onHandleDrag(
  element: CoordinatePlaneElement,
  handleId: string,
  phase: HandleDragPhase,
  canvasPoint: Offset
): CoordinatePlaneElement {
  // 'start' and 'end' phases: no special handling needed for CoordinatePlane
  if (phase === 'start' || phase === 'end') {
    return element;
  }

  // 'update' phase: apply the drag
  if (isPointHandle(handleId)) {
    return updatePointPosition(element, handleId, canvasPoint);
  } else {
    return updateAxisLength(element, handleId as AxisHandle, canvasPoint);
  }
}

/**
 * Update the position of a plotted point during drag.
 */
function updatePointPosition(
  element: CoordinatePlaneElement,
  handleId: PointHandle,
  canvasPoint: Offset
): CoordinatePlaneElement {
  const pointIndex = getPointIndex(handleId);
  if (pointIndex < 0 || pointIndex >= element.points.length) {
    return element;
  }

  // Convert to local coordinates
  const localPoint = canvasToLocal(element, canvasPoint);

  // Snap to nearest grid intersection
  const gridCoords = localToGrid(element, localPoint);

  debugLog.info('CoordinatePlane: dragging point', {
    pointIndex,
    newGridX: gridCoords.x,
    newGridY: gridCoords.y,
  });

  // Clamp to bounds
  const { xAxisPositive, xAxisNegative, yAxisPositive, yAxisNegative, gridSpacing } = element;
  const maxX = Math.floor(xAxisPositive / gridSpacing);
  const minX = -Math.floor(xAxisNegative / gridSpacing);
  const maxY = Math.floor(yAxisPositive / gridSpacing);
  const minY = -Math.floor(yAxisNegative / gridSpacing);

  const clampedX = Math.max(minX, Math.min(maxX, gridCoords.x));
  const clampedY = Math.max(minY, Math.min(maxY, gridCoords.y));

  // Check if another point already exists at this location (excluding current point)
  const collision = element.points.some((p, i) =>
    i !== pointIndex && p.x === clampedX && p.y === clampedY
  );
  if (collision) {
    // Don't allow moving to occupied position
    return element;
  }

  // Update the point position (in LOCAL coordinates)
  const newLocalPosition = gridToLocal(element, clampedX, clampedY);
  const newPoints = [...element.points];
  newPoints[pointIndex] = {
    x: clampedX,
    y: clampedY,
    position: newLocalPosition,
  };

  return { ...element, points: newPoints };
}

/**
 * Update axis length during drag.
 */
function updateAxisLength(
  element: CoordinatePlaneElement,
  handleId: AxisHandle,
  canvasPoint: Offset
): CoordinatePlaneElement {
  // Convert to local coordinates
  const localPoint = canvasToLocal(element, canvasPoint);
  const minAxisLength = element.gridSpacing * MIN_AXIS_LENGTH_GRID_UNITS;

  debugLog.info('CoordinatePlane: dragging axis', {
    handle: handleId,
    localX: localPoint.x.toFixed(0),
    localY: localPoint.y.toFixed(0),
  });

  const result = resizeAxisToPoint(element, handleId, localPoint, minAxisLength, []);
  return result.element as CoordinatePlaneElement;
}

// ============================================================================
// Ink Stroke Handling
// ============================================================================

/**
 * Convert strokes to relative strokes in LOCAL coordinates.
 */
function strokesToRelativeStrokes(
  element: CoordinatePlaneElement,
  canvasStrokes: Stroke[]
): RelativeStroke[] {
  return canvasStrokes.map(canvasStroke => {
    // Convert stroke to local coordinates
    const localStroke = strokeCanvasToLocal(element, canvasStroke);

    // Calculate the center of the stroke for the offset reference
    let centerX = 0, centerY = 0, count = 0;
    for (const input of localStroke.inputs.inputs) {
      centerX += input.x;
      centerY += input.y;
      count++;
    }
    if (count > 0) {
      centerX /= count;
      centerY /= count;
    }

    return {
      stroke: localStroke,
      originOffset: {
        x: centerX - element.origin.x,
        y: centerY - element.origin.y,
      },
    };
  });
}

/**
 * Add ink strokes to the coordinate plane.
 * Input strokes are in CANVAS coordinates.
 */
function addInkStrokes(
  element: CoordinatePlaneElement,
  strokes: Stroke[]
): InteractionResult {
  const relativeStrokes = strokesToRelativeStrokes(element, strokes);

  debugLog.info('CoordinatePlane: adding ink strokes', {
    count: strokes.length,
    totalInkStrokes: (element.inkStrokes?.length || 0) + relativeStrokes.length,
  });

  const newElement: CoordinatePlaneElement = {
    ...element,
    inkStrokes: [...(element.inkStrokes || []), ...relativeStrokes],
  };

  return {
    element: newElement,
    consumed: true,
    strokesConsumed: strokes,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Accept ink input and update the element.
 * Input strokes are in CANVAS coordinates.
 */
export async function acceptInk(
  element: CoordinatePlaneElement,
  strokes: Stroke[]
): Promise<InteractionResult> {
  debugLog.info('CoordinatePlane acceptInk', { strokeCount: strokes.length });

  // Try interactions in priority order:

  // 1. Axis handle drag (check first since it's based on stroke start position)
  const resizeResult = tryResizeAxis(element, strokes);
  if (resizeResult) {
    return resizeResult;
  }

  // 2. Dot placement (small stroke = place a point)
  const dotResult = tryPlacePoint(element, strokes);
  if (dotResult) {
    return dotResult;
  }

  // 3. Scribble erase (zigzag pattern = erase points/ink)
  const eraseResult = tryScribbleErase(element, strokes);
  if (eraseResult) {
    return eraseResult;
  }

  // 4. Accept as ink drawing (function curves, annotations, etc.)
  return addInkStrokes(element, strokes);
}
