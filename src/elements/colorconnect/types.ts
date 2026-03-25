// ColorConnectElement: Connect matching colored dots without crossing lines
//
// Dots can be placed on the circle perimeter OR inside the circle.
// Player draws lines to connect matching color pairs without crossings.

import type { TransformableElement } from '../../types/primitives';

export interface ColorConnectDot {
  // Position as fraction of element layout:
  // For perimeter dots: angle in radians, radius = 1.0
  // For interior dots: angle + radius < 1.0
  angle: number;       // angle in radians from center
  radius: number;      // 0..1 fraction of circle radius (1.0 = on perimeter)
  colorIndex: number;  // which color pair (0..N-1)
  pairSlot: 0 | 1;    // first or second dot in the pair
}

export interface ColorConnectConnection {
  colorIndex: number;          // which pair this connects
  points: { x: number; y: number }[];  // path in local coordinates
  outOfBounds?: boolean;       // true if path exits the circle
}

export const MAX_LEVEL = 20;

export interface ColorConnectGameState {
  dots: ColorConnectDot[];
  connections: ColorConnectConnection[];
  numPairs: number;
  solved: boolean;
  level: number;            // current level (1-based)
  isGenerating: boolean;    // true while AI is generating next puzzle
  gameComplete: boolean;    // true when all 12 levels are beaten
}

export interface ColorConnectElement extends TransformableElement {
  type: 'colorconnect';
  width: number;
  height: number;
  gameState: ColorConnectGameState;
}

export const PAIR_COLORS = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f39c12', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
];
