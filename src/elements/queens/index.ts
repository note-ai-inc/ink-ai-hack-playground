// Queens Element Plugin — registers with the element registry and the palette.

import { generateId } from '../../types';
import type { QueensElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { registerPaletteEntry } from '../../palette/PaletteRegistry';
import { QueensIcon } from './icon';
import { isInterestedIn, acceptInk } from './interaction';
import { render, getBounds } from './renderer';
import { createInitialState, computeConflicts } from './gameState';

const CELL_SIZE = 50; // pixels per cell (matches canvas grid)

const queensPlugin: ElementPlugin<QueensElement> = {
  elementType: 'queens',
  name: 'Queens',
  triesEagerInteractions: true,

  isInterestedIn,
  acceptInk,

  render,
  getBounds,
};

registerPlugin(queensPlugin);

registerPaletteEntry({
  id: 'queens',
  label: 'Queens',
  Icon: QueensIcon,
  category: 'game',
  onSelect: async (bounds, consumeStrokes) => {
    const rectWidth = bounds.right - bounds.left;
    const rectHeight = bounds.bottom - bounds.top;

    // Determine grid size from the drawn rectangle, clamped 5–10
    const rawN = Math.round(Math.min(rectWidth, rectHeight) / CELL_SIZE);
    const n = Math.min(10, Math.max(5, rawN));

    const size = n * CELL_SIZE;

    const originX = Math.round(bounds.left / CELL_SIZE) * CELL_SIZE;
    const originY = Math.round(bounds.top / CELL_SIZE) * CELL_SIZE;

    const seed = Date.now() % 999983; // prime-ish to avoid patterns
    const gameState = createInitialState(n, seed);

    consumeStrokes();

    const element: QueensElement = {
      type: 'queens' as const,
      id: generateId(),
      transform: {
        values: [1, 0, 0, 0, 1, 0, originX, originY, 1],
      },
      width: size,
      height: size,
      gameState,
      conflictCells: computeConflicts(gameState),
    };

    return element;
  },
});

export { queensPlugin };
