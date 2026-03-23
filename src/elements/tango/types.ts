// TangoElement: Logic puzzle with circles and crosses
//
// Rules:
// - Each row/column has equal numbers of circles and crosses
// - No more than 2 identical symbols adjacent in a row/column
// - Constraint signs between cells: '=' means same symbol, 'x' means different

import type { TransformableElement } from '../../types/primitives';

export type TangoSymbol = 'circle' | 'cross' | null;

export interface TangoConstraint {
  row1: number;
  col1: number;
  row2: number;
  col2: number;
  type: 'equal' | 'opposite';
}

export interface TangoGameState {
  size: number;                    // grid size (must be even, e.g. 6)
  grid: TangoSymbol[];             // player's current grid (row-major)
  solution: TangoSymbol[];         // the unique solution
  constraints: TangoConstraint[];  // inter-cell constraints
  givenCells: number[];            // indices of pre-filled cells
}

export interface TangoElement extends TransformableElement {
  type: 'tango';
  width: number;
  height: number;
  gameState: TangoGameState;
  isSolved: boolean;
  conflictCells: number[];
}
