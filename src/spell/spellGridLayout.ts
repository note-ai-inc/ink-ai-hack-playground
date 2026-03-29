// Pure helper that computes CSS grid positions for the spell menu.
//
// Like paletteGridLayout but uses spell-specific categories and entry type.

import type { SpellEntry } from './SpellEntry';
import { SPELL_CATEGORIES } from './SpellEntry';

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

export interface SpellGridLayout {
  gridTemplateColumns: string;
  groupSpans: GroupSpan[];
  entryColumns: number[];   // 1-based CSS grid column per entry
  separators: Separator[];
}

const categoryLabels: Record<string, string> = Object.fromEntries(
  SPELL_CATEGORIES.map(c => [c.key, c.label])
);

export function computeSpellGridLayout(entries: SpellEntry[]): SpellGridLayout {
  if (entries.length === 0) {
    return { gridTemplateColumns: 'auto', groupSpans: [], entryColumns: [], separators: [] };
  }

  const colTypes: ('button' | 'sep' | 'group-sep')[] = [];
  const entryColumns: number[] = [];
  const groupSpans: GroupSpan[] = [];
  let prevCategory = '';

  for (const entry of entries) {
    if (entry.category !== prevCategory) {
      if (prevCategory !== '') {
        colTypes.push('group-sep');
      }
      groupSpans.push({
        category: entry.category,
        label: categoryLabels[entry.category] ?? entry.category,
        start: colTypes.length + 1,
        end: 0,
      });
      prevCategory = entry.category;
    } else {
      colTypes.push('sep');
    }
    colTypes.push('button');
    entryColumns.push(colTypes.length);
    groupSpans[groupSpans.length - 1].end = colTypes.length + 1;
  }

  const separators: Separator[] = [];
  for (let i = 0; i < colTypes.length; i++) {
    if (colTypes[i] !== 'button') {
      separators.push({ column: i + 1, type: colTypes[i] as 'sep' | 'group-sep' });
    }
  }

  const gridTemplateColumns = colTypes
    .map(t => (t === 'button' ? 'auto' : '1px'))
    .join(' ');

  return { gridTemplateColumns, groupSpans, entryColumns, separators };
}
