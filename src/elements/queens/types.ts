// QueensElement: LinkedIn-style Queens logic puzzle
// One queen per row, column, and colored region — no adjacency allowed.

import type { TransformableElement } from '../../types/primitives';

export type QueenCellState = 'empty' | 'x' | 'queen';

export interface QueensGameState {
  size: number;           // n — grid is n×n with n regions
  regions: number[];      // flat length n*n: region ID (0..n-1) for each cell
  cells: QueenCellState[]; // current cell states
  won: boolean;
  seed: number;           // RNG seed used to generate the puzzle
}

export interface QueensElement extends TransformableElement {
  type: 'queens';
  width: number;
  height: number;
  gameState: QueensGameState;
  conflictCells: number[]; // indices of cells currently in conflict
}
