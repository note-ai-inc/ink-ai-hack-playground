// Shape element renderer

import type { BoundingBox, Offset } from '../../types';
import type { ShapeElement, ShapePath } from './types';
import { colorToCSSRGBA } from '../../types/brush';
import { applyMatrix } from '../../types/primitives';
import type { RenderOptions } from '../registry/ElementPlugin';

// Render a Shape element
export function render(
  ctx: CanvasRenderingContext2D,
  element: ShapeElement,
  options?: RenderOptions
): void {
  ctx.save();

  // Apply element transform
  // Matrix is column-major: [scaleX, skewX, persp0, skewY, scaleY, persp1, transX, transY, persp2]
  // Canvas2D transform expects: (a=scaleX, b=skewX, c=skewY, d=scaleY, e=transX, f=transY)
  const v = element.transform.values;
  ctx.transform(v[0], v[1], v[3], v[4], v[6], v[7]);

  const morphProgress = options?.morphProgress;

  // If animating and have source strokes, render morph animation
  if (morphProgress !== undefined && morphProgress < 1 && element.sourceStrokes && element.sourceStrokes.length > 0) {
    renderMorphAnimation(ctx, element, morphProgress);
  } else {
    // Render final shape
    for (const path of element.paths) {
      renderPath(ctx, path);
    }
  }

  ctx.restore();
}

