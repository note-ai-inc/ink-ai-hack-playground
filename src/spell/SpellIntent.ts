// Spell intent types
//
// Represents a pending spell menu triggered by double-clicking an element.

import type { Offset, BoundingBox } from '../types/primitives';
import type { SpellEntry } from './SpellEntry';
import { sortSpellEntries } from './SpellEntry';
import { getPaletteEntries } from '../palette/PaletteRegistry';
import { movementEntries } from './movementEntries';

export interface SpellIntent {
  entries: SpellEntry[];
  rectangleBounds: BoundingBox;
  anchorPoint: Offset;
  createdAt: number;
  /** The element being replaced */
  replacingElementId: string;
}

export type SpellAction = 'select' | 'cast' | 'dismiss';

export function createSpellIntent(
  bounds: BoundingBox,
  replacingElementId: string,
): SpellIntent {
  // Take image + content entries from palette, add movement entries
  const paletteEntries: SpellEntry[] = getPaletteEntries()
    .filter(e => e.category !== 'game')
    .map(e => ({ id: e.id, label: e.label, Icon: e.Icon, category: e.category as 'image' | 'content' }));

  return {
    entries: sortSpellEntries([...paletteEntries, ...movementEntries]),
    rectangleBounds: bounds,
    anchorPoint: { x: (bounds.left + bounds.right) / 2, y: bounds.top },
    replacingElementId,
    createdAt: Date.now(),
  };
}
