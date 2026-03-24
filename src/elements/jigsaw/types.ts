// JigsawElement: AI-generated jigsaw puzzle

import type { TransformableElement } from '../../types/primitives';

export interface JigsawEdges {
  top: -1 | 0 | 1;    // -1=blank(indent), 0=flat(border), 1=tab(protrude)
  right: -1 | 0 | 1;
  bottom: -1 | 0 | 1;
  left: -1 | 0 | 1;
}

export interface JigsawPiece {
  id: number;
  row: number;          // target grid row
  col: number;          // target grid col
  currentX: number;     // current top-left x in element-local coords
  currentY: number;     // current top-left y in element-local coords
  isPlaced: boolean;    // snapped to correct position
  edges: JigsawEdges;
}

export interface JigsawGameState {
  rows: number;
  cols: number;
  pieces: JigsawPiece[];
  pieceWidth: number;
  pieceHeight: number;
  puzzleLeft: number;   // x offset of puzzle target area within element
  puzzleTop: number;    // y offset of puzzle target area within element
}

export interface JigsawElement extends TransformableElement {
  type: 'jigsaw';
  width: number;
  height: number;
  gameState: JigsawGameState | null;
  isGenerating: boolean;
  isSolved: boolean;
  prompt: string;
  imageDataUrl: string;
}
