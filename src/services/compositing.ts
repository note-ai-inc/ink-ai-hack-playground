/**
 * Compositing utilities for SketchableImage.
 *
 * Renders overlay strokes onto a white canvas and returns a data URL
 * suitable for sending to the image generation API.
 */

import type { Stroke } from '../types';
import { SKETCHABLE_IMAGE_SIZE } from '../elements/sketchableimage/types';
import { renderStrokes } from '../canvas/StrokeRenderer';
import { computeConcaveHull } from '../geometry/concaveHull';
import type { Offset } from '../types/primitives';

function createBlankCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SKETCHABLE_IMAGE_SIZE;
  canvas.height = SKETCHABLE_IMAGE_SIZE;
  return canvas;
}

export function compositeStrokesOnWhite(overlayStrokes: Stroke[]): string {
  const canvas = createBlankCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context for compositing');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SKETCHABLE_IMAGE_SIZE, SKETCHABLE_IMAGE_SIZE);

  if (overlayStrokes.length > 0) {
    renderStrokes(ctx, overlayStrokes);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Padding (px) added around the concave hull to give the filled shape
 * some breathing room beyond the raw stroke points.
 */
const HULL_PADDING = 8;

/**
 * Loads a base image data URL onto the canvas, renders color-matched
 * concave-hull fills for each stroke, and returns the composited
 * result as a data URL.
 * Used by the "composite" refinement strategy.
 */
export async function compositeStrokesOnImage(
  baseImageDataUrl: string,
  overlayStrokes: Stroke[]
): Promise<string> {
  const baseImg = await loadImage(baseImageDataUrl);

  const canvas = createBlankCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context for compositing');

  ctx.drawImage(baseImg, 0, 0, SKETCHABLE_IMAGE_SIZE, SKETCHABLE_IMAGE_SIZE);

  /*
   * Snapshot the base image once for color sampling. Overlapping strokes
   * will all sample from the original image, not from progressively-filled
   * results. This is intentional for consistency.
   */
  const baseImageData = ctx.getImageData(0, 0, SKETCHABLE_IMAGE_SIZE, SKETCHABLE_IMAGE_SIZE);

  for (const stroke of overlayStrokes) {
    const points: Offset[] = stroke.inputs.inputs.map(i => ({ x: i.x, y: i.y }));
    if (points.length < 2) continue;

    const avgColor = sampleAverageColor(baseImageData, points);

    const hull = computeConcaveHull(points, { concavity: 2 });
    if (hull && hull.length >= 3) {
      const padded = padHull(hull, HULL_PADDING);
      ctx.fillStyle = avgColor;
      ctx.beginPath();
      ctx.moveTo(padded[0].x, padded[0].y);
      for (let i = 1; i < padded.length; i++) {
        ctx.lineTo(padded[i].x, padded[i].y);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      renderStrokes(ctx, [stroke], {
        colorOverride: avgColor,
        sizeMultiplier: 4,
      });
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Sample the average color from the base image underneath a set of points.
 * Returns a CSS rgb() string.
 */
function sampleAverageColor(imageData: ImageData, points: Offset[]): string {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  const { width, height, data } = imageData;

  for (const p of points) {
    const px = Math.round(Math.max(0, Math.min(width - 1, p.x)));
    const py = Math.round(Math.max(0, Math.min(height - 1, p.y)));
    const idx = (py * width + px) * 4;
    rSum += data[idx];
    gSum += data[idx + 1];
    bSum += data[idx + 2];
    count++;
  }

  if (count === 0) return 'rgb(128,128,128)';
  const r = Math.round(rSum / count);
  const g = Math.round(gSum / count);
  const b = Math.round(bSum / count);
  return `rgb(${r},${g},${b})`;
}

/**
 * Expand a hull outward by `padding` pixels from its centroid.
 * Approximation: expands each vertex radially from the centroid.
 * Works well for roughly convex hulls but may produce artifacts
 * for highly concave shapes.
 */
function padHull(hull: Offset[], padding: number): Offset[] {
  let cx = 0, cy = 0;
  for (const p of hull) { cx += p.x; cy += p.y; }
  cx /= hull.length;
  cy /= hull.length;

  return hull.map(p => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return p;
    const scale = (dist + padding) / dist;
    return { x: cx + dx * scale, y: cy + dy * scale };
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load base image for compositing'));
    img.src = dataUrl;
  });
}
