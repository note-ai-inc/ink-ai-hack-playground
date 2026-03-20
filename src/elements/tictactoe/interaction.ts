// TicTacToe interaction - handle X moves and computer AI

import type { Stroke, BoundingBox, Offset } from '../../types';
import type { TicTacToeElement, TicTacToeCell } from './types';
import { TicTacToePiece, TicTacToeGameState } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import { getRecognitionService } from '../../recognition/RecognitionService';
import { pointInQuad } from '../../geometry/polygon';
import { getStrokesBoundingBox } from '../registry/ElementRegistry';

// Winning combinations (cell indices)
const WINNING_COMBINATIONS = [
  [0, 1, 2], // Top row
  [3, 4, 5], // Middle row
  [6, 7, 8], // Bottom row
  [0, 3, 6], // Left column
  [1, 4, 7], // Middle column
  [2, 5, 8], // Right column
  [0, 4, 8], // Diagonal TL to BR
  [2, 4, 6], // Diagonal TR to BL
];

/**
 * Get the bounding box of a TicTacToe element.
 */
function getTicTacToeBounds(element: TicTacToeElement): BoundingBox {
  const allPoints = element.cells.flatMap((cell) => [
    cell.quad.topLeft,
    cell.quad.topRight,
    cell.quad.bottomRight,
    cell.quad.bottomLeft,
  ]);

  return {
    left: Math.min(...allPoints.map((p) => p.x)),
    top: Math.min(...allPoints.map((p) => p.y)),
    right: Math.max(...allPoints.map((p) => p.x)),
    bottom: Math.max(...allPoints.map((p) => p.y)),
  };
}

/**
 * Check if two bounding boxes overlap.
 */
function boundingBoxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/**
 * Find which cell contains the center of the given strokes.
 */
function findCellForStrokes(
  element: TicTacToeElement,
  strokes: Stroke[]
): number | null {
  // Calculate the center point of the strokes
  const bounds = getStrokesBoundingBox(strokes);
  if (!bounds) return null;

  const center: Offset = {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };

  // Find which cell contains this center point
  for (let i = 0; i < element.cells.length; i++) {
    if (pointInQuad(center, element.cells[i].quad)) {
      return i;
    }
  }

  return null;
}

/**
 * Check if the recognized text is an "X" symbol.
 */
function isXSymbol(result: HandwritingRecognitionResult): boolean {
  const text = result.rawText.trim().toLowerCase();
  return (
    text === 'x' ||
    text === 'х' || // Cyrillic X
    text === '✕' ||
    text === '✗' ||
    text === '×'
  );
}

/**
 * Check if the recognized text is an "O" symbol.
 */
function isOSymbol(result: HandwritingRecognitionResult): boolean {
  const text = result.rawText.trim().toLowerCase();
  return (
    text === 'o' ||
    text === 'о' || // Cyrillic O
    text === '0' || // Zero
    text === '○' ||
    text === '◯' ||
    text === '⭕'
  );
}

/**
 * Recognize what piece type the strokes represent.
 * Returns 'X', 'O', or null if unrecognized.
 */
async function recognizePiece(
  strokes: Stroke[],
  recognitionResult?: HandwritingRecognitionResult
): Promise<TicTacToePiece | null> {
  let result = recognitionResult;

  if (!result) {
    try {
      const service = getRecognitionService();
      result = await service.recognizeGoogle(strokes);
    } catch {
      return null;
    }
  }

  if (isXSymbol(result)) {
    return TicTacToePiece.X;
  }
  if (isOSymbol(result)) {
    return TicTacToePiece.O;
  }
  return null;
}

/**
 * Check if a player has won.
 */
function checkWinner(cells: TicTacToeCell[]): TicTacToePiece {
  for (const combo of WINNING_COMBINATIONS) {
    const [a, b, c] = combo;
    if (
      cells[a].piece !== TicTacToePiece.EMPTY &&
      cells[a].piece === cells[b].piece &&
      cells[a].piece === cells[c].piece
    ) {
      return cells[a].piece;
    }
  }
  return TicTacToePiece.EMPTY;
}

/**
 * Check if the game is a tie (all cells filled, no winner).
 */
function checkTie(cells: TicTacToeCell[]): boolean {
  return cells.every((cell) => cell.piece !== TicTacToePiece.EMPTY);
}

/**
 * Update game state based on current board.
 */
function updateGameState(cells: TicTacToeCell[]): TicTacToeGameState {
  const winner = checkWinner(cells);
  if (winner === TicTacToePiece.X) return TicTacToeGameState.X_WINS;
  if (winner === TicTacToePiece.O) return TicTacToeGameState.O_WINS;
  if (checkTie(cells)) return TicTacToeGameState.TIE;
  return TicTacToeGameState.PLAYING;
}

/**
 * Computer AI: Choose the best move for the CPU.
 * Priority: Win > Block human > Take center > Take corners > Take sides
 */
