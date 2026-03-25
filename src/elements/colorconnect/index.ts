// Color Connect Element Plugin

import { generateId } from '../../types';
import type { ColorConnectElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { registerPaletteEntry } from '../../palette/PaletteRegistry';
import { ColorConnectIcon } from './icon';
import { isInterestedIn, acceptInk } from './interaction';
import { render, getBounds } from './renderer';
import { generateForLevel } from './puzzleGenerator';

const CANVAS_GRID = 50;

const colorConnectPlugin: ElementPlugin<ColorConnectElement> = {
  elementType: 'colorconnect',
  name: 'Color Connect',
  triesEagerInteractions: true,

  isInterestedIn,
  acceptInk,

  render,
  getBounds,
};

registerPlugin(colorConnectPlugin);

registerPaletteEntry({
  id: 'colorconnect',
  label: 'Color Connect',
  Icon: ColorConnectIcon,
  category: 'game',
  onSelect: async (bounds, consumeStrokes) => {
    const originX = Math.round(bounds.left / CANVAS_GRID) * CANVAS_GRID;
    const originY = Math.round(bounds.top / CANVAS_GRID) * CANVAS_GRID;
    const endX = Math.round(bounds.right / CANVAS_GRID) * CANVAS_GRID;
    const endY = Math.round(bounds.bottom / CANVAS_GRID) * CANVAS_GRID;

    const width = Math.max(CANVAS_GRID * 6, endX - originX);
    const height = Math.max(CANVAS_GRID * 6, endY - originY);

    // Always start at level 1
    const gameState = generateForLevel(1);

    consumeStrokes();

    return {
      type: 'colorconnect' as const,
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

export { colorConnectPlugin };