// Render morph animation between source strokes and final shape
function renderMorphAnimation(
  ctx: CanvasRenderingContext2D,
  element: ShapeElement,
  progress: number
): void {
  const sourcePoints = extractSourcePoints(element);

  if (sourcePoints.length === 0) {
    // Fallback to final shape
    for (const path of element.paths) {
      renderPath(ctx, path);
    }
    return;
  }

  // For each source point, find the nearest point on the shape perimeter
  const targetPoints = sourcePoints.map(p =>
    findNearestPointOnPath(element.paths[0], p)
  );

  // Interpolate points - each source point moves to its nearest target
  const morphedPoints = interpolatePoints(sourcePoints, targetPoints, progress);

  // Get stroke style from the path
  const path = element.paths[0];
  const strokeColor = path.strokeColor !== undefined ? colorToCSSRGBA(path.strokeColor) : '#000000';
  const strokeWidth = path.strokeWidth ?? 2;

  // Render morphed path as a smooth curve
  ctx.beginPath();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (morphedPoints.length > 0) {
    ctx.moveTo(morphedPoints[0].x, morphedPoints[0].y);

    if (morphedPoints.length === 2) {
      ctx.lineTo(morphedPoints[1].x, morphedPoints[1].y);
    } else {
      // Use quadratic curves for smooth appearance
      for (let i = 1; i < morphedPoints.length - 1; i++) {
        const current = morphedPoints[i];
        const next = morphedPoints[i + 1];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;
        ctx.quadraticCurveTo(current.x, current.y, midX, midY);
      }
      // Connect to last point
      const last = morphedPoints[morphedPoints.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    // Close the path if nearly complete
    if (progress > 0.8) {
      ctx.closePath();
    }
  }

  ctx.stroke();
}

// Extract all points from source strokes in order
function extractSourcePoints(element: ShapeElement): Offset[] {
  const points: Offset[] = [];
  if (!element.sourceStrokes) return points;

  for (const stroke of element.sourceStrokes) {
    for (const input of stroke.inputs.inputs) {
      points.push({ x: input.x, y: input.y });
    }
  }
  return points;
}

// Sample a point on a cubic bezier curve at parameter t (0-1)
function sampleCubicBezier(p0: Offset, p1: Offset, p2: Offset, p3: Offset, t: number): Offset {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

// Sample a point on a quadratic bezier curve at parameter t (0-1)
function sampleQuadraticBezier(p0: Offset, p1: Offset, p2: Offset, t: number): Offset {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  return {
    x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
    y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y,
  };
}

// Find the nearest point on a shape path to a given point
function findNearestPointOnPath(path: ShapePath, point: Offset): Offset {
  // Sample points along the entire path, including bezier curves
  const sampledPoints: Offset[] = [];
  let currentPos: Offset = { x: 0, y: 0 };
  const SAMPLES_PER_CURVE = 16; // Number of samples per bezier curve

  for (const command of path.commands) {
    if (command.type === 'moveTo' && command.points && command.points.length >= 1) {
      currentPos = command.points[0];
      sampledPoints.push(currentPos);
    } else if (command.type === 'lineTo' && command.points && command.points.length >= 1) {
      currentPos = command.points[0];
      sampledPoints.push(currentPos);
    } else if (command.type === 'quadTo' && command.points && command.points.length >= 2) {
      const p0 = currentPos;
      const p1 = command.points[0];
      const p2 = command.points[1];
      // Sample along the quadratic bezier
      for (let i = 1; i <= SAMPLES_PER_CURVE; i++) {
        const t = i / SAMPLES_PER_CURVE;
        sampledPoints.push(sampleQuadraticBezier(p0, p1, p2, t));
      }
      currentPos = p2;
    } else if (command.type === 'cubicTo' && command.points && command.points.length >= 3) {
      const p0 = currentPos;
      const p1 = command.points[0];
      const p2 = command.points[1];
      const p3 = command.points[2];
      // Sample along the cubic bezier
      for (let i = 1; i <= SAMPLES_PER_CURVE; i++) {
        const t = i / SAMPLES_PER_CURVE;
        sampledPoints.push(sampleCubicBezier(p0, p1, p2, p3, t));
      }
      currentPos = p3;
    }
  }

  if (sampledPoints.length === 0) return point;

  let nearestPoint = sampledPoints[0];
  let nearestDistSq = Infinity;

  // Check each segment between sampled points
  for (let i = 0; i < sampledPoints.length; i++) {
    const p1 = sampledPoints[i];
    const p2 = sampledPoints[(i + 1) % sampledPoints.length];

    // Find nearest point on line segment p1-p2 to the given point
    const nearest = nearestPointOnSegment(p1, p2, point);
    const dx = point.x - nearest.x;
    const dy = point.y - nearest.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearestPoint = nearest;
    }
  }

  return nearestPoint;
}

// Find the nearest point on a line segment to a given point
function nearestPointOnSegment(p1: Offset, p2: Offset, point: Offset): Offset {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    // Segment is a point
    return p1;
  }

  // Project point onto the line, clamped to segment
  const t = Math.max(0, Math.min(1,
    ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq
  ));

  return {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };
}

// Linearly interpolate between two point arrays
function interpolatePoints(source: Offset[], target: Offset[], progress: number): Offset[] {
  const result: Offset[] = [];
  const len = Math.min(source.length, target.length);

  // Use easing function for smoother animation
  const easedProgress = easeInOutCubic(progress);

  for (let i = 0; i < len; i++) {
    result.push({
      x: source[i].x + (target[i].x - source[i].x) * easedProgress,
      y: source[i].y + (target[i].y - source[i].y) * easedProgress,
    });
  }

  return result;
}

// Cubic easing function for smooth animation
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Render a single path
function renderPath(ctx: CanvasRenderingContext2D, path: ShapePath): void {
  ctx.beginPath();

  for (const command of path.commands) {
    switch (command.type) {
      case 'moveTo':
        if (command.points && command.points.length >= 1) {
          ctx.moveTo(command.points[0].x, command.points[0].y);
        }
        break;
      case 'lineTo':
        if (command.points && command.points.length >= 1) {
          ctx.lineTo(command.points[0].x, command.points[0].y);
        }
        break;
      case 'quadTo':
        if (command.points && command.points.length >= 2) {
          ctx.quadraticCurveTo(
            command.points[0].x,
            command.points[0].y,
            command.points[1].x,
            command.points[1].y
          );
        }
        break;
      case 'cubicTo':
        if (command.points && command.points.length >= 3) {
          ctx.bezierCurveTo(
            command.points[0].x,
            command.points[0].y,
            command.points[1].x,
            command.points[1].y,
            command.points[2].x,
            command.points[2].y
          );
        }
        break;
      case 'close':
        ctx.closePath();
        break;
    }
  }

  // Fill if fill color specified
  if (path.fillColor !== undefined) {
    ctx.fillStyle = colorToCSSRGBA(path.fillColor);
    ctx.fill();
  }

  // Stroke if stroke color specified
  if (path.strokeColor !== undefined) {
    ctx.strokeStyle = colorToCSSRGBA(path.strokeColor);
    ctx.lineWidth = path.strokeWidth ?? 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

// Get bounding box for Shape element
export function getBounds(element: ShapeElement): BoundingBox | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const path of element.paths) {
    for (const command of path.commands) {
      if (command.points) {
        for (const point of command.points) {
          // Apply transform to point
          const transformed = applyMatrix(element.transform, point);
          left = Math.min(left, transformed.x);
          top = Math.min(top, transformed.y);
          right = Math.max(right, transformed.x);
          bottom = Math.max(bottom, transformed.y);
        }
      }
    }
  }

  // Also include stroke width
  const maxStrokeWidth = Math.max(
    ...element.paths.map((p) => p.strokeWidth ?? 0),
    0
  );
  const halfStroke = maxStrokeWidth / 2;

  if (!isFinite(left)) return null;

  return {
    left: left - halfStroke,
    top: top - halfStroke,
    right: right + halfStroke,
    bottom: bottom + halfStroke,
  };
}
