// Element Plugins - import this file to register all element plugins
//
// Each plugin self-registers on import. Importing this file ensures
// all plugins are available for rendering, creation, and interaction.

// Import all plugins to register them
import './bridges';
import './coordinateplane';
import './glyph';
import './image';
import './inktext';
import './minesweeper';
import './nonogram';
import './shape';
import './sketchableimage';
import './stroke';
import './sudoku';
import './tictactoe';

// Re-export registry for convenience
export {
  registerPlugin,
  getPlugin,
  getPlugins,
  renderElement,
  getElementBounds,
  tryCreateElement,
  tryCreateElementWithDisambiguation,
  tryInteraction,
  getStrokesBoundingBox,
  // New unified handle API
  findHandleAtPoint,
  dispatchHandleDrag,
  getElementHandles,
  getAllHandles,
} from './registry';

export type {
  ElementPlugin,
  CreationContext,
  CreationResult,
  InteractionResult,
  RenderOptions,
  HandleDescriptor,
  HandleAppearance,
  HandleDragPhase,
  HandleHitResult,
} from './registry';
