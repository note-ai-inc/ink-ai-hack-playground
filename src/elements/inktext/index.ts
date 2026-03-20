// InkText Element Plugin
//
// Self-contained element type for recognized handwriting.
// Importing this module automatically registers the plugin.

import type { InkTextElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { canCreate, createFromInk } from './creator';
import { isInterestedIn, acceptInk } from './interaction';
import { render, getBounds } from './renderer';

const inkTextPlugin: ElementPlugin<InkTextElement> = {
  elementType: 'inkText',
  name: 'InkText',

  // Creation
  canCreate,
  createFromInk,

  // Interaction
  isInterestedIn,
  acceptInk,

  // Rendering
  render,
  getBounds,
};

// Auto-register on import
registerPlugin(inkTextPlugin);

export { inkTextPlugin };
