// Arrow element utilities

import type { ArrowElement, ArrowDirection } from './types';

// Speed normalization bounds (pixels)
const MIN_LENGTH = 50;
const MAX_LENGTH = 2000;

// Predefined direction labels for common sector counts (clockwise from right, screen Y-down)
const DIRECTION_LABELS: Record<number, string[]> = {
  4:  ['right', 'down', 'left', 'up'],
  8:  ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'],
  16: ['E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N', 'NNE', 'NE', 'ENE'],
};

export interface ArrowPropertiesOptions {
  /**
   * Number of direction sectors to divide the compass into.
   * Common values: 4, 8 (default), 16.
   * Any positive integer works — unlisted values return "sector-N".
   */
  sectors?: number;
}

export interface ArrowProperties {
  /**
   * Angle in radians from tail to head, in screen space (Y-axis down).
   * Range: (-π, π]. 0 = right, π/2 = down, ±π = left, -π/2 = up.
   */
  angleRadians: number;

  /** Same angle in degrees. Range: (-180, 180]. */
  angleDegrees: number;

  /**
   * Compass direction label. Granularity depends on the `sectors` option.
   * e.g. sectors=4 → 'right' | 'down' | 'left' | 'up'
   *      sectors=8 → 'right' | 'down-right' | ... (default)
   *      sectors=16 → 'E' | 'ESE' | 'SE' | ...
   */
  direction: ArrowDirection;

  /** Zero-based sector index (0 = right, increases clockwise). */
  sectorIndex: number;

  /**
   * Speed in [0, 1] proportional to arrow length.
   * 0 = shortest detectable arrow (~50px), 1 = longest (~2000px).
   */
  speed: number;

  /** Raw pixel length from tail to head. */
  length: number;

  /** Unit vector in the arrow's direction. x = cos(angle), y = sin(angle). */
  vector: { x: number; y: number };
}

/**
 * Derive angle, direction, and speed from an ArrowElement.
 *
 * All values are computed from the element's local tail/head coordinates
 * and are independent of the transform (position on canvas).
 *
 * @example
 * getArrowProperties(arrow)              // 8-way direction (default)
 * getArrowProperties(arrow, { sectors: 4 })   // 'right' | 'down' | 'left' | 'up'
 * getArrowProperties(arrow, { sectors: 16 })  // 16-point compass
 */
export function getArrowProperties(
  element: ArrowElement,
  options: ArrowPropertiesOptions = {},
): ArrowProperties {
  const sectors = options.sectors ?? 8;

  const dx = element.head.x - element.tail.x;
  const dy = element.head.y - element.tail.y;

  const length = Math.sqrt(dx * dx + dy * dy);
  const angleRadians = Math.atan2(dy, dx);
  const angleDegrees = angleRadians * (180 / Math.PI);

  const { sectorIndex, direction } = classifyDirection(angleRadians, sectors);

  // Normalize length to [0, 1]
  const speed = Math.max(0, Math.min(1, (length - MIN_LENGTH) / (MAX_LENGTH - MIN_LENGTH)));

  // Unit vector in the arrow's direction
  const vector = {
    x: Math.cos(angleRadians),
    y: Math.sin(angleRadians),
  };

  return { angleRadians, angleDegrees, direction, sectorIndex, speed, length, vector };
}

/**
 * Classify an angle into one of `sectors` equal compass sectors.
 * Sector 0 is centred on 0° (right), sectors increase clockwise (screen Y-down).
 */
function classifyDirection(
  angle: number,
  sectors: number,
): { sectorIndex: number; direction: ArrowDirection } {
  // Normalize angle to [0, 2π)
  const tau = 2 * Math.PI;
  const normalized = ((angle % tau) + tau) % tau;

  // Each sector spans 2π/sectors radians; offset by half a sector so sector 0
  // is centred on 0° (right) rather than starting at 0°.
  const sectorSize = tau / sectors;
  const sectorIndex = Math.floor((normalized + sectorSize / 2) % tau / sectorSize);

  const labels = DIRECTION_LABELS[sectors];
  const direction = labels ? labels[sectorIndex] : `sector-${sectorIndex}`;

  return { sectorIndex, direction };
}
