// Image element renderer
//
// Renders an image element on the canvas with LRU bitmap caching.

import type { ImageElement } from './types';
import type { BoundingBox } from '../../types/primitives';
import type { RenderOptions } from '../registry/ElementPlugin';

const MAX_IMAGE_CACHE_SIZE = 10;
const imageCache = new Map<string, HTMLImageElement>();

function getOrLoadImage(dataUrl: string): HTMLImageElement | null {
  if (!dataUrl) return null;

  const cached = imageCache.get(dataUrl);
  if (cached && cached.complete) {
    imageCache.delete(dataUrl);
    imageCache.set(dataUrl, cached);
    return cached;
  }

  if (!cached) {
    if (imageCache.size >= MAX_IMAGE_CACHE_SIZE) {
      const oldestKey = imageCache.keys().next().value;
      if (oldestKey !== undefined) {
        imageCache.delete(oldestKey);
      }
    }
    const img = new Image();
    img.src = dataUrl;
    imageCache.set(dataUrl, img);
    img.onerror = () => {
      console.warn('Failed to load image element bitmap');
      imageCache.delete(dataUrl);
    };
  }

  return null;
}

export function render(
  ctx: CanvasRenderingContext2D,
  element: ImageElement,
  _options?: RenderOptions
): void {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const { displayWidth, displayHeight } = element;

  ctx.save();
  ctx.translate(tx, ty);

  const img = getOrLoadImage(element.imageDataUrl);
  if (img) {
    ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
  } else {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, displayWidth, displayHeight);
    ctx.fillStyle = '#999';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loading...', displayWidth / 2, displayHeight / 2);
  }

  /* Light border */
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, displayWidth, displayHeight);

  ctx.restore();
}

export function getBounds(element: ImageElement): BoundingBox | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  return {
    left: tx,
    top: ty,
    right: tx + element.displayWidth,
    bottom: ty + element.displayHeight,
  };
}
