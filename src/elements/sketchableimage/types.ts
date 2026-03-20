/*
 * SketchableImageElement: AI-assisted sketch canvas.
 *
 * TODO: bitmapDataUrl stores the full base64 PNG inline, which means every
 * undo/redo snapshot carries a copy (~300KB–1MB each). Consider a content-
 * addressable blob store (hash → dataUrl) with only the hash in state.
 */

import type { TransformableElement } from '../../types/primitives';
import { generateId } from '../../types/primitives';
import type { Stroke } from '../../types/brush';

export const SKETCHABLE_IMAGE_SIZE = 512;

export interface SketchableImageElement extends TransformableElement {
  type: 'sketchableImage';
  bitmapDataUrl: string;
  overlayStrokes: Stroke[];
  hiddenStrokeCount: number;
  scaleX: number;
  scaleY: number;
  isGenerating: boolean;
}
export function createSketchableImageElement(
  canvasX: number,
  canvasY: number,
  id?: string
): SketchableImageElement {
  return {
    type: 'sketchableImage',
    id: id ?? generateId(),
    transform: {
      values: [1, 0, 0, 0, 1, 0, canvasX, canvasY, 1],
    },
    bitmapDataUrl: '',
    overlayStrokes: [],
    hiddenStrokeCount: 0,
    scaleX: 1,
    scaleY: 1,
    isGenerating: false,
  };
}
