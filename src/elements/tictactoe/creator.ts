// TicTacToe creator - recognizes "#" pattern and creates playable game

import type { Stroke } from '../../types';
import type { Offset } from '../../types/primitives';
import type { TicTacToeCell } from './types';
import {
  TicTacToePiece,
  createEmptyTicTacToeElement,
} from './types';
import { getStrokeBoundingBox } from '../../types/brush';
import type { CreationContext, CreationResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import { getRecognitionService } from '../../recognition/RecognitionService';
import { debugLog } from '../../debug/DebugLogger';
import type { Line } from '../../geometry/lineIntersection';
import { lineSegmentIntersection, lineAngle } from '../../geometry/lineIntersection';

// Validation constants
const MIN_STROKES = 4;
const MAX_STROKES = 4;
const MIN_SIZE = 100; // Minimum dimension in pixels
const MAX_SIZE = 400; // Maximum dimension in pixels
const MIN_ASPECT_RATIO = 0.7;
const MAX_ASPECT_RATIO = 1.43;

// Angle thresholds for determining line orientation (in radians)
const HORIZONTAL_THRESHOLD = Math.PI / 6; // 30 degrees from horizontal
const VERTICAL_THRESHOLD = Math.PI / 6; // 30 degrees from vertical

interface StrokeLine {
  stroke: Stroke;
  line: Line;
  angle: number;
  isHorizontal: boolean;
  isVertical: boolean;
}

/**
 * Convert a stroke to a line (start to end point).
 */
function strokeToLine(stroke: Stroke): Line | null {
  const inputs = stroke.inputs.inputs;
  if (inputs.length < 2) return null;

  return {
    start: { x: inputs[0].x, y: inputs[0].y },
    end: { x: inputs[inputs.length - 1].x, y: inputs[inputs.length - 1].y },
  };
}

/**
 * Classify stroke as horizontal or vertical line.
 */
function classifyStrokeLine(stroke: Stroke): StrokeLine | null {
  const line = strokeToLine(stroke);
  if (!line) return null;

  const angle = lineAngle(line);
  const normalizedAngle = Math.abs(angle);

  // Check if horizontal (angle close to 0 or PI)
  const isHorizontal =
    normalizedAngle < HORIZONTAL_THRESHOLD ||
    Math.abs(normalizedAngle - Math.PI) < HORIZONTAL_THRESHOLD;

  // Check if vertical (angle close to PI/2 or -PI/2)
  const isVertical =
    Math.abs(normalizedAngle - Math.PI / 2) < VERTICAL_THRESHOLD ||
    Math.abs(normalizedAngle + Math.PI / 2) < VERTICAL_THRESHOLD;

  return { stroke, line, angle, isHorizontal, isVertical };
}

/**
 * Find the 4 intersection points of a "#" grid (2 horizontal lines + 2 vertical lines).
 * Returns intersections in sorted order: top-left, top-right, bottom-left, bottom-right.
 */
function findGridIntersections(
  horizontalLines: StrokeLine[],
  verticalLines: StrokeLine[]
): [Offset, Offset, Offset, Offset] | null {
  if (horizontalLines.length !== 2 || verticalLines.length !== 2) {
    return null;
  }

  const intersections: Offset[] = [];

  // Find all 4 intersections
  for (const hLine of horizontalLines) {
    for (const vLine of verticalLines) {
      const result = lineSegmentIntersection(hLine.line, vLine.line);
      if (result) {
        intersections.push(result.point);
      }
    }
  }

  if (intersections.length !== 4) {
    return null;
  }

  // Sort intersections: first by Y (top to bottom), then by X (left to right)
  intersections.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 10) return yDiff; // Threshold for "same row"
    return a.x - b.x;
  });

  // Now we have: [topLeft, topRight, bottomLeft, bottomRight] or similar
  // Let's ensure proper ordering
  const topRow = intersections.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomRow = intersections.slice(2, 4).sort((a, b) => a.x - b.x);

  return [topRow[0], topRow[1], bottomRow[0], bottomRow[1]];
}

/**
 * Create the 9 cells of a TicTacToe grid from 4 intersection points.
 * The cells are arranged as:
 *   0 | 1 | 2
 *   ---------
 *   3 | 4 | 5
 *   ---------
 *   6 | 7 | 8
 */
