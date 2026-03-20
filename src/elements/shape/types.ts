// ShapeElement: Vector shapes with transform

import type { Offset } from '../../types/primitives';
import type { TransformableElement } from '../../types/primitives';
import type { Stroke } from '../../types/brush';

export interface ShapePathCommand {
  type: 'moveTo' | 'lineTo' | 'quadTo' | 'cubicTo' | 'close';
  points?: Offset[];
}

export interface ShapePath {
  commands: ShapePathCommand[];
  fillColor?: number;
  strokeColor?: number;
  strokeWidth?: number;
}

export interface ShapeElement extends TransformableElement {
  type: 'shape';
  paths: ShapePath[];
  sourceStrokes?: Stroke[]; // Original strokes that were beautified into this shape
}
