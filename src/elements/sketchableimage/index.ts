// SketchableImage Element Plugin
//
// AI-assisted sketch canvas. Created via toolbar button (no canCreate/createFromInk).
// Importing this module automatically registers the plugin.

import type { SketchableImageElement } from './types';
import { createSketchableImageElement, SKETCHABLE_IMAGE_SIZE } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { isInterestedIn, acceptInk } from './interaction';
import { render, getBounds } from './renderer';
import { registerPaletteEntry } from '../../palette/PaletteRegistry';
import { AiSketchIcon } from './icon';

const sketchableImagePlugin: ElementPlugin<SketchableImageElement> = {
  elementType: 'sketchableImage',
  name: 'SketchableImage',

  isInterestedIn,
  acceptInk,

  render,
  getBounds,
};

registerPlugin(sketchableImagePlugin);

registerPaletteEntry({
  id: 'aiSketch',
  label: 'AI Sketch',
  Icon: AiSketchIcon,
  category: 'content',
  onSelect: async (bounds, consumeStrokes) => {
    const rectWidth = bounds.right - bounds.left;
    const rectHeight = bounds.bottom - bounds.top;
    const size = Math.max(rectWidth, rectHeight, SKETCHABLE_IMAGE_SIZE);

    const scaleX = size / SKETCHABLE_IMAGE_SIZE;
    const scaleY = size / SKETCHABLE_IMAGE_SIZE;

    const element = createSketchableImageElement(bounds.left, bounds.top);
    consumeStrokes();

    return {
      ...element,
      scaleX,
      scaleY,
    };
  },
});

export { sketchableImagePlugin };
