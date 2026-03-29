// Polyline-based narrow-phase collision detection.
//
// Tests collision between two CollisionPolyline shapes using segment-to-segment
// distance (capsule model) and polygon containment for closed shapes.

import type { Offset } from '../types/primitives';
import { boundingBoxesIntersect } from '../types/primitives';
import type { Vector2 } from '../transform/TransformOperation';
import { pointInPolygon } from '../geometry/polygon';
import type { CollisionPolyline, CollisionResult } from './CollisionShape';

const NO_COLLISION: CollisionResult = { colliding: false, normal: { x: 0, y: 0 }, depth: 0 };

/** Minimum distance between two line segments and the closest points on each. */
function segmentToSegmentDistance(
  p1: Offset, p2: Offset, p3: Offset, p4: Offset
): { distance: number; closestOnA: Offset; closestOnB: Offset } {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const rx = p1.x - p3.x, ry = p1.y - p3.y;

  const a = d1x * d1x + d1y * d1y; // |d1|^2
  const e = d2x * d2x + d2y * d2y; // |d2|^2
  const f = d2x * rx + d2y * ry;

  const EPSILON = 1e-8;

  let s: number, t: number;

  if (a <= EPSILON && e <= EPSILON) {
    // Both segments degenerate to points
    s = 0; t = 0;
  } else if (a <= EPSILON) {
    // First segment degenerates to a point
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= EPSILON) {
      // Second segment degenerates to a point
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;

      if (denom !== 0) {
        s = Math.max(0, Math.min(1, (b * f - c * e) / denom));
      } else {
        s = 0;
      }

      t = (b * s + f) / e;

      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }

  const closestOnA: Offset = { x: p1.x + d1x * s, y: p1.y + d1y * s };
  const closestOnB: Offset = { x: p3.x + d2x * t, y: p3.y + d2y * t };
  const dx = closestOnA.x - closestOnB.x;
  const dy = closestOnA.y - closestOnB.y;

  return { distance: Math.sqrt(dx * dx + dy * dy), closestOnA, closestOnB };
}

/**
 * Test collision between two polyline shapes.
 *
 * Uses capsule model: each segment has a radius (half stroke width).
 * Two shapes collide if the minimum distance between any pair of segments
 * is less than the sum of their radii.
 *
 * For closed polylines, also checks polygon containment.
 */
export function testPolylineCollision(a: CollisionPolyline, b: CollisionPolyline): CollisionResult {
  // Broad phase: expanded AABB check (account for radii)
  const expandedA = {
    left: a.bounds.left - a.radius,
    top: a.bounds.top - a.radius,
    right: a.bounds.right + a.radius,
    bottom: a.bounds.bottom + a.radius,
  };
  const expandedB = {
    left: b.bounds.left - b.radius,
    top: b.bounds.top - b.radius,
    right: b.bounds.right + b.radius,
    bottom: b.bounds.bottom + b.radius,
  };
  if (!boundingBoxesIntersect(expandedA, expandedB)) return NO_COLLISION;

  const combinedRadius = a.radius + b.radius;
  let minDist = Infinity;
  let bestClosestOnA: Offset = a.center;
  let bestClosestOnB: Offset = b.center;

  const aSegCount = a.closed ? a.points.length : a.points.length - 1;
  const bSegCount = b.closed ? b.points.length : b.points.length - 1;

  // Segment-to-segment distance tests
  for (let i = 0; i < aSegCount; i++) {
    const ai0 = a.points[i];
    const ai1 = a.points[(i + 1) % a.points.length];

    for (let j = 0; j < bSegCount; j++) {
      const bj0 = b.points[j];
      const bj1 = b.points[(j + 1) % b.points.length];

      const { distance, closestOnA, closestOnB } = segmentToSegmentDistance(ai0, ai1, bj0, bj1);
      if (distance < minDist) {
        minDist = distance;
        bestClosestOnA = closestOnA;
        bestClosestOnB = closestOnB;
      }
    }
  }

  // Check capsule collision
  if (minDist <= combinedRadius) {
    return buildResult(bestClosestOnA, bestClosestOnB, a.center, b.center, combinedRadius - minDist);
  }

  // Containment check for closed polygons (one shape entirely inside another)
  if (a.closed && b.closed && a.points.length >= 3 && b.points.length >= 3) {
    if (pointInPolygon(a.points[0], b.points) || pointInPolygon(b.points[0], a.points)) {
      // One is inside the other — use center-to-center for normal
      const dx = b.center.x - a.center.x;
      const dy = b.center.y - a.center.y;
      const mag = Math.sqrt(dx * dx + dy * dy);
      const normal: Vector2 = mag > 1e-8
        ? { x: dx / mag, y: dy / mag }
        : { x: 1, y: 0 };
      // Estimate depth as half the smaller shape's extent
      const aExtent = Math.min(a.bounds.right - a.bounds.left, a.bounds.bottom - a.bounds.top);
      const bExtent = Math.min(b.bounds.right - b.bounds.left, b.bounds.bottom - b.bounds.top);
      return { colliding: true, normal, depth: Math.min(aExtent, bExtent) / 2 };
    }
  }

  return NO_COLLISION;
}

function buildResult(
  closestOnA: Offset, closestOnB: Offset,
  centerA: Offset, centerB: Offset,
  depth: number
): CollisionResult {
  let dx = closestOnB.x - closestOnA.x;
  let dy = closestOnB.y - closestOnA.y;
  let mag = Math.sqrt(dx * dx + dy * dy);

  if (mag < 1e-8) {
    // Points are coincident — fall back to center-to-center
    dx = centerB.x - centerA.x;
    dy = centerB.y - centerA.y;
    mag = Math.sqrt(dx * dx + dy * dy);
    if (mag < 1e-8) {
      return { colliding: true, normal: { x: 1, y: 0 }, depth };
    }
  }

  return {
    colliding: true,
    normal: { x: dx / mag, y: dy / mag },
    depth: Math.max(depth, 0.1),
  };
}
