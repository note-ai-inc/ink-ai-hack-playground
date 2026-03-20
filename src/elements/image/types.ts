/*
 * ImageElement: User-uploaded image (from camera or gallery).
 *
 * TODO: imageDataUrl stores the full base64 inline, which means every
 * undo/redo snapshot carries a copy. Consider a content-addressable blob
 * store (hash → dataUrl) shared with SketchableImageElement.
 */

import type { BoundingBox } from '../../types/primitives';
import { generateId } from '../../types/primitives';
import type { TransformableElement } from '../../types/primitives';

export interface ImageElement extends TransformableElement {
  type: 'image';
  imageDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
}
export function createImageElement(
  bounds: BoundingBox,
  imageDataUrl: string,
  naturalWidth: number,
  naturalHeight: number,
  targetWidth?: number,
  targetHeight?: number,
  id?: string
): ImageElement {
  const rectWidth = Math.max(50, targetWidth ?? (bounds.right - bounds.left));
  const rectHeight = Math.max(50, targetHeight ?? (bounds.bottom - bounds.top));

  const aspectRatio = naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
  let displayWidth: number;
  let displayHeight: number;

  if (rectWidth / rectHeight > aspectRatio) {
    displayHeight = rectHeight;
    displayWidth = rectHeight * aspectRatio;
  } else {
    displayWidth = rectWidth;
    displayHeight = rectWidth / aspectRatio;
  }

  const offsetX = (rectWidth - displayWidth) / 2;
  const offsetY = (rectHeight - displayHeight) / 2;

  return {
    type: 'image',
    id: id ?? generateId(),
    transform: {
      values: [1, 0, 0, 0, 1, 0, bounds.left + offsetX, bounds.top + offsetY, 1],
    },
    imageDataUrl,
    naturalWidth,
    naturalHeight,
    displayWidth,
    displayHeight,
  };
}
