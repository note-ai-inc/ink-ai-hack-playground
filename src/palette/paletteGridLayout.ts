// Pure helper that computes CSS grid positions for the palette menu.
//
// Given sorted palette entries, returns column positions for category labels,
// entry buttons, separators, and the dismiss button — all sharing a single
// grid-template-columns definition so the two rows stay aligned.

import type { PaletteEntry } from './PaletteRegistry';
import { PALETTE_CATEGORIES } from './PaletteRegistry';

export interface GroupSpan {
  category: string;
  label: string;
  start: number; // 1-based CSS grid column
  end: number;
}

export interface Separator {
  column: number; // 1-based
  type: 'sep' | 'group-sep';
}

export interface PaletteGridLayout {
  gridTemplateColumns: string;
  groupSpans: GroupSpan[];
  entryColumns: number[];   // 1-based CSS grid column per entry
  separators: Separator[];
  dismissColumn: number;    // 1-based
}

const categoryLabels: Record<string, string> = Object.fromEntries(
  PALETTE_CATEGORIES.map(c => [c.key, c.label])
);

export function computePaletteGridLayout(entries: PaletteEntry[]): PaletteGridLayout {
  if (entries.length === 0) {
    return { gridTemplateColumns: 'auto', groupSpans: [], entryColumns: [], separators: [], dismissColumn: 1 };
  }

  // Build column types array: alternating 'button' and separator columns
  const colTypes: ('button' | 'sep' | 'group-sep')[] = [];
  const entryColumns: number[] = [];
  const groupSpans: GroupSpan[] = [];
  let prevCategory = '';

  for (const entry of entries) {
    if (entry.category !== prevCategory) {
      // New category group
      if (prevCategory !== '') {
        colTypes.push('group-sep'); // separator between groups
      }
      groupSpans.push({
        category: entry.category,
        label: categoryLabels[entry.category] ?? entry.category,
        start: colTypes.length + 1, // 1-based, will be the next button column
        end: 0, // filled in below
      });
      prevCategory = entry.category;
    } else {
      colTypes.push('sep'); // separator within group
    }
    colTypes.push('button');
    entryColumns.push(colTypes.length); // 1-based column index
    groupSpans[groupSpans.length - 1].end = colTypes.length + 1; // exclusive end
  }

  // Dismiss button: group-sep + button
  colTypes.push('group-sep');
  colTypes.push('button');
  const dismissColumn = colTypes.length;

  // Build separators list
  const separators: Separator[] = [];
  for (let i = 0; i < colTypes.length; i++) {
    if (colTypes[i] !== 'button') {
      separators.push({ column: i + 1, type: colTypes[i] as 'sep' | 'group-sep' });
    }
  }

  const gridTemplateColumns = colTypes
    .map(t => (t === 'button' ? 'auto' : '1px'))
    .join(' ');

  return { gridTemplateColumns, groupSpans, entryColumns, separators, dismissColumn };
}
