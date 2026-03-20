// Glyph Element Plugin
//
// Render-only element type for text glyphs.
// Importing this module automatically registers the plugin.

import type { GlyphElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { render, getBounds } from './renderer';

const glyphPlugin: ElementPlugin<GlyphElement> = {
  elementType: 'glyph',
  name: 'Glyph',

  // Rendering only (no creation or interaction)
  render,
  getBounds,
};

// Auto-register on import
registerPlugin(glyphPlugin);

export { glyphPlugin };
