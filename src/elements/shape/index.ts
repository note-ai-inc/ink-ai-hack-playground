// Shape Element Plugin
//
// Vector shapes created from hand-drawn input.
// Importing this module automatically registers the plugin.

import type { ShapeElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { render, getBounds } from './renderer';
import { canCreate, createFromInk } from './creator';

const shapePlugin: ElementPlugin<ShapeElement> = {
  elementType: 'shape',
  name: 'Shape',

  // Creation from ink
  canCreate,
  createFromInk,

  // Rendering
  render,
  getBounds,
};

// Auto-register on import
registerPlugin(shapePlugin);

export { shapePlugin };
