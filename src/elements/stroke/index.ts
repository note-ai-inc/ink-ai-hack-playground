// Stroke Element Plugin
//
// Render-only element type for raw ink strokes.
// Importing this module automatically registers the plugin.

import type { StrokeElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { render, getBounds } from './renderer';

const strokePlugin: ElementPlugin<StrokeElement> = {
  elementType: 'stroke',
  name: 'Stroke',

  // Rendering only (no creation or interaction)
  render,
  getBounds,
};

// Auto-register on import
registerPlugin(strokePlugin);

export { strokePlugin };
