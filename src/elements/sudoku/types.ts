// SudokuElement: Interactive 9x9 puzzle

import type { TransformableElement } from '../../types/primitives';
import type { Stroke } from '../../types/brush';

export interface SudokuGameState {
  grid: number[];
  originalGrid: number[];
}

export interface SudokuElement extends TransformableElement {
  type: 'sudoku';
  width: number;
  height: number;
  gameState: SudokuGameState;
  playerDigitStrokes: Record<number, Stroke[]>;
  placeholderCells: number[];
  conflictCells: number[];
}
