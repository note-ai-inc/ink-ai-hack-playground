// Tango game logic — pure functions for puzzle generation, validation, and solving

import type { TangoSymbol, TangoConstraint, TangoGameState } from './types';

export function cellIndex(size: number, row: number, col: number): number {
  return row * size + col;
}

export function rowOf(size: number, index: number): number {
  return Math.floor(index / size);
}

export function colOf(size: number, index: number): number {
  return index % size;
}

/** Check if the puzzle is fully and correctly solved */
export function isSolved(state: TangoGameState): boolean {
  const { size, grid, solution } = state;
  for (let i = 0; i < size * size; i++) {
    if (grid[i] !== solution[i]) return false;
  }
  return true;
}

/** Find cells that violate Tango rules */
export function findConflicts(state: TangoGameState): number[] {
  const { size, grid, constraints } = state;
  const conflicts = new Set<number>();

  // Check no-triples rule (rows)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size - 2; c++) {
      const a = grid[cellIndex(size, r, c)];
      const b = grid[cellIndex(size, r, c + 1)];
      const d = grid[cellIndex(size, r, c + 2)];
      if (a !== null && a === b && b === d) {
        conflicts.add(cellIndex(size, r, c));
        conflicts.add(cellIndex(size, r, c + 1));
        conflicts.add(cellIndex(size, r, c + 2));
      }
    }
  }

  // Check no-triples rule (columns)
  for (let c = 0; c < size; c++) {
    for (let r = 0; r < size - 2; r++) {
      const a = grid[cellIndex(size, r, c)];
      const b = grid[cellIndex(size, r + 1, c)];
      const d = grid[cellIndex(size, r + 2, c)];
      if (a !== null && a === b && b === d) {
        conflicts.add(cellIndex(size, r, c));
        conflicts.add(cellIndex(size, r + 1, c));
        conflicts.add(cellIndex(size, r + 2, c));
      }
    }
  }

  // Check if either symbol exceeds its maximum count per row
  for (let r = 0; r < size; r++) {
    let circles = 0;
    let crosses = 0;
    for (let c = 0; c < size; c++) {
      const sym = grid[cellIndex(size, r, c)];
      if (sym === 'circle') circles++;
      else if (sym === 'cross') crosses++;
    }
    const half = size / 2;
    if (circles > half || crosses > half) {
      for (let c = 0; c < size; c++) {
        if (grid[cellIndex(size, r, c)] !== null) {
          conflicts.add(cellIndex(size, r, c));
        }
      }
    }
  }

  // Check column counts (if full)
  for (let c = 0; c < size; c++) {
    let circles = 0;
    let crosses = 0;
    for (let r = 0; r < size; r++) {
      const sym = grid[cellIndex(size, r, c)];
      if (sym === 'circle') circles++;
      else if (sym === 'cross') crosses++;
    }
    const half = size / 2;
    if (circles > half || crosses > half) {
      for (let r = 0; r < size; r++) {
        if (grid[cellIndex(size, r, c)] !== null) {
          conflicts.add(cellIndex(size, r, c));
        }
      }
    }
  }

  // Check constraint violations
  for (const constraint of constraints) {
    const idx1 = cellIndex(size, constraint.row1, constraint.col1);
    const idx2 = cellIndex(size, constraint.row2, constraint.col2);
    const sym1 = grid[idx1];
    const sym2 = grid[idx2];
    if (sym1 === null || sym2 === null) continue;

    if (constraint.type === 'equal' && sym1 !== sym2) {
      conflicts.add(idx1);
      conflicts.add(idx2);
    }
    if (constraint.type === 'opposite' && sym1 === sym2) {
      conflicts.add(idx1);
      conflicts.add(idx2);
    }
  }

  return Array.from(conflicts);
}

/** Place a symbol in a cell, cycling: null → circle → cross → null */
export function cycleCell(state: TangoGameState, index: number): TangoGameState {
  const givenSet = new Set(state.givenCells);
  if (givenSet.has(index)) return state;

  const current = state.grid[index];
  let next: TangoSymbol;
  if (current === null) next = 'cross';
  else if (current === 'cross') next = 'circle';
  else next = null;

  const newGrid = [...state.grid];
  newGrid[index] = next;

  return { ...state, grid: newGrid };
}

// ---------------------------------------------------------------------------
// Puzzle generation
// ---------------------------------------------------------------------------

/** Count solutions (up to limit). Used to verify uniqueness. */
function countSolutions(
  size: number,
  grid: TangoSymbol[],
  constraints: TangoConstraint[],
  limit: number,
): number {
  return countSolutionsImpl(size, [...grid], constraints, limit);
}

function countSolutionsImpl(
  size: number,
  grid: TangoSymbol[],
  constraints: TangoConstraint[],
  limit: number,
): number {
  const idx = grid.indexOf(null);
  if (idx === -1) return 1;

  let count = 0;
  for (const sym of ['circle', 'cross'] as TangoSymbol[]) {
    grid[idx] = sym;
    if (isValidPartial(size, grid, constraints, idx)) {
      count += countSolutionsImpl(size, grid, constraints, limit - count);
      if (count >= limit) { grid[idx] = null; return count; }
    }
    grid[idx] = null;
  }
  return count;
}

