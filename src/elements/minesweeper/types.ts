// MinesweeperElement: Interactive mine-clearing puzzle

import type { TransformableElement } from '../../types/primitives';

export interface MinesweeperCell {
  hasMine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number;
}

export interface MinesweeperGameState {
  rows: number;
  cols: number;
  cells: MinesweeperCell[];
  gameOver: boolean;
  won: boolean;
  minesPlaced: boolean;
  mineCount: number;
}

export interface MinesweeperElement extends TransformableElement {
  type: 'minesweeper';
  width: number;
  height: number;
  gameState: MinesweeperGameState;
}
