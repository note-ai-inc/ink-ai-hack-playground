// Collision shape types for polyline-based narrow-phase collision detection.

import type { Offset, BoundingBox } from '../types/primitives';
import type { Vector2 } from '../transform/TransformOperation';

/** A collision shape defined by its boundary segments. */
export interface CollisionPolyline {
  /** Ordered points defining the boundary. Adjacent points form segments. */
  points: Offset[];
  /** Whether the polyline is closed (last point connects back to first). */
  closed: boolean;
  /** Half-width for thick shapes (strokes). Segments are treated as capsules. */
  radius: number;
  /** Precomputed AABB for broad phase. */
  bounds: BoundingBox;
  /** Precomputed center for normal estimation. */
  center: Offset;
}

/** Result of narrow-phase collision test. */
export interface CollisionResult {
  colliding: boolean;
  /** Unit normal pointing from A toward B. */
  normal: Vector2;
  /** Approximate penetration depth. */
  depth: number;
}
