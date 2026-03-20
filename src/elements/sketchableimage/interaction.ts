// SketchableImage interaction — captures ink strokes drawn over the element
//
// Strokes arrive in canvas coordinates and are transformed to local
// coordinates (0–512 range) before being appended to overlayStrokes.

import type { Stroke, BoundingBox } from '../../types';
import type { SketchableImageElement } from './types';
import { SKETCHABLE_IMAGE_SIZE } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import { boundingBoxesIntersect } from '../../types/primitives';

export function isInterestedIn(
  element: SketchableImageElement,
  strokes: Stroke[],
  strokeBounds: BoundingBox
): boolean {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const right = tx + SKETCHABLE_IMAGE_SIZE * element.scaleX;
  const bottom = ty + SKETCHABLE_IMAGE_SIZE * element.scaleY;
  const elementBounds: BoundingBox = { left: tx, top: ty, right, bottom };

  if (!boundingBoxesIntersect(elementBounds, strokeBounds)) {
    return false;
  }

  /*
   * Require the stroke centroid to be inside the element so that strokes
   * merely grazing the edge are not captured.
   */
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const stroke of strokes) {
    for (const input of stroke.inputs.inputs) {
      sumX += input.x;
      sumY += input.y;
      count++;
    }
  }
  if (count === 0) return false;
  const cx = sumX / count;
  const cy = sumY / count;
  return cx >= tx && cx <= right && cy >= ty && cy <= bottom;
}

export async function acceptInk(
  element: SketchableImageElement,
  strokes: Stroke[]
): Promise<InteractionResult> {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const { scaleX, scaleY } = element;

  const localStrokes = strokes.map(stroke => ({
    ...stroke,
    inputs: {
      ...stroke.inputs,
      inputs: stroke.inputs.inputs.map(input => ({
        ...input,
        x: (input.x - tx) / scaleX,
        y: (input.y - ty) / scaleY,
      })),
    },
  }));

  const newElement: SketchableImageElement = {
    ...element,
    overlayStrokes: [...element.overlayStrokes, ...localStrokes],
  };

  return {
    element: newElement,
    consumed: true,
    strokesConsumed: strokes,
  };
}
