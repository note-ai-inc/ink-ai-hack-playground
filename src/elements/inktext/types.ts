// InkTextElement: Recognized handwriting with tokens

import type { Quad } from '../../types/primitives';
import type { TransformableElement } from '../../types/primitives';
import type { Stroke } from '../../types/brush';

export interface InkTextToken {
  text: string;
  quad: Quad; // Bounding quad for this token
  strokeIndices: number[]; // Indices into sourceStrokes
  baseline?: number; // Y position of text baseline
  confidence?: number;
}

export interface InkTextLine {
  tokens: InkTextToken[];
  baseline: number;
}

export interface InkTextElement extends TransformableElement {
  type: 'inkText';
  lines: InkTextLine[];
  sourceStrokes: Stroke[];
  layoutWidth?: number; // Width for text wrapping
  writingAngle?: number; // Estimated writing angle in radians
}
