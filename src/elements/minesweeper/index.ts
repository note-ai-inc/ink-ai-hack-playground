// Minesweeper Element Plugin

import { generateId } from '../../types';
import type { MinesweeperElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { registerPaletteEntry } from '../../palette/PaletteRegistry';
import { MinesweeperIcon } from './icon';
import { isInterestedIn, acceptInk } from './interaction';
import { render, getBounds } from './renderer';
import { createEmptyState } from './gameState';

const CANVAS_GRID = 50;
const MINE_DENSITY = 0.12;

const minesweeperPlugin: ElementPlugin<MinesweeperElement> = {
  elementType: 'minesweeper',
  name: 'Minesweeper',
  triesEagerInteractions: true,

  isInterestedIn,
  acceptInk,

  render,
  getBounds,
};

registerPlugin(minesweeperPlugin);

registerPaletteEntry({
  id: 'minesweeper',
  label: 'Minesweeper',
  Icon: MinesweeperIcon,
  category: 'game',
  onSelect: async (bounds, consumeStrokes) => {
    const rectWidth = bounds.right - bounds.left;
    const rectHeight = bounds.bottom - bounds.top;

    const cols = Math.max(5, Math.round(rectWidth / CANVAS_GRID));
    const rows = Math.max(5, Math.round(rectHeight / CANVAS_GRID));
    const width = cols * CANVAS_GRID;
    const height = rows * CANVAS_GRID;

    const originX = Math.round(bounds.left / CANVAS_GRID) * CANVAS_GRID;
    const originY = Math.round(bounds.top / CANVAS_GRID) * CANVAS_GRID;

    const mineCount = Math.max(1, Math.round(rows * cols * MINE_DENSITY));
    const gameState = createEmptyState(rows, cols, mineCount);

    consumeStrokes();

    return {
      type: 'minesweeper' as const,
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

export { minesweeperPlugin };
