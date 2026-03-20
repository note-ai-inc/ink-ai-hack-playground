// NonogramElement: Interactive nonogram (picross) puzzle

import type { TransformableElement } from '../../types/primitives';

export type NonogramCellState = 'empty' | 'filled' | 'marked';

export interface NonogramGameState {
  rows: number;
  cols: number;
  solution: boolean[];        // flat row-major, true = filled
  playerGrid: NonogramCellState[];
  rowClues: number[][];
  colClues: number[][];
  cellColors: string[];       // per-cell color from source image
}

export interface NonogramElement extends TransformableElement {
  type: 'nonogram';
  width: number;
  height: number;
  gameState: NonogramGameState | null;  // null while generating
  isGenerating: boolean;
  isSolved: boolean;
  prompt: string;
  colorImageDataUrl: string;            // revealed on solve
}