/** Check if placing a symbol at `lastIdx` keeps the grid valid so far */
function isValidPartial(
  size: number,
  grid: TangoSymbol[],
  constraints: TangoConstraint[],
  lastIdx: number,
): boolean {
  const row = rowOf(size, lastIdx);
  const col = colOf(size, lastIdx);
  const sym = grid[lastIdx];
  if (sym === null) return true;

  const half = size / 2;

  // Row count check
  let rowCircles = 0;
  let rowCrosses = 0;
  for (let c = 0; c < size; c++) {
    const s = grid[cellIndex(size, row, c)];
    if (s === 'circle') rowCircles++;
    else if (s === 'cross') rowCrosses++;
  }
  if (rowCircles > half || rowCrosses > half) return false;

  // Column count check
  let colCircles = 0;
  let colCrosses = 0;
  for (let r = 0; r < size; r++) {
    const s = grid[cellIndex(size, r, col)];
    if (s === 'circle') colCircles++;
    else if (s === 'cross') colCrosses++;
  }
  if (colCircles > half || colCrosses > half) return false;

  // No-triples in row
  if (col >= 2) {
    const a = grid[cellIndex(size, row, col - 2)];
    const b = grid[cellIndex(size, row, col - 1)];
    if (a === sym && b === sym) return false;
  }
  if (col >= 1 && col < size - 1) {
    const a = grid[cellIndex(size, row, col - 1)];
    const b = grid[cellIndex(size, row, col + 1)];
    if (a === sym && b === sym) return false;
  }
  if (col < size - 2) {
    const a = grid[cellIndex(size, row, col + 1)];
    const b = grid[cellIndex(size, row, col + 2)];
    if (a === sym && b === sym) return false;
  }

  // No-triples in column
  if (row >= 2) {
    const a = grid[cellIndex(size, row - 2, col)];
    const b = grid[cellIndex(size, row - 1, col)];
    if (a === sym && b === sym) return false;
  }
  if (row >= 1 && row < size - 1) {
    const a = grid[cellIndex(size, row - 1, col)];
    const b = grid[cellIndex(size, row + 1, col)];
    if (a === sym && b === sym) return false;
  }
  if (row < size - 2) {
    const a = grid[cellIndex(size, row + 1, col)];
    const b = grid[cellIndex(size, row + 2, col)];
    if (a === sym && b === sym) return false;
  }

  // Constraint checks
  for (const c of constraints) {
    const idx1 = cellIndex(size, c.row1, c.col1);
    const idx2 = cellIndex(size, c.row2, c.col2);
    if (idx1 !== lastIdx && idx2 !== lastIdx) continue;
    const s1 = grid[idx1];
    const s2 = grid[idx2];
    if (s1 === null || s2 === null) continue;
    if (c.type === 'equal' && s1 !== s2) return false;
    if (c.type === 'opposite' && s1 === s2) return false;
  }

  return true;
}

/** Generate a random Tango puzzle with a unique solution */
export function generatePuzzle(size: number): TangoGameState {
  if (size < 4 || size > 8 || size % 2 !== 0) {
    throw new Error(`Invalid puzzle size: ${size}. Must be 4, 6, or 8.`);
  }

  // 1. Generate a random valid completed grid
  const fullGrid = generateRandomSolution(size);

  // 2. Generate constraints between some adjacent cells
  const constraints = generateConstraints(size, fullGrid);

  // 3. Remove symbols while maintaining unique solution
  const { grid, givenCells } = removeSymbols(size, fullGrid, constraints);

  return {
    size,
    grid,
    solution: fullGrid,
    constraints,
    givenCells,
  };
}

function generateRandomSolution(size: number): TangoSymbol[] {
  const grid: TangoSymbol[] = new Array(size * size).fill(null);

  // Fill with backtracking + random order
  function fillRandom(idx: number): boolean {
    if (idx === size * size) return true;

    const symbols: TangoSymbol[] = Math.random() < 0.5
      ? ['circle', 'cross']
      : ['cross', 'circle'];

    for (const sym of symbols) {
      grid[idx] = sym;
      if (isValidPartial(size, grid, [], idx)) {
        if (fillRandom(idx + 1)) return true;
      }
      grid[idx] = null;
    }
    return false;
  }

  if (!fillRandom(0)) {
    throw new Error(`Failed to generate a valid ${size}x${size} Tango grid`);
  }
  return grid;
}

function generateConstraints(size: number, solution: TangoSymbol[]): TangoConstraint[] {
  // Collect all adjacent pairs (horizontal and vertical)
  const pairs: Array<[number, number, number, number]> = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size - 1; c++) {
      pairs.push([r, c, r, c + 1]);
    }
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size; c++) {
      pairs.push([r, c, r + 1, c]);
    }
  }

  // Shuffle and pick some constraints
  shuffleArray(pairs);
  const numConstraints = Math.floor(size * 0.8) + Math.floor(Math.random() * 3);
  const constraints: TangoConstraint[] = [];

  for (const [r1, c1, r2, c2] of pairs) {
    if (constraints.length >= numConstraints) break;

    const s1 = solution[cellIndex(size, r1, c1)];
    const s2 = solution[cellIndex(size, r2, c2)];

    constraints.push({
      row1: r1,
      col1: c1,
      row2: r2,
      col2: c2,
      type: s1 === s2 ? 'equal' : 'opposite',
    });
  }

  return constraints;
}

function removeSymbols(
  size: number,
  solution: TangoSymbol[],
  constraints: TangoConstraint[],
): { grid: TangoSymbol[]; givenCells: number[] } {
  const grid = [...solution];
  const indices = Array.from({ length: size * size }, (_, i) => i);
  shuffleArray(indices);

  for (const idx of indices) {
    const saved = grid[idx];
    grid[idx] = null;

    if (countSolutions(size, grid, constraints, 2) !== 1) {
      grid[idx] = saved; // can't remove — would make puzzle ambiguous
    }
  }

  const givenCells: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== null) givenCells.push(i);
  }

  return { grid, givenCells };
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
