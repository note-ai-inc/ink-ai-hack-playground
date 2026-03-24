// Jigsaw game logic — piece generation, scatter, snap detection

import type { JigsawPiece, JigsawEdges, JigsawGameState } from './types';

export function createGameState(
  rows: number,
  cols: number,
  puzzleWidth: number,
  puzzleHeight: number,
  puzzleLeft: number,
  puzzleTop: number,
  elementWidth: number,
  elementHeight: number,
): JigsawGameState {
  const pieceWidth = puzzleWidth / cols;
  const pieceHeight = puzzleHeight / rows;

  // Generate matching edges between adjacent pieces
  // hEdges[r][c] = edge type for the boundary between row r and row r+1 at col c
  const hEdges: (1 | -1)[][] = [];
  for (let r = 0; r < rows - 1; r++) {
    hEdges[r] = [];
    for (let c = 0; c < cols; c++) {
      hEdges[r][c] = Math.random() < 0.5 ? 1 : -1;
    }
  }

  // vEdges[r][c] = edge type for the boundary between col c and col c+1 at row r
  const vEdges: (1 | -1)[][] = [];
  for (let r = 0; r < rows; r++) {
    vEdges[r] = [];
    for (let c = 0; c < cols - 1; c++) {
      vEdges[r][c] = Math.random() < 0.5 ? 1 : -1;
    }
  }

  const pieces: JigsawPiece[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edges: JigsawEdges = {
        top: r === 0 ? 0 : (-hEdges[r - 1][c] as -1 | 1),
        bottom: r === rows - 1 ? 0 : hEdges[r][c],
        left: c === 0 ? 0 : (-vEdges[r][c - 1] as -1 | 1),
        right: c === cols - 1 ? 0 : vEdges[r][c],
      };

      pieces.push({
        id: r * cols + c,
        row: r,
        col: c,
        currentX: 0,  // will be set by scatter
        currentY: 0,
        isPlaced: false,
        edges,
      });
    }
  }

  // Scatter pieces randomly across the element area
  scatterPieces(pieces, pieceWidth, pieceHeight, elementWidth, elementHeight);

  return { rows, cols, pieces, pieceWidth, pieceHeight, puzzleLeft, puzzleTop };
}

function scatterPieces(
  pieces: JigsawPiece[],
  pieceWidth: number,
  pieceHeight: number,
  elementWidth: number,
  elementHeight: number,
): void {
  const margin = 20;
  const rangeX = Math.max(0, elementWidth - pieceWidth - margin * 2);
  const rangeY = Math.max(0, elementHeight - pieceHeight - margin * 2);

  for (const piece of pieces) {
    piece.currentX = margin + Math.random() * rangeX;
    piece.currentY = margin + Math.random() * rangeY;
  }
}

export function getTargetPosition(
  piece: JigsawPiece,
  gameState: JigsawGameState,
): { x: number; y: number } {
  return {
    x: gameState.puzzleLeft + piece.col * gameState.pieceWidth,
    y: gameState.puzzleTop + piece.row * gameState.pieceHeight,
  };
}

const SNAP_DISTANCE = 30;

export function checkSnap(
  piece: JigsawPiece,
  gameState: JigsawGameState,
): boolean {
  const target = getTargetPosition(piece, gameState);
  const dx = piece.currentX - target.x;
  const dy = piece.currentY - target.y;
  return Math.sqrt(dx * dx + dy * dy) < SNAP_DISTANCE;
}

export function checkAllPlaced(gameState: JigsawGameState): boolean {
  return gameState.pieces.every(p => p.isPlaced);
}