function computerMove(
  cells: TicTacToeCell[],
  cpuPiece: TicTacToePiece,
  humanPiece: TicTacToePiece
): number | null {
  const emptyCells = cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.piece === TicTacToePiece.EMPTY)
    .map(({ index }) => index);

  if (emptyCells.length === 0) return null;

  // 1. Try to win
  const winningMove = findWinningMove(cells, cpuPiece);
  if (winningMove !== null) return winningMove;

  // 2. Block human from winning
  const blockingMove = findWinningMove(cells, humanPiece);
  if (blockingMove !== null) return blockingMove;

  // 3. Take center if available
  if (cells[4].piece === TicTacToePiece.EMPTY) return 4;

  // 4. Take corners
  const corners = [0, 2, 6, 8].filter((i) => cells[i].piece === TicTacToePiece.EMPTY);
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  // 5. Take sides
  const sides = [1, 3, 5, 7].filter((i) => cells[i].piece === TicTacToePiece.EMPTY);
  if (sides.length > 0) {
    return sides[Math.floor(Math.random() * sides.length)];
  }

  // Fallback: take any empty cell
  return emptyCells[0];
}

/**
 * Find a move that would result in a win for the given piece.
 */
function findWinningMove(cells: TicTacToeCell[], piece: TicTacToePiece): number | null {
  for (const combo of WINNING_COMBINATIONS) {
    const pieces = combo.map((i) => cells[i].piece);
    const emptyIndex = combo.findIndex((i) => cells[i].piece === TicTacToePiece.EMPTY);

    // If there's exactly one empty cell and the other two are the same piece
    if (
      emptyIndex !== -1 &&
      pieces.filter((p) => p === piece).length === 2 &&
      pieces.filter((p) => p === TicTacToePiece.EMPTY).length === 1
    ) {
      return combo[emptyIndex];
    }
  }
  return null;
}

/**
 * Place a piece in a cell.
 */
function placePiece(
  cells: TicTacToeCell[],
  cellIndex: number,
  piece: TicTacToePiece,
  strokes?: Stroke[]
): TicTacToeCell[] {
  return cells.map((cell, index) => {
    if (index === cellIndex) {
      return {
        ...cell,
        piece,
        pieceStrokes: strokes,
      };
    }
    return cell;
  });
}

/**
 * Check if this element is interested in handling the given strokes.
 */
export function isInterestedIn(
  element: TicTacToeElement,
  _strokes: Stroke[],
  strokeBounds: BoundingBox
): boolean {
  // Only interested if game is still playing
  if (element.gameState !== TicTacToeGameState.PLAYING) {
    return false;
  }

  // Check if strokes overlap with the TicTacToe bounds
  const elementBounds = getTicTacToeBounds(element);
  return boundingBoxesOverlap(elementBounds, strokeBounds);
}

/**
 * Accept ink input and update the element.
 */
export async function acceptInk(
  element: TicTacToeElement,
  strokes: Stroke[],
  recognitionResult?: HandwritingRecognitionResult
): Promise<InteractionResult> {
  // Game must be in playing state
  if (element.gameState !== TicTacToeGameState.PLAYING) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // Find which cell the strokes are in
  const cellIndex = findCellForStrokes(element, strokes);
  if (cellIndex === null) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // Cell must be empty
  if (element.cells[cellIndex].piece !== TicTacToePiece.EMPTY) {
    return { element, consumed: false, strokesConsumed: [] };
  }

  // Recognize the drawn piece (X or O)
  let recognizedPiece = await recognizePiece(strokes, recognitionResult);

  // Determine the human's piece
  let humanPiece = element.humanPiece;
  let cpuPiece: TicTacToePiece;

  if (!humanPiece) {
    // First move - set piece based on what was recognized
    if (recognizedPiece === TicTacToePiece.X || recognizedPiece === TicTacToePiece.O) {
      humanPiece = recognizedPiece;
    } else {
      // If recognition failed, default to X
      humanPiece = TicTacToePiece.X;
      recognizedPiece = TicTacToePiece.X;
    }
    cpuPiece = humanPiece === TicTacToePiece.X ? TicTacToePiece.O : TicTacToePiece.X;
  } else {
    // Subsequent moves - human must use their assigned piece
    cpuPiece = humanPiece === TicTacToePiece.X ? TicTacToePiece.O : TicTacToePiece.X;
    // Be lenient - accept any drawing as the human's piece
    recognizedPiece = humanPiece;
  }

  // Place human's piece in the cell
  let newCells = placePiece(element.cells, cellIndex, humanPiece, strokes);
  let newGameState = updateGameState(newCells);

  // If game is still playing, computer makes a move
  let cpuMoveTimestamp: number | undefined;
  let cpuMoveCellIndex: number | undefined;

  if (newGameState === TicTacToeGameState.PLAYING) {
    const computerCellIndex = computerMove(newCells, cpuPiece, humanPiece);
    if (computerCellIndex !== null) {
      newCells = placePiece(newCells, computerCellIndex, cpuPiece);
      newGameState = updateGameState(newCells);
      const delay = Math.random() * 250;
      cpuMoveTimestamp = performance.now() + delay;
      cpuMoveCellIndex = computerCellIndex;
    }
  }

  const newElement: TicTacToeElement = {
    ...element,
    cells: newCells,
    gameState: newGameState,
    humanPiece,
    cpuMoveTimestamp,
    cpuMoveCellIndex,
  };

  return {
    element: newElement,
    consumed: true,
    strokesConsumed: strokes,
  };
}
