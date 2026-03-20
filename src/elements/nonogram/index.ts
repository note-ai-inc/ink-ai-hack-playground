// Nonogram Element Plugin

import { generateId } from '../../types';
import type { NonogramElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { registerPaletteEntry } from '../../palette/PaletteRegistry';
import { NonogramIcon } from './icon';
import { isInterestedIn, acceptInk } from './interaction';
import { render, getBounds } from './renderer';
import { getRecognitionService } from '../../recognition/RecognitionService';
import type { Element } from '../../types/elements';

const CANVAS_GRID = 50;
// 10x10 puzzle grid + clue area (snapped to 50px multiples)
// Clue area is at most ~5 clues wide → ceil(5*14+8 / 50)*50 = 100px = 2 grid squares
// Total: 2 + 10 = 12 grid squares per side (600px) as a reasonable default
const NONOGRAM_GRID_CELLS = 10;

const nonogramPlugin: ElementPlugin<NonogramElement> = {
  elementType: 'nonogram',
  name: 'Nonogram',
  triesEagerInteractions: true,

  isInterestedIn,
  acceptInk,

  render,
  getBounds,
};

registerPlugin(nonogramPlugin);

registerPaletteEntry({
  id: 'nonogram',
  label: 'Nonogram',
  Icon: NonogramIcon,
  category: 'game',
  onSelect: async (bounds, consumeStrokes, context) => {
    // Snap origin to background grid
    const originX = Math.round(bounds.left / CANVAS_GRID) * CANVAS_GRID;
    const originY = Math.round(bounds.top / CANVAS_GRID) * CANVAS_GRID;

    // Size: clue area (2 grid squares) + puzzle cells (10 grid squares) = 12 * 50 = 600
    // The exact size will be recalculated once the game state is generated,
    // but we use a reasonable default so the loading state looks right.
    const clueSquares = 2; // conservative default for clue area
    const width = (clueSquares + NONOGRAM_GRID_CELLS) * CANVAS_GRID;
    const height = (clueSquares + NONOGRAM_GRID_CELLS) * CANVAS_GRID;

    // Try to find StrokeElements within bounds and recognize text from them
    let prompt = '';
    const elementIdsToConsume: string[] = [];

    if (context?.elements) {
      // Exclude the gesture stroke element (contains Rect+X strokes)
      const gestureStrokeSet = new Set(context.gestureStrokes ?? []);
      const strokeElements = findStrokeElementsInBounds(context.elements, bounds)
        .filter(el => {
          if (el.type !== 'stroke') return false;
          // Exclude if any of its strokes are gesture strokes
          return !el.strokes.some(s => gestureStrokeSet.has(s));
        });
      if (strokeElements.length > 0) {
        // Collect all strokes from matching elements
        const allStrokes = strokeElements.flatMap(el => {
          if (el.type === 'stroke') return el.strokes;
          return [];
        });

        if (allStrokes.length > 0) {
          try {
            const result = await getRecognitionService().recognizeGoogle(allStrokes);
            if (result.rawText.trim()) {
              prompt = result.rawText.trim();
            }
          } catch {
            // Fall back to default prompt
          }
          elementIdsToConsume.push(...strokeElements.map(el => el.id));
        }
      }
    }

    consumeStrokes(...elementIdsToConsume);

    return {
      type: 'nonogram' as const,
      id: generateId(),
      transform: {
        values: [1, 0, 0, 0, 1, 0, originX, originY, 1] as [number, number, number, number, number, number, number, number, number],
      },
      width,
      height,
      gameState: null,
      isGenerating: true,
      isSolved: false,
      prompt,
      colorImageDataUrl: '',
    };
  },
});

function findStrokeElementsInBounds(elements: Element[], bounds: { left: number; top: number; right: number; bottom: number }): Element[] {
  return elements.filter(el => {
    if (el.type !== 'stroke') return false;
    // Check if any stroke input point falls within the bounds
    for (const stroke of el.strokes) {
      for (const input of stroke.inputs.inputs) {
        if (input.x >= bounds.left && input.x <= bounds.right &&
            input.y >= bounds.top && input.y <= bounds.bottom) {
          return true;
        }
      }
    }
    return false;
  });
}

export { nonogramPlugin };
