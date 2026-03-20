// TicTacToeElement: Interactive game

import type { Quad, Offset } from '../../types/primitives';
import { IDENTITY_MATRIX, generateId } from '../../types/primitives';
import type { TransformableElement } from '../../types/primitives';
import type { Stroke } from '../../types/brush';

export const TicTacToePiece = {
  EMPTY: 'EMPTY',
  X: 'X',
  O: 'O',
} as const;
export type TicTacToePiece = (typeof TicTacToePiece)[keyof typeof TicTacToePiece];

export const TicTacToeGameState = {
  PLAYING: 'PLAYING',
  X_WINS: 'X_WINS',
  O_WINS: 'O_WINS',
  TIE: 'TIE',
} as const;
export type TicTacToeGameState = (typeof TicTacToeGameState)[keyof typeof TicTacToeGameState];

export interface TicTacToeCell {
  quad: Quad;
  piece: TicTacToePiece;
  pieceStrokes?: Stroke[]; // Strokes that form the X piece (if any)
}

export interface TicTacToeElement extends TransformableElement {
  type: 'tictactoe';
  cells: TicTacToeCell[]; // 9 cells, row-major order (0-2: top row, 3-5: middle, 6-8: bottom)
  gameState: TicTacToeGameState;
  gridStrokes: Stroke[]; // The 4 strokes that form the # grid
  intersections: [Offset, Offset, Offset, Offset]; // 4 intersection points of grid lines
  humanPiece?: TicTacToePiece; // The piece the human player uses (X or O), determined by first move
  cpuMoveTimestamp?: number; // performance.now() when CPU drawing animation should start (includes random delay)
  cpuMoveCellIndex?: number; // Cell index of the most recent CPU move (for animation)
}
export function createEmptyTicTacToeElement(
  gridStrokes: Stroke[],
  intersections: [Offset, Offset, Offset, Offset],
  cells: TicTacToeCell[],
  id?: string
): TicTacToeElement {
  return {
    type: 'tictactoe',
    id: id ?? generateId(),
    transform: IDENTITY_MATRIX,
    cells,
    gameState: TicTacToeGameState.PLAYING,
    gridStrokes,
    intersections,
  };
}