function createCellsFromIntersections(
  intersections: [Offset, Offset, Offset, Offset],
  horizontalLines: StrokeLine[],
  verticalLines: StrokeLine[]
): TicTacToeCell[] {
  const [topLeft, topRight, bottomLeft, bottomRight] = intersections;

  // Get grid bounds from the lines
  const allPoints = [
    ...horizontalLines.flatMap((l) => [l.line.start, l.line.end]),
    ...verticalLines.flatMap((l) => [l.line.start, l.line.end]),
  ];

  const minX = Math.min(...allPoints.map((p) => p.x));
  const maxX = Math.max(...allPoints.map((p) => p.x));
  const minY = Math.min(...allPoints.map((p) => p.y));
  const maxY = Math.max(...allPoints.map((p) => p.y));

  // Create corners for the grid
  const gridTopLeft: Offset = { x: minX, y: minY };
  const gridTopRight: Offset = { x: maxX, y: minY };
  const gridBottomLeft: Offset = { x: minX, y: maxY };
  const gridBottomRight: Offset = { x: maxX, y: maxY };

  // Create 9 cells
  const cells: TicTacToeCell[] = [];

  // Row 0: cells 0, 1, 2
  cells.push(createCell(gridTopLeft, { x: topLeft.x, y: minY }, topLeft, { x: minX, y: topLeft.y }));
  cells.push(createCell({ x: topLeft.x, y: minY }, { x: topRight.x, y: minY }, topRight, topLeft));
  cells.push(createCell({ x: topRight.x, y: minY }, gridTopRight, { x: maxX, y: topRight.y }, topRight));

  // Row 1: cells 3, 4, 5
  cells.push(createCell({ x: minX, y: topLeft.y }, topLeft, bottomLeft, { x: minX, y: bottomLeft.y }));
  cells.push(createCell(topLeft, topRight, bottomRight, bottomLeft));
  cells.push(createCell(topRight, { x: maxX, y: topRight.y }, { x: maxX, y: bottomRight.y }, bottomRight));

  // Row 2: cells 6, 7, 8
  cells.push(createCell({ x: minX, y: bottomLeft.y }, bottomLeft, { x: bottomLeft.x, y: maxY }, gridBottomLeft));
  cells.push(createCell(bottomLeft, bottomRight, { x: bottomRight.x, y: maxY }, { x: bottomLeft.x, y: maxY }));
  cells.push(createCell(bottomRight, { x: maxX, y: bottomRight.y }, gridBottomRight, { x: bottomRight.x, y: maxY }));

  return cells;
}

function createCell(topLeft: Offset, topRight: Offset, bottomRight: Offset, bottomLeft: Offset): TicTacToeCell {
  return {
    quad: { topLeft, topRight, bottomRight, bottomLeft },
    piece: TicTacToePiece.EMPTY,
  };
}

/**
 * Validate the overall bounds of the strokes for a TicTacToe grid.
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
  const aspectRatio = width / height;

  const valid =
    width >= MIN_SIZE &&
    width <= MAX_SIZE &&
    height >= MIN_SIZE &&
    height <= MAX_SIZE &&
    aspectRatio >= MIN_ASPECT_RATIO &&
    aspectRatio <= MAX_ASPECT_RATIO;

  return { valid, width, height };
}

/**
 * Try all possible ways to pair 4 lines into 2 groups of 2,
 * and find valid intersections.
 */
function tryAllPairings(strokeLines: StrokeLine[]): [Offset, Offset, Offset, Offset] | null {
  // Generate all ways to split 4 items into 2 groups of 2
  const pairings = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];

  for (const pairing of pairings) {
    const group1 = pairing[0].map((i) => strokeLines[i]);
    const group2 = pairing[1].map((i) => strokeLines[i]);

    const intersections = findGridIntersections(group1, group2);
    if (intersections) {
      return intersections;
    }

    // Try swapped
    const intersections2 = findGridIntersections(group2, group1);
    if (intersections2) {
      return intersections2;
    }
  }

  return null;
}

/**
 * Attempt to recognize the strokes using the recognition service.
 */
async function tryRecognition(strokes: Stroke[]): Promise<HandwritingRecognitionResult | null> {
  try {
    const service = getRecognitionService();
    return await service.recognizeGoogle(strokes);
  } catch {
    // Recognition not available - continue without it
    return null;
  }
}

/**
 * Check if recognition result indicates a "#" symbol.
 */
function isHashSymbol(result: HandwritingRecognitionResult): boolean {
  const text = result.rawText.trim().toLowerCase();
  return text === '#' || text === '＃'; // Include full-width hash
}

