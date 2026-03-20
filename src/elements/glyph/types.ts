// GlyphElement: Text glyphs with transform

import type { TransformableElement } from '../../types/primitives';

export interface GlyphElement extends TransformableElement {
  type: 'glyph';
  text: string;
  fontFamily?: string;
  fontSize: number;
  fontWeight?: number;
  color: number;
}
