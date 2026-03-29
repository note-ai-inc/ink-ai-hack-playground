// Pure functions for applying transforms to elements

import type { Element } from '../types';
import type { Vector2 } from './TransformOperation';

/**
 * Translate an element by a displacement vector.
 * - Stroke elements: translate all input points
 * - Transformable elements: update transform matrix translation
 */
export function translateElement(element: Element, displacement: Vector2): Element {
  if (displacement.x === 0 && displacement.y === 0) return element;

  if (element.type === 'stroke') {
    return {
      ...element,
      strokes: element.strokes.map(stroke => ({
        ...stroke,
        inputs: {
          ...stroke.inputs,
          inputs: stroke.inputs.inputs.map(input => ({
            ...input,
            x: input.x + displacement.x,
            y: input.y + displacement.y,
          })),
        },
      })),
    };
  } else {
    const values = [...element.transform.values] as [number, number, number, number, number, number, number, number, number];
    values[6] += displacement.x;
    values[7] += displacement.y;
    return {
      ...element,
      transform: { values },
    };
  }
}
