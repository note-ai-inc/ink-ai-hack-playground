// ArrowElement: A detected hand-drawn arrow

import type { Offset, TransformableElement } from '../../types/primitives';
import type { Stroke } from '../../types/brush';

/**
 * Compass direction label in screen space (Y increases downward).
 * The value depends on how many sectors were requested — see getArrowProperties.
 */
export type ArrowDirection = string;

export interface ArrowElement extends TransformableElement {
  type: 'arrow';
  /** Tail point in LOCAL coordinates (relative to transform origin) */
  tail: Offset;
  /** Head point (arrowhead end) in LOCAL coordinates */
  head: Offset;
  /** ARGB packed color */
  color: number;
  strokeWidth: number;

  /** Pixel distance from tail to head */
  length: number;
  /** Angle in radians: 0=right, π/2=down, -π/2=up, ±π=left */
  angleRadians: number;
  /** Same angle in degrees (-180, 180] */
  angleDegrees: number;
  /** 8-way compass direction label (screen space, Y-down) */
  direction: ArrowDirection;
  /** Normalised speed [0–1] based on length (0=50px, 1=2000px) */
  speed: number;

  sourceStrokes?: Stroke[];
}
