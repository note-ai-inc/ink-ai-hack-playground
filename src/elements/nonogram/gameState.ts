// Nonogram game state logic

import type { NonogramGameState, NonogramCellState } from './types';

export function generateClues(solution: boolean[], rows: number, cols: number): { rowClues: number[][]; colClues: number[][] } {
  const rowClues: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const clue: number[] = [];
    let count = 0;
    for (let c = 0; c < cols; c++) {
      if (solution[r * cols + c]) {
        count++;
      } else if (count > 0) {
        clue.push(count);
        count = 0;
      }
    }
    if (count > 0) clue.push(count);
    rowClues.push(clue.length > 0 ? clue : [0]);
  }

  const colClues: number[][] = [];
  for (let c = 0; c < cols; c++) {
    const clue: number[] = [];
    let count = 0;
    for (let r = 0; r < rows; r++) {
      if (solution[r * cols + c]) {
        count++;
      } else if (count > 0) {
        clue.push(count);
        count = 0;
      }
    }
    if (count > 0) clue.push(count);
    colClues.push(clue.length > 0 ? clue : [0]);
  }

  return { rowClues, colClues };
}

export function toggleCell(state: NonogramGameState, index: number): NonogramGameState {
  const newGrid = [...state.playerGrid];
  const current = newGrid[index];
  // Cycle: empty → filled → marked → empty
  const next: NonogramCellState =
    current === 'empty' ? 'filled' :
    current === 'filled' ? 'marked' : 'empty';
  newGrid[index] = next;
  return { ...state, playerGrid: newGrid };
}

export function checkSolved(state: NonogramGameState): boolean {
  for (let i = 0; i < state.solution.length; i++) {
    const playerFilled = state.playerGrid[i] === 'filled';
    if (playerFilled !== state.solution[i]) return false;
  }
  return true;
}

export function createGameState(solution: boolean[], rows: number, cols: number, cellColors: string[]): NonogramGameState {
  const { rowClues, colClues } = generateClues(solution, rows, cols);
  return {
    rows,
    cols,
    solution,
    playerGrid: new Array(rows * cols).fill('empty') as NonogramCellState[],
    rowClues,
    colClues,
    cellColors,
  };
}
