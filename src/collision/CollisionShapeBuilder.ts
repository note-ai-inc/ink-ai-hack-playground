// Build CollisionPolyline shapes from elements and manage a translation cache.

import type { Offset } from '../types/primitives';
import { applyMatrix, boundingBoxFromOffsets } from '../types/primitives';
import type { Element } from '../types/elements';
import { getElementBounds } from '../elements/rendering/ElementRenderer';
import type { CollisionPolyline } from './CollisionShape';
import type { Vector2 } from '../transform/TransformOperation';

// --- Bezier sampling ---

function sampleQuadratic(p0: Offset, p1: Offset, p2: Offset, n = 4): Offset[] {
  const result: Offset[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    result.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    });
  }
  return result;
}

function sampleCubic(p0: Offset, p1: Offset, p2: Offset, p3: Offset, n = 6): Offset[] {
  const result: Offset[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    result.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return result;
}

// --- Shape builders per element type ---

function buildFromStroke(element: Extract<Element, { type: 'stroke' }>): CollisionPolyline | null {
  const allPoints: Offset[] = [];
  let maxRadius = 0;

  for (const stroke of element.strokes) {
    const inputs = stroke.inputs.inputs;
    if (inputs.length === 0) continue;

    // If there's a gap from the previous sub-stroke, leave a break marker
    // by just continuing — the segment between the last point of the previous
    // stroke and the first of this one won't cause issues since strokes in
    // a StrokeElement are typically spatially close.
    for (const input of inputs) {
      allPoints.push({ x: input.x, y: input.y });
    }
    maxRadius = Math.max(maxRadius, stroke.brush.size / 2);
  }

  if (allPoints.length < 2) return null;

  const bounds = boundingBoxFromOffsets(allPoints);
  if (!bounds) return null;

  return {
    points: allPoints,
    closed: false,
    radius: maxRadius,
    bounds,
    center: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
  };
}

function buildFromShape(element: Extract<Element, { type: 'shape' }>): CollisionPolyline | null {
  const points: Offset[] = [];
  let maxStrokeWidth = 0;
  let current: Offset = { x: 0, y: 0 };

  for (const path of element.paths) {
    maxStrokeWidth = Math.max(maxStrokeWidth, path.strokeWidth ?? 0);

    for (const cmd of path.commands) {
      const pts = cmd.points ?? [];
      switch (cmd.type) {
        case 'moveTo':
          if (pts.length >= 1) {
            current = applyMatrix(element.transform, pts[0]);
            points.push(current);
          }
          break;
        case 'lineTo':
          if (pts.length >= 1) {
            current = applyMatrix(element.transform, pts[0]);
            points.push(current);
          }
          break;
        case 'quadTo':
          if (pts.length >= 2) {
            const cp = applyMatrix(element.transform, pts[0]);
            const end = applyMatrix(element.transform, pts[1]);
            for (const sp of sampleQuadratic(current, cp, end)) {
              points.push(sp);
            }
            current = end;
          }
          break;
        case 'cubicTo':
          if (pts.length >= 3) {
            const cp1 = applyMatrix(element.transform, pts[0]);
            const cp2 = applyMatrix(element.transform, pts[1]);
            const end = applyMatrix(element.transform, pts[2]);
            for (const sp of sampleCubic(current, cp1, cp2, end)) {
              points.push(sp);
            }
            current = end;
          }
          break;
        case 'close':
          // Closing is handled by the `closed` flag
          break;
      }
    }
  }

  if (points.length < 2) return null;

  const bounds = boundingBoxFromOffsets(points);
  if (!bounds) return null;

  return {
    points,
    closed: true,
    radius: maxStrokeWidth / 2,
    bounds,
    center: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
  };
}

function buildFromImage(element: Extract<Element, { type: 'image' }>): CollisionPolyline {
  const w = element.displayWidth;
  const h = element.displayHeight;
  const corners: Offset[] = [
    applyMatrix(element.transform, { x: 0, y: 0 }),
    applyMatrix(element.transform, { x: w, y: 0 }),
    applyMatrix(element.transform, { x: w, y: h }),
    applyMatrix(element.transform, { x: 0, y: h }),
  ];
  const bounds = boundingBoxFromOffsets(corners)!;
  return {
    points: corners,
    closed: true,
    radius: 0,
    bounds,
    center: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
  };
}

function buildFromSketchableImage(element: Extract<Element, { type: 'sketchableImage' }>): CollisionPolyline {
  const w = 512 * element.scaleX;
  const h = 512 * element.scaleY;
  const corners: Offset[] = [
    applyMatrix(element.transform, { x: 0, y: 0 }),
    applyMatrix(element.transform, { x: w, y: 0 }),
    applyMatrix(element.transform, { x: w, y: h }),
    applyMatrix(element.transform, { x: 0, y: h }),
  ];
  const bounds = boundingBoxFromOffsets(corners)!;
  return {
    points: corners,
    closed: true,
    radius: 0,
    bounds,
    center: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
  };
}

function buildFromBounds(element: Element): CollisionPolyline | null {
  const b = getElementBounds(element);
  if (!b) return null;
  const corners: Offset[] = [
    { x: b.left, y: b.top },
    { x: b.right, y: b.top },
    { x: b.right, y: b.bottom },
    { x: b.left, y: b.bottom },
  ];
  return {
    points: corners,
    closed: true,
    radius: 0,
    bounds: b,
    center: { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 },
  };
}

/** Build a CollisionPolyline from any element. */
export function buildCollisionShape(element: Element): CollisionPolyline | null {
  switch (element.type) {
    case 'stroke': return buildFromStroke(element);
    case 'shape': return buildFromShape(element);
    case 'image': return buildFromImage(element);
    case 'sketchableImage': return buildFromSketchableImage(element);
    default: return buildFromBounds(element);
  }
}

/**
 * Cache for collision shapes, keyed by element ID. Supports cheap translation updates.
 *
 * Shapes are built once from the element's **original** position (via `ensureBuilt`)
 * before any physics movement begins. After that, only `translateShape` is used to
 * keep the cache in sync with physics displacements. This avoids double-counting
 * displacement when the live element state has already been moved by `onBatchTranslate`.
 */
export class CollisionShapeCache {
  private cache = new Map<string, CollisionPolyline>();

  /** Build and cache a shape from the element's current (original) position. No-op if already cached. */
  ensureBuilt(elementId: string, element: Element | null): void {
    if (this.cache.has(elementId) || !element) return;
    const shape = buildCollisionShape(element);
    if (shape) this.cache.set(elementId, shape);
  }

  /** Get a previously built shape. Returns null if not cached. */
  get(elementId: string): CollisionPolyline | null {
    return this.cache.get(elementId) ?? null;
  }

  /** Translate a cached shape in-place by a displacement vector. */
  translateShape(elementId: string, displacement: Vector2): void {
    const shape = this.cache.get(elementId);
    if (!shape) return;
    const { x: dx, y: dy } = displacement;
    for (const p of shape.points) {
      p.x += dx;
      p.y += dy;
    }
    shape.bounds = {
      left: shape.bounds.left + dx,
      top: shape.bounds.top + dy,
      right: shape.bounds.right + dx,
      bottom: shape.bounds.bottom + dy,
    };
    shape.center = { x: shape.center.x + dx, y: shape.center.y + dy };
  }

  invalidate(elementId: string): void {
    this.cache.delete(elementId);
  }

  clear(): void {
    this.cache.clear();
  }
}
