// StrokeElement type definitions

import type { Stroke } from '../../types/brush';
import { generateId } from '../../types/primitives';

// StrokeElement: Raw ink strokes (no transform, strokes are in absolute coordinates)
export interface StrokeElement {
  type: 'stroke';
  id: string;
  strokes: Stroke[];
}
export function createStrokeElement(strokes: Stroke[], id?: string): StrokeElement {
  return {
    type: 'stroke',
    id: id ?? generateId(),
    strokes,
  };
}
