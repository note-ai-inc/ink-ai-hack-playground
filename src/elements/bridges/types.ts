// BridgesElement: Interactive Hashiwokakero puzzle

import type { TransformableElement } from '../../types/primitives';

export interface BridgesIsland {
  row: number;
  col: number;
  requiredBridges: number;
}

export interface BridgeConnection {
  island1: number;
  island2: number;
  count: number;
}

export interface BridgesGameState {
  gridCols: number;
  gridRows: number;
  islands: BridgesIsland[];
  bridges: BridgeConnection[];
}

export interface BridgesElement extends TransformableElement {
  type: 'bridges';
  width: number;
  height: number;
  gameState: BridgesGameState;
}
