// Palette entry registry
//
// Extensible registry where plugins register palette options that appear
// when the user draws a rectangle+X gesture.

import type { ComponentType } from 'react';
import type { BoundingBox } from '../types/primitives';
import type { Element } from '../types/elements';
import type { Stroke } from '../types';

export interface PaletteContext {
  elements: Element[];
  gestureStrokes: Stroke[];  // Rect+X gesture strokes to exclude from recognition
}

export interface PaletteEntry {
  id: string;
  label: string;
  Icon: ComponentType;
  category: 'image' | 'content' | 'game';
  onSelect: (bounds: BoundingBox, consumeStrokes: (...elementIds: string[]) => void, context?: PaletteContext) => Promise<Element | null>;
}

const paletteEntries: PaletteEntry[] = [];

export function registerPaletteEntry(entry: PaletteEntry): void {
  const existing = paletteEntries.findIndex(e => e.id === entry.id);
  if (existing >= 0) {
    paletteEntries[existing] = entry;
  } else {
    paletteEntries.push(entry);
  }
}

export const PALETTE_CATEGORIES: { key: PaletteEntry['category']; label: string; order: number }[] = [
  { key: 'image', label: 'Image', order: 0 },
  { key: 'content', label: 'AI', order: 1 },
  { key: 'game', label: 'Games', order: 2 },
];

const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  PALETTE_CATEGORIES.map(c => [c.key, c.order])
);

export function getPaletteEntries(): PaletteEntry[] {
  return [...paletteEntries].sort((a, b) => {
    const catDiff = (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99);
    if (catDiff !== 0) return catDiff;
    return a.label.localeCompare(b.label);
  });
}
