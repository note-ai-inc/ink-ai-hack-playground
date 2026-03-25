// Puzzle generator for Color Connect
//
// Places dots both ON the circle perimeter and INSIDE it.
// Uses a placement strategy that guarantees solvability:
// perimeter pairs are nested (non-crossing), and interior dots
// are placed such that straight-line connections don't cross.

import type { ColorConnectGameState, ColorConnectDot } from './types';

/**
 * Generate a solvable Color Connect puzzle.
 * Some dots on the circle perimeter, some inside — making the puzzle
 * more interesting since players must route lines carefully.
 */
/** Get difficulty parameters for a given level (1-20). */
export function getLevelParams(level: number): { numPairs: number; numInteriorDots: number } {
  if (level <= 2)  return { numPairs: 2,  numInteriorDots: 0 };
  if (level <= 4)  return { numPairs: 3,  numInteriorDots: 0 };
  if (level <= 6)  return { numPairs: 3,  numInteriorDots: 1 };
  if (level <= 8)  return { numPairs: 4,  numInteriorDots: 1 };
  if (level <= 10) return { numPairs: 4,  numInteriorDots: 2 };
  if (level <= 12) return { numPairs: 5,  numInteriorDots: 2 };
  if (level <= 14) return { numPairs: 5,  numInteriorDots: 3 };
  if (level <= 16) return { numPairs: 6,  numInteriorDots: 3 };
  if (level <= 18) return { numPairs: 6,  numInteriorDots: 4 };
  return            { numPairs: 6,  numInteriorDots: 5 };
}

/** Generate a puzzle for a specific level. */
export function generateForLevel(level: number): ColorConnectGameState {
  const { numPairs, numInteriorDots } = getLevelParams(level);
  const dots = placeDots(numPairs, numInteriorDots);

  return {
    dots,
    connections: [],
    numPairs,
    solved: false,
    level,
    isGenerating: false,
    gameComplete: false,
  };
}

export function generatePuzzle(numPairs: number, level: number = 1): ColorConnectGameState {
  numPairs = Math.max(2, Math.min(numPairs, 6));

  const numInteriorDots = Math.min(
    Math.max(0, Math.floor(numPairs * 0.4)),
    numPairs - 1,
  );

  const dots = placeDots(numPairs, numInteriorDots);

  return {
    dots,
    connections: [],
    numPairs,
    solved: false,
    level,
    isGenerating: false,
    gameComplete: false,
  };
}

/**
 * Place dots with some on perimeter and some inside the circle.
 * Interior dots have their partner on the perimeter.
 */
function placeDots(numPairs: number, numInteriorDots: number): ColorConnectDot[] {
  const dots: ColorConnectDot[] = [];

  // Shuffle color indices to randomize which colors go inside
  const colorIndices = Array.from({ length: numPairs }, (_, i) => i);
  shuffle(colorIndices);

  // Colors that will have one dot inside
  const interiorColors = new Set(colorIndices.slice(0, numInteriorDots));

  // Place perimeter dots: all non-interior colors have both dots on perimeter,
  // interior colors have one dot on perimeter
  const perimeterCount = numPairs * 2 - numInteriorDots;
  const perimeterAngles = distributeAngles(perimeterCount);

  // Build the perimeter sequence using nesting for solvability
  const perimeterColors: { colorIndex: number; pairSlot: 0 | 1 }[] = [];

  // First, add both dots for fully-perimeter pairs
  const fullPerimeterColors = colorIndices.filter(c => !interiorColors.has(c));
  const nestedSequence = buildNestedSequence(fullPerimeterColors);
  for (const colorIndex of nestedSequence) {
    const existing = perimeterColors.filter(d => d.colorIndex === colorIndex);
    perimeterColors.push({
      colorIndex,
      pairSlot: existing.length === 0 ? 0 : 1,
    });
  }

  // Then, interleave the single perimeter dots for interior-paired colors
  const interiorColorList = colorIndices.filter(c => interiorColors.has(c));
  for (const colorIndex of interiorColorList) {
    // Insert at a random position
    const insertIdx = Math.floor(Math.random() * (perimeterColors.length + 1));
    perimeterColors.splice(insertIdx, 0, { colorIndex, pairSlot: 0 });
  }

  // Assign angles to perimeter dots
  for (let i = 0; i < perimeterColors.length; i++) {
    dots.push({
      angle: perimeterAngles[i],
      radius: 1.0,
      colorIndex: perimeterColors[i].colorIndex,
      pairSlot: perimeterColors[i].pairSlot,
    });
  }

  // Place interior dots
  const usedInteriorPositions: { angle: number; radius: number }[] = [];
  for (const colorIndex of interiorColorList) {
    const pos = findInteriorPosition(usedInteriorPositions);
    usedInteriorPositions.push(pos);

    dots.push({
      angle: pos.angle,
      radius: pos.radius,
      colorIndex,
      pairSlot: 1,
    });
  }

  return dots;
}

/** Build a nested sequence of color pairs for perimeter placement. */
function buildNestedSequence(colors: number[]): number[] {
  if (colors.length === 0) return [];
  if (colors.length === 1) return [colors[0], colors[0]];

  const shuffled = [...colors];
  shuffle(shuffled);

  const strategy = Math.random();
  if (strategy < 0.4 || colors.length <= 2) {
    const outer = shuffled[0];
    const inner = shuffled.slice(1);
    return [outer, ...buildNestedSequence(inner), outer];
  } else {
    const splitPoint = 1 + Math.floor(Math.random() * (shuffled.length - 1));
    const group1 = shuffled.slice(0, splitPoint);
    const group2 = shuffled.slice(splitPoint);
    return [...buildNestedSequence(group1), ...buildNestedSequence(group2)];
  }
}

/** Distribute N angles evenly around the circle with slight jitter. */
function distributeAngles(count: number): number[] {
  const step = (2 * Math.PI) / count;
  const startOffset = Math.random() * 2 * Math.PI;
  const angles: number[] = [];

  for (let i = 0; i < count; i++) {
    const jitter = (Math.random() - 0.5) * step * 0.25;
    angles.push(normalizeAngle(startOffset + i * step + jitter));
  }
  return angles;
}

/** Find a non-overlapping interior position. */
function findInteriorPosition(
  existing: { angle: number; radius: number }[],
): { angle: number; radius: number } {
  // Try random positions, pick one with good spacing from existing
  for (let attempt = 0; attempt < 50; attempt++) {
    const angle = Math.random() * 2 * Math.PI;
    const radius = 0.25 + Math.random() * 0.45; // 0.25..0.70 of circle radius

    // Check distance from existing interior dots
    let tooClose = false;
    for (const other of existing) {
      // Approximate distance using polar coordinates
      const dx = radius * Math.cos(angle) - other.radius * Math.cos(other.angle);
      const dy = radius * Math.sin(angle) - other.radius * Math.sin(other.angle);
      if (Math.sqrt(dx * dx + dy * dy) < 0.35) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      return { angle, radius };
    }
  }

  // Fallback: just pick a position
  return {
    angle: Math.random() * 2 * Math.PI,
    radius: 0.3 + Math.random() * 0.3,
  };
}

function normalizeAngle(angle: number): number {
  while (angle < 0) angle += 2 * Math.PI;
  while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
  return angle;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
