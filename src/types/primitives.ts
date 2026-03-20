// Primitives matching the protobuf schema

export interface Offset {
  x: number;
  y: number;
}

export interface Quad {
  topLeft: Offset;
  topRight: Offset;
  bottomRight: Offset;
  bottomLeft: Offset;
}

// 3x3 affine transformation matrix (column-major, like Android Matrix)
// [scaleX, skewY, transX]
// [skewX, scaleY, transY]
// [persp0, persp1, persp2]
export interface Matrix {
  values: [number, number, number, number, number, number, number, number, number];
}

export const IDENTITY_MATRIX: Matrix = {
  values: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};

export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Helper functions for primitives
export function offsetDistance(a: Offset, b: Offset): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function boundingBoxFromOffsets(offsets: Offset[]): BoundingBox | null {
  if (offsets.length === 0) return null;

  let left = offsets[0].x;
  let top = offsets[0].y;
  let right = offsets[0].x;
  let bottom = offsets[0].y;

  for (const offset of offsets) {
    left = Math.min(left, offset.x);
    top = Math.min(top, offset.y);
    right = Math.max(right, offset.x);
    bottom = Math.max(bottom, offset.y);
  }

  return { left, top, right, bottom };
}

export function boundingBoxWidth(box: BoundingBox): number {
  return box.right - box.left;
}

export function boundingBoxHeight(box: BoundingBox): number {
  return box.bottom - box.top;
}

export function boundingBoxCenter(box: BoundingBox): Offset {
  return {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2,
  };
}

export function expandBoundingBox(box: BoundingBox, amount: number): BoundingBox {
  return {
    left: box.left - amount,
    top: box.top - amount,
    right: box.right + amount,
    bottom: box.bottom + amount,
  };
}

export function boundingBoxContainsPoint(box: BoundingBox, point: Offset): boolean {
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

export function boundingBoxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
}

export function mergeBoundingBoxes(boxes: BoundingBox[]): BoundingBox | null {
  if (boxes.length === 0) return null;

  let left = boxes[0].left;
  let top = boxes[0].top;
  let right = boxes[0].right;
  let bottom = boxes[0].bottom;

  for (const box of boxes) {
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }

  return { left, top, right, bottom };
}

// Matrix operations
export function applyMatrix(matrix: Matrix, point: Offset): Offset {
  // Column-major: [scaleX, skewX, persp0, skewY, scaleY, persp1, transX, transY, persp2]
  const v = matrix.values;
  return {
    x: v[0] * point.x + v[3] * point.y + v[6],
    y: v[1] * point.x + v[4] * point.y + v[7],
  };
}

export function multiplyMatrices(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1, g1, h1, i1] = m1.values;
  const [a2, b2, c2, d2, e2, f2, g2, h2, i2] = m2.values;

  return {
    values: [
      a1 * a2 + c1 * b2 + e1 * g2,
      b1 * a2 + d1 * b2 + f1 * g2,
      a1 * c2 + c1 * d2 + e1 * h2,
      b1 * c2 + d1 * d2 + f1 * h2,
      a1 * e2 + c1 * f2 + e1 * i2,
      b1 * e2 + d1 * f2 + f1 * i2,
      g1 * a2 + h1 * b2 + i1 * g2,
      g1 * c2 + h1 * d2 + i1 * h2,
      g1 * e2 + h1 * f2 + i1 * i2,
    ],
  };
}

export function createTranslationMatrix(tx: number, ty: number): Matrix {
  return {
    values: [1, 0, 0, 0, 1, 0, tx, ty, 1],
  };
}

export function createScaleMatrix(sx: number, sy: number): Matrix {
  return {
    values: [sx, 0, 0, 0, sy, 0, 0, 0, 1],
  };
}

export function createRotationMatrix(angleRadians: number): Matrix {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  return {
    values: [cos, sin, 0, -sin, cos, 0, 0, 0, 1],
  };
}

// Base element properties shared by transformed elements
export interface TransformableElement {
  id: string;
  transform: Matrix;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
