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

export function getPaletteEntries(): PaletteEntry[] {
  return [...paletteEntries];
}
