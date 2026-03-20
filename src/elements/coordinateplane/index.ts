// CoordinatePlane Element Plugin
//
// Self-contained element type for interactive coordinate planes.
// Importing this module automatically registers the plugin.

console.log('[CoordPlane] Module loading...');

import type { CoordinatePlaneElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { canCreate, createFromInk } from './creator';
import { isInterestedIn, acceptInk, getHandles, onHandleDrag } from './interaction';
import { render, getBounds } from './renderer';

console.log('[CoordPlane] Imports completed');

const coordinatePlanePlugin: ElementPlugin<CoordinatePlaneElement> = {
  elementType: 'coordinatePlane',
  name: 'CoordinatePlane',

  // Creation
  canCreate,
  createFromInk,

  // Interaction
  isInterestedIn,
  acceptInk,

  // Handle-based interaction (unified API)
  getHandles,
  onHandleDrag,

  // Rendering
  render,
  getBounds,
};

// Auto-register on import
console.log('[CoordPlane] About to register plugin...');
registerPlugin(coordinatePlanePlugin);
console.log('[CoordPlane] Plugin registered successfully!');

export { coordinatePlanePlugin };
