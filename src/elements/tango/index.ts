// Tango Element Plugin

import { generateId } from '../../types';
import type { TangoElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { registerPaletteEntry } from '../../palette/PaletteRegistry';
import { TangoIcon } from './icon';
import { isInterestedIn, acceptInk } from './interaction';
import { render, getBounds } from './renderer';
import { generatePuzzle } from './gameState';

const CANVAS_GRID = 50;
const DEFAULT_SIZE = 6;
const MAX_SIZE = 8;

const tangoPlugin: ElementPlugin<TangoElement> = {
  elementType: 'tango',
  name: 'Tango',
  triesEagerInteractions: true,

  isInterestedIn,
  acceptInk,

  render,
  getBounds,
};

registerPlugin(tangoPlugin);

registerPaletteEntry({
  id: 'tango',
  label: 'Tango',
  Icon: TangoIcon,
  category: 'game',
  onSelect: async (bounds, consumeStrokes) => {
    const rectWidth = bounds.right - bounds.left;
    const rectHeight = bounds.bottom - bounds.top;

    // Determine grid size from drawn area (must be even, clamped to 4–8)
    const drawnCells = Math.round(Math.min(rectWidth, rectHeight) / CANVAS_GRID);
    let size = Math.max(DEFAULT_SIZE, drawnCells);
    if (size % 2 !== 0) size += 1;
    size = Math.min(size, MAX_SIZE);

    const totalSize = size * CANVAS_GRID;

    const originX = Math.round(bounds.left / CANVAS_GRID) * CANVAS_GRID;
    const originY = Math.round(bounds.top / CANVAS_GRID) * CANVAS_GRID;

    const gameState = generatePuzzle(size);

    consumeStrokes();

    return {
      type: 'tango' as const,
      id: generateId(),
      transform: {
        values: [1, 0, 0, 0, 1, 0, originX, originY, 1] as [number, number, number, number, number, number, number, number, number],
      },
      width: totalSize,
      height: totalSize,
      gameState,
      isSolved: false,
      conflictCells: [],
    };
  },
});

export { tangoPlugin };
