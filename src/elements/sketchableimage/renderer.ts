// SketchableImage element renderer
//
// Renders a 512x512 bitmap canvas with overlay strokes.
// Shows an orange border and circular spinner while AI generation is in progress.
// Cross-fades with a subtle bounce when a new image arrives.

import type { BoundingBox } from '../../types';
import type { SketchableImageElement } from './types';
import { SKETCHABLE_IMAGE_SIZE } from './types';
import { renderStrokes } from '../../canvas/StrokeRenderer';
import type { RenderOptions } from '../registry/ElementPlugin';

/*
 * Module-level LRU cache for loaded bitmap images.
 * Each entry holds a decoded HTMLImageElement keyed by data URL.
 * Capped to avoid unbounded memory growth during repeated AI refinements.
 */
const MAX_IMAGE_CACHE_SIZE = 10;
const imageCache = new Map<string, HTMLImageElement>();

function getOrLoadImage(dataUrl: string): HTMLImageElement | null {
  if (!dataUrl) return null;

  const cached = imageCache.get(dataUrl);
  if (cached && cached.complete) {
    /* Move to end for LRU ordering */
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
      console.warn('Failed to load sketchable image bitmap');
      imageCache.delete(dataUrl);
    };
  }

  return null;
}

/*
 * Pre-decode an image and add it to the cache. Call this before setting
 * bitmapDataUrl in state so the renderer finds a warm cache entry on the
 * next paint and avoids showing a blank white frame.
 */
export async function preloadImage(dataUrl: string): Promise<void> {
  if (!dataUrl) return;

  const existing = imageCache.get(dataUrl);
  if (existing && existing.complete) return;

  if (imageCache.size >= MAX_IMAGE_CACHE_SIZE) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey !== undefined) {
      imageCache.delete(oldestKey);
    }
  }

  const img = new Image();
  img.src = dataUrl;
  imageCache.set(dataUrl, img);
  await img.decode();
}

/* ── Transition animation state ────────────────────────────────────────── */

interface TransitionState {
  fromDataUrl: string;
  toDataUrl: string;
  startTime: number;
}

const TRANSITION_DURATION_MS = 800;
const BOUNCE_DEPTH = 0.03;

const lastKnownDataUrl = new Map<string, string>();
const activeTransitions = new Map<string, TransitionState>();

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function hasActiveTransitions(): boolean {
  return activeTransitions.size > 0;
}

/* ── Spinner ───────────────────────────────────────────────────────────── */

const SPINNER_RADIUS = 10;
const SPINNER_MARGIN = 16;
const SPINNER_LINE_WIDTH = 2.5;

function drawSpinner(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const angle = (performance.now() / 600) % (2 * Math.PI);
  const arcLength = Math.PI * 1.3;

  ctx.beginPath();
  ctx.arc(cx, cy, SPINNER_RADIUS, angle, angle + arcLength);
  ctx.strokeStyle = '#ff8c00';
  ctx.lineWidth = SPINNER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/* ── Bitmap drawing helpers ────────────────────────────────────────────── */

function drawBitmapOrWhite(
  ctx: CanvasRenderingContext2D,
  dataUrl: string,
  width: number,
  height: number
): void {
  const img = getOrLoadImage(dataUrl);
  if (img) {
    ctx.drawImage(img, 0, 0, width, height);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
}

/* ── Main render ───────────────────────────────────────────────────────── */

export function render(
  ctx: CanvasRenderingContext2D,
  element: SketchableImageElement,
  _options?: RenderOptions
): void {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const { scaleX, scaleY } = element;
  const width = SKETCHABLE_IMAGE_SIZE * scaleX;
  const height = SKETCHABLE_IMAGE_SIZE * scaleY;

  /*
   * Detect when bitmapDataUrl changes to a non-empty value and kick off
   * a cross-fade + bounce transition.
   */
  const prevUrl = lastKnownDataUrl.get(element.id);
  if (prevUrl !== undefined && element.bitmapDataUrl && prevUrl !== element.bitmapDataUrl) {
    activeTransitions.set(element.id, {
      fromDataUrl: prevUrl,
      toDataUrl: element.bitmapDataUrl,
      startTime: performance.now(),
    });
  }
  lastKnownDataUrl.set(element.id, element.bitmapDataUrl);

  const transition = activeTransitions.get(element.id);
  let transitionProgress = -1;

  if (transition) {
    const elapsed = performance.now() - transition.startTime;
    transitionProgress = Math.min(elapsed / TRANSITION_DURATION_MS, 1);
    if (transitionProgress >= 1) {
      activeTransitions.delete(element.id);
    }
  }

  ctx.save();
  ctx.translate(tx, ty);

  /* Apply bounce scale centered on element during transition */
  if (transitionProgress >= 0 && transitionProgress < 1) {
    const bounce = 1 - BOUNCE_DEPTH * Math.sin(transitionProgress * Math.PI);
    ctx.translate(width / 2, height / 2);
    ctx.scale(bounce, bounce);
    ctx.translate(-width / 2, -height / 2);
  }

  /* Draw bitmap content (cross-fade or normal) */
  if (transitionProgress >= 0 && transitionProgress < 1) {
    const alpha = easeOutCubic(transitionProgress);

    /* Old image fading out */
    ctx.globalAlpha = 1 - alpha;
    drawBitmapOrWhite(ctx, transition!.fromDataUrl, width, height);

    /* New image fading in */
    ctx.globalAlpha = alpha;
    drawBitmapOrWhite(ctx, transition!.toDataUrl, width, height);

    ctx.globalAlpha = 1;
  } else {
    drawBitmapOrWhite(ctx, element.bitmapDataUrl, width, height);
  }

  /* Draw border */
  if (element.isGenerating) {
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 3;
  } else {
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
  }
  ctx.strokeRect(0, 0, width, height);

  /* Draw only visible (not-yet-consumed) overlay strokes */
  if (element.overlayStrokes.length > element.hiddenStrokeCount) {
    ctx.save();
    ctx.scale(scaleX, scaleY);
    renderStrokes(ctx, element.overlayStrokes.slice(element.hiddenStrokeCount));
    ctx.restore();
  }

  /* Draw spinner in the top-right corner while generating */
  if (element.isGenerating) {
    drawSpinner(ctx, width - SPINNER_MARGIN, SPINNER_MARGIN);
  }

  ctx.restore();
}

export function getBounds(element: SketchableImageElement): BoundingBox | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  return {
    left: tx,
    top: ty,
    right: tx + SKETCHABLE_IMAGE_SIZE * element.scaleX,
    bottom: ty + SKETCHABLE_IMAGE_SIZE * element.scaleY,
  };
}
