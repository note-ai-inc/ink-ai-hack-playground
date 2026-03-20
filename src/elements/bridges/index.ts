// Bridges Element Plugin

import { generateId } from '../../types';
import type { BridgesElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { registerPaletteEntry } from '../../palette/PaletteRegistry';
import { BridgesIcon } from './icon';
import { isInterestedIn, acceptInk } from './interaction';
import { render, getBounds } from './renderer';
import { generatePuzzle } from './puzzleGenerator';

const CANVAS_GRID = 50;
const CELL_TARGET = 70;

const bridgesPlugin: ElementPlugin<BridgesElement> = {
  elementType: 'bridges',
  name: 'Bridges',
  triesEagerInteractions: true,

  isInterestedIn,
  acceptInk,

  render,
  getBounds,
};

registerPlugin(bridgesPlugin);

registerPaletteEntry({
  id: 'bridges',
  label: 'Bridges',
  Icon: BridgesIcon,
  category: 'game',
  onSelect: async (bounds, consumeStrokes) => {
    const originX = Math.round(bounds.left / CANVAS_GRID) * CANVAS_GRID;
    const originY = Math.round(bounds.top / CANVAS_GRID) * CANVAS_GRID;
    const endX = Math.round(bounds.right / CANVAS_GRID) * CANVAS_GRID;
    const endY = Math.round(bounds.bottom / CANVAS_GRID) * CANVAS_GRID;

    const width = Math.max(CANVAS_GRID * 5, endX - originX);
    const height = Math.max(CANVAS_GRID * 5, endY - originY);

    const gridCols = Math.max(5, Math.round(width / CELL_TARGET));
    const gridRows = Math.max(5, Math.round(height / CELL_TARGET));

    const gameState = generatePuzzle(gridCols, gridRows);

    consumeStrokes();

    return {
      type: 'bridges' as const,
      id: generateId(),
      transform: {
        values: [1, 0, 0, 0, 1, 0, originX, originY, 1] as [number, number, number, number, number, number, number, number, number],
      },
      width,
      height,
      gameState,
    };
  },
});

export { bridgesPlugin };
