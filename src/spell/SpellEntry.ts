// Spell entry types and built-in entries (e.g. movement directions).

import type { ComponentType } from 'react';
import type { Vector2 } from '../transform/TransformOperation';

export type SpellCategory = 'image' | 'content' | 'movement';

export interface SpellEntry {
  id: string;
  label: string;
  Icon: ComponentType;
  category: SpellCategory;
  /** If set, clicking this entry adds velocity directly (bypasses mass). */
  velocity?: Vector2;
}

export const SPELL_CATEGORIES: { key: SpellCategory; label: string; order: number }[] = [
  { key: 'image', label: 'Image', order: 0 },
  { key: 'content', label: 'AI', order: 1 },
  { key: 'movement', label: 'Movement', order: 2 },
];

const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  SPELL_CATEGORIES.map(c => [c.key, c.order])
);

export function sortSpellEntries(entries: SpellEntry[]): SpellEntry[] {
  return [...entries].sort((a, b) => {
    const catDiff = (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99);
    if (catDiff !== 0) return catDiff;
    return a.label.localeCompare(b.label);
  });
}
