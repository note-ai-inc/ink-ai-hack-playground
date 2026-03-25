// Game state logic for Color Connect
//
// Pure functions: dot positions, nearest-dot lookup, connection management,
// segment intersection / crossing detection, and solve checking.

import type { ColorConnectGameState, ColorConnectDot } from './types';

/** Convert a dot's polar position to local (x, y) coordinates. */
export function getDotPosition(
  dot: ColorConnectDot,
  centerX: number,
  centerY: number,
  circleRadius: number,
): { x: number; y: number } {
  const r = circleRadius * dot.radius;
  return {
    x: centerX + r * Math.cos(dot.angle),
    y: centerY + r * Math.sin(dot.angle),
  };
}

/** Find the index of the nearest dot to a point, within maxDistance. */
export function findNearestDot(
  state: ColorConnectGameState,
  localX: number,
  localY: number,
  centerX: number,
  centerY: number,
  radius: number,
  maxDistance: number,
): number | null {
  let nearestIdx: number | null = null;
  let nearestDist = maxDistance;

  for (let i = 0; i < state.dots.length; i++) {
    const pos = getDotPosition(state.dots[i], centerX, centerY, radius);
    const dist = Math.sqrt((localX - pos.x) ** 2 + (localY - pos.y) ** 2);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  }

  return nearestIdx;
}

/** Add or replace a connection for the given color. Returns a new state. */
export function addConnection(
  state: ColorConnectGameState,
  colorIndex: number,
  points: { x: number; y: number }[],
  centerX: number,
  centerY: number,
  circleRadius: number,
  outOfBounds: boolean = false,
): ColorConnectGameState {
  const connections = state.connections.filter(c => c.colorIndex !== colorIndex);
  connections.push({ colorIndex, points, outOfBounds: outOfBounds || undefined });

  const newState: ColorConnectGameState = {
    ...state,
    connections,
  };
  newState.solved = checkSolvedFull(newState, centerX, centerY, circleRadius);
  return newState;
}

/** Remove a connection for a color. */
export function removeConnection(
  state: ColorConnectGameState,
  colorIndex: number,
): ColorConnectGameState {
  return {
    ...state,
    connections: state.connections.filter(c => c.colorIndex !== colorIndex),
    solved: false,
  };
}

/** Check if two line segments (p1-p2) and (p3-p4) intersect. */
export function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Collinear cases
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;

  return false;
}

function cross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  return (
    Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y)
  );
}

/** Check if two polyline paths intersect. Skips shared endpoints. */
export function pathsIntersect(
  pathA: { x: number; y: number }[],
  pathB: { x: number; y: number }[],
): boolean {
  if (pathA.length < 2 || pathB.length < 2) return false;

  for (let i = 0; i < pathA.length - 1; i++) {
    for (let j = 0; j < pathB.length - 1; j++) {
      // Skip if segments share an endpoint (near dots)
      if (pointsNear(pathA[i], pathB[j], 3) || pointsNear(pathA[i], pathB[j + 1], 3) ||
          pointsNear(pathA[i + 1], pathB[j], 3) || pointsNear(pathA[i + 1], pathB[j + 1], 3)) {
        continue;
      }
      if (segmentsIntersect(pathA[i], pathA[i + 1], pathB[j], pathB[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

function pointsNear(a: { x: number; y: number }, b: { x: number; y: number }, threshold: number): boolean {
  return Math.abs(a.x - b.x) < threshold && Math.abs(a.y - b.y) < threshold;
}

/** Check if a path goes outside the circle boundary. */
export function pathExitsCircle(
  points: { x: number; y: number }[],
  centerX: number,
  centerY: number,
  circleRadius: number,
): boolean {
  // Generous tolerance — dots sit on the perimeter so lines naturally
  // curve slightly outside; only flag clearly-outside paths
  const limit = circleRadius + 20;
  for (const p of points) {
    const dx = p.x - centerX;
    const dy = p.y - centerY;
    if (dx * dx + dy * dy > limit * limit) {
      return true;
    }
  }
  return false;
}

/** Check if any pair of connections cross each other. */
export function hasAnyCrossings(state: ColorConnectGameState): boolean {
  const conns = state.connections;
  for (let i = 0; i < conns.length; i++) {
    for (let j = i + 1; j < conns.length; j++) {
      if (pathsIntersect(conns[i].points, conns[j].points)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get the set of color indices that have invalid connections
 * (crossing other lines OR going outside the circle).
 */
export function getInvalidColors(
  state: ColorConnectGameState,
  centerX: number,
  centerY: number,
  circleRadius: number,
): Set<number> {
  const invalid = new Set<number>();
  const conns = state.connections;

  // Check crossings
  for (let i = 0; i < conns.length; i++) {
    for (let j = i + 1; j < conns.length; j++) {
      if (pathsIntersect(conns[i].points, conns[j].points)) {
        invalid.add(conns[i].colorIndex);
        invalid.add(conns[j].colorIndex);
      }
    }
  }

  // Check outside-circle violations
  for (const conn of conns) {
    if (conn.outOfBounds || pathExitsCircle(conn.points, centerX, centerY, circleRadius)) {
      invalid.add(conn.colorIndex);
    }
  }

  return invalid;
}

/** Check if the puzzle is solved: all pairs connected, no crossings, all inside circle. */
export function checkSolved(state: ColorConnectGameState): boolean {
  if (state.connections.length !== state.numPairs) return false;
  if (hasAnyCrossings(state)) return false;
  return true;
}

/** Full solve check including circle boundary (needs layout info). */
export function checkSolvedFull(
  state: ColorConnectGameState,
  centerX: number,
  centerY: number,
  circleRadius: number,
): boolean {
  if (state.connections.length !== state.numPairs) return false;
  if (hasAnyCrossings(state)) return false;
  for (const conn of state.connections) {
    if (conn.outOfBounds) return false;
    if (pathExitsCircle(conn.points, centerX, centerY, circleRadius)) return false;
  }
  return true;
}

/** Simplify a path by keeping every Nth point. */
export function simplifyPath(
  points: { x: number; y: number }[],
  maxPoints: number = 40,
): { x: number; y: number }[] {
  if (points.length <= maxPoints) return points;

  const step = (points.length - 1) / (maxPoints - 1);
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]); // always include last
  return result;
}

/** Create a state that signals the hook to generate the next level. */
export function requestNextLevel(state: ColorConnectGameState): ColorConnectGameState {
  return {
    ...state,
    isGenerating: true,
  };
}

/** Reset button area bounds (top-right corner, local coordinates). */
export const RESET_BUTTON = { x: -50, y: 2, size: 40 };

/** Check if a local point is inside the reset button area. */
export function isInResetButton(localX: number, localY: number, elementWidth: number): boolean {
  const bx = elementWidth + RESET_BUTTON.x;
  const by = RESET_BUTTON.y;
  const s = RESET_BUTTON.size;
  return localX >= bx && localX <= bx + s && localY >= by && localY <= by + s;
}

/** Get the layout parameters for the circle within the element. */
export function getCircleLayout(width: number, height: number): {
  centerX: number;
  centerY: number;
  radius: number;
} {
  const padding = 30;
  const titleSpace = 35;
  const availWidth = width - padding * 2;
  const availHeight = height - padding - titleSpace - padding;
  const radius = Math.min(availWidth, availHeight) / 2 * 0.88;
  return {
    centerX: width / 2,
    centerY: titleSpace + padding + availHeight / 2,
    radius,
  };
}
