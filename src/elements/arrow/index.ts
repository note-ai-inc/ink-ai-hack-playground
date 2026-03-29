// Arrow Element Plugin — detects hand-drawn arrows
// Importing this module auto-registers the plugin.

import type { ArrowElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { render, getBounds } from './renderer';
import { canCreate, createFromInk } from './creator';

const arrowPlugin: ElementPlugin<ArrowElement> = {
  elementType: 'arrow',
  name: 'Arrow',

  canCreate,
  createFromInk,

  render,
  getBounds,
};

registerPlugin(arrowPlugin);

export { arrowPlugin };

export type { ArrowProperties } from './utils';
export type { ArrowDirection } from './types';
export { getArrowProperties } from './utils';
