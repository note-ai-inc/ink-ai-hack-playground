// Transform operation descriptors and physics types

// --- Vector2: the core type for forces, velocities, positions ---

export interface Vector2 {
  x: number;
  y: number;
}

export const ZERO_VECTOR: Vector2 = { x: 0, y: 0 };

export function vec2(x: number, y: number): Vector2 {
  return { x, y };
}

export function vec2Add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vec2Scale(v: Vector2, s: number): Vector2 {
  return { x: v.x * s, y: v.y * s };
}

export function vec2Magnitude(v: Vector2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

// --- Physics constants ---

/** Force magnitude applied per click of a movement button (px/s with mass=1) */
export const MOVE_FORCE = 100;