/**
 * Check if this creator can potentially create a TicTacToe from these strokes.
 */
export function canCreate(strokes: Stroke[]): boolean {
  // Quick check: must have exactly 4 strokes
  if (strokes.length < MIN_STROKES || strokes.length > MAX_STROKES) {
    debugLog.info('TicTacToe canCreate: wrong stroke count', { count: strokes.length, required: 4 });
    return false;
  }

  // Check bounds
  const { valid, width, height } = validateBounds(strokes);
  if (!valid) {
    debugLog.info('TicTacToe canCreate: invalid bounds', { width: Math.round(width), height: Math.round(height), minSize: MIN_SIZE, maxSize: MAX_SIZE });
  }
  return valid;
}

/**
 * Create a TicTacToe element from strokes.
 */
export async function createFromInk(
  strokes: Stroke[],
  _context: CreationContext,
  recognitionResult?: HandwritingRecognitionResult
): Promise<CreationResult | null> {
  debugLog.info('TicTacToe createFromInk', { strokeCount: strokes.length });

  // Validate stroke count
  if (strokes.length !== 4) {
    debugLog.warn('TicTacToe: wrong stroke count', { count: strokes.length });
    return null;
  }

  // Validate bounds
  const { valid, width, height } = validateBounds(strokes);
  if (!valid) {
    debugLog.warn('TicTacToe: invalid bounds', { width: Math.round(width), height: Math.round(height) });
    return null;
  }

  // Classify each stroke as horizontal or vertical
  const strokeLines = strokes
    .map(classifyStrokeLine)
    .filter((sl): sl is StrokeLine => sl !== null);

  if (strokeLines.length !== 4) {
    debugLog.warn('TicTacToe: could not classify all strokes as lines');
    return null;
  }

  const horizontalLines = strokeLines.filter((sl) => sl.isHorizontal);
  const verticalLines = strokeLines.filter((sl) => sl.isVertical);

  debugLog.info('TicTacToe: line classification', { horizontal: horizontalLines.length, vertical: verticalLines.length });

  // Must have exactly 2 horizontal and 2 vertical lines
  if (horizontalLines.length !== 2 || verticalLines.length !== 2) {
    // Could be slightly angled - try recognition to confirm "#"
    debugLog.info('TicTacToe: not 2+2 lines, trying recognition');
    const result = recognitionResult || await tryRecognition(strokes);
    if (!result || !isHashSymbol(result)) {
      debugLog.warn('TicTacToe: recognition did not confirm hash', { rawText: result?.rawText });
      return null;
    }
  }

  // Try to find 4 intersection points
  // If we don't have clear horizontal/vertical separation, try all combinations
  let intersections: [Offset, Offset, Offset, Offset] | null = null;

  if (horizontalLines.length === 2 && verticalLines.length === 2) {
    intersections = findGridIntersections(horizontalLines, verticalLines);
  }

  if (!intersections) {
    // Try all possible 2x2 pairings
    debugLog.info('TicTacToe: trying all pairings for intersections');
    intersections = tryAllPairings(strokeLines);
  }

  if (!intersections) {
    debugLog.warn('TicTacToe: could not find 4 intersections');
    return null;
  }

  debugLog.info('TicTacToe: found intersections');

  // Recognition is optional - geometric detection is sufficient
  // We only use recognition as a hint, not a hard requirement
  let confidence = 0.9;
  if (!recognitionResult) {
    const result = await tryRecognition(strokes);
    if (result && isHashSymbol(result)) {
      // Recognition confirms "#" - boost confidence
      confidence = 0.95;
      debugLog.info('TicTacToe: recognition confirmed hash');
    } else if (result && result.rawText.trim()) {
      // Recognition returned something else - slightly lower confidence but don't reject
      confidence = 0.8;
      debugLog.info('TicTacToe: recognition returned non-hash, proceeding with geometric detection', { rawText: result?.rawText });
    }
  }

  // Create the cells
  const cells = createCellsFromIntersections(
    intersections,
    horizontalLines.length === 2 ? horizontalLines : strokeLines.slice(0, 2),
    verticalLines.length === 2 ? verticalLines : strokeLines.slice(2, 4)
  );

  const element = createEmptyTicTacToeElement(strokes, intersections, cells);

  return {
    elements: [element],
    consumedStrokes: strokes,
    confidence,
  };
}
