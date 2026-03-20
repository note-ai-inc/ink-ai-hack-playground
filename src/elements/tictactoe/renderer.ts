// TicTacToe element renderer

import type { BoundingBox, Quad } from '../../types';
import type { TicTacToeElement } from './types';
import { TicTacToePiece, TicTacToeGameState } from './types';
import { renderStrokes } from '../../canvas/StrokeRenderer';
import type { RenderOptions } from '../registry/ElementPlugin';

/* ── CPU move draw-in animation ──────────────────────────────────────── */

const DRAW_DURATION_MS = 350;
const activeCpuAnimations = new Set<string>();

const LETS_PLAY_DELAY_MS = 500;
const LETS_PLAY_FADE_IN_MS = 800;
const LETS_PLAY_HOLD_MS = 1200;
const LETS_PLAY_FADE_OUT_MS = 800;
const LETS_PLAY_TOTAL_MS = LETS_PLAY_DELAY_MS + LETS_PLAY_FADE_IN_MS + LETS_PLAY_HOLD_MS + LETS_PLAY_FADE_OUT_MS;
/*
 * TODO: These maps are cleaned up when a board transitions from empty to non-empty,
 * but entries will linger if an element is deleted while still empty. A global
 * element-removal hook could address this if it becomes a practical concern.
 */
const letsPlayStartTimes = new Map<string, number>();
const activeLetsPlayAnimations = new Set<string>();

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function hasActiveTicTacToeAnimations(): boolean {
  return activeCpuAnimations.size > 0 || activeLetsPlayAnimations.size > 0;
}

/**
 * Compute animation progress for a CPU move.
 * Returns -1 during the random delay (piece hidden),
 * 0..1 during draw-in, or 2 when fully complete.
 */
function getCpuDrawProgress(element: TicTacToeElement): number {
  if (element.cpuMoveTimestamp === undefined) return 2;
  const now = performance.now();
  if (now < element.cpuMoveTimestamp) return -1;
  const elapsed = now - element.cpuMoveTimestamp;
  if (elapsed >= DRAW_DURATION_MS) return 2;
  return easeOutCubic(elapsed / DRAW_DURATION_MS);
}

/* ── Main render ─────────────────────────────────────────────────────── */

export function render(
  ctx: CanvasRenderingContext2D,
  element: TicTacToeElement,
  options?: RenderOptions
): void {
  renderStrokes(ctx, element.gridStrokes, options?.strokeOptions);

  const cpuProgress = getCpuDrawProgress(element);
  const cpuAnimating = cpuProgress < 2;

  if (cpuAnimating) {
    activeCpuAnimations.add(element.id);
  } else {
    activeCpuAnimations.delete(element.id);
  }

  for (let i = 0; i < element.cells.length; i++) {
    const cell = element.cells[i];
    if (cell.piece === TicTacToePiece.EMPTY) continue;

    const isHumanPiece = cell.pieceStrokes && cell.pieceStrokes.length > 0;
    const isCpuAnimatingCell = cpuAnimating && i === element.cpuMoveCellIndex;

    if (isHumanPiece) {
      renderStrokes(ctx, cell.pieceStrokes!, options?.strokeOptions);
    } else if (isCpuAnimatingCell) {
      if (cpuProgress >= 0) {
        if (cell.piece === TicTacToePiece.X) {
          renderAnimatedX(ctx, cell.quad, cpuProgress);
        } else {
          renderAnimatedO(ctx, cell.quad, cpuProgress);
        }
      }
    } else {
      if (cell.piece === TicTacToePiece.X) {
        renderGeneratedX(ctx, cell.quad);
      } else {
        renderGeneratedO(ctx, cell.quad);
      }
    }
  }

  if (element.gameState !== TicTacToeGameState.PLAYING && !cpuAnimating) {
    renderGameStateOverlay(ctx, element);
  }

  const allEmpty = element.cells.every(c => c.piece === TicTacToePiece.EMPTY);
  if (allEmpty && element.gameState === TicTacToeGameState.PLAYING) {
    renderLetsPlayOverlay(ctx, element);
  } else {
    /* Board is no longer fresh — clean up any lingering animation state */
    letsPlayStartTimes.delete(element.id);
    activeLetsPlayAnimations.delete(element.id);
  }
}

/* ── Static piece renderers ──────────────────────────────────────────── */

function renderGeneratedX(ctx: CanvasRenderingContext2D, quad: Quad): void {
  const padding = 0.2;
  const p1 = interpolateQuad(quad, padding, padding);
  const p2 = interpolateQuad(quad, 1 - padding, padding);
  const p3 = interpolateQuad(quad, 1 - padding, 1 - padding);
  const p4 = interpolateQuad(quad, padding, 1 - padding);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(p2.x, p2.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.stroke();
}

function renderGeneratedO(ctx: CanvasRenderingContext2D, quad: Quad): void {
  const center = getQuadCenter(quad);
  const size = Math.min(getQuadWidth(quad), getQuadHeight(quad));
  const radius = size * 0.35;

  ctx.strokeStyle = '#0066cc';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

/* ── Animated piece renderers ────────────────────────────────────────── */

/**
 * Draw X progressively: first diagonal 0-45%, pause, second diagonal 55-100%.
 */
function renderAnimatedX(ctx: CanvasRenderingContext2D, quad: Quad, progress: number): void {
  const padding = 0.2;
  const p1 = interpolateQuad(quad, padding, padding);
  const p2 = interpolateQuad(quad, 1 - padding, padding);
  const p3 = interpolateQuad(quad, 1 - padding, 1 - padding);
  const p4 = interpolateQuad(quad, padding, 1 - padding);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  /* First diagonal: top-left → bottom-right (progress 0..0.45) */
  const line1 = Math.min(progress / 0.45, 1);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(
    p1.x + (p3.x - p1.x) * line1,
    p1.y + (p3.y - p1.y) * line1,
  );
  ctx.stroke();

  /* Second diagonal: top-right → bottom-left (progress 0.55..1) */
  if (progress > 0.55) {
    const line2 = Math.min((progress - 0.55) / 0.45, 1);
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(
      p2.x + (p4.x - p2.x) * line2,
      p2.y + (p4.y - p2.y) * line2,
    );
    ctx.stroke();
  }
}

/**
 * Draw O progressively: arc sweeps from 0 to 2π.
 */
function renderAnimatedO(ctx: CanvasRenderingContext2D, quad: Quad, progress: number): void {
  const center = getQuadCenter(quad);
  const size = Math.min(getQuadWidth(quad), getQuadHeight(quad));
  const radius = size * 0.35;

  ctx.strokeStyle = '#0066cc';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2 * progress);
  ctx.stroke();
}

/* ── Game state overlay ──────────────────────────────────────────────── */

function renderGameStateOverlay(ctx: CanvasRenderingContext2D, element: TicTacToeElement): void {
  const bounds = getBounds(element);
  if (!bounds) return;

  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;

  const humanPiece = element.humanPiece ?? TicTacToePiece.X;

  let text = '';
  let color = '';

  switch (element.gameState) {
    case TicTacToeGameState.X_WINS:
      if (humanPiece === TicTacToePiece.X) {
        text = 'You Win!';
        color = '#00aa00';
      } else {
        text = 'Computer Wins';
        color = '#cc0000';
      }
      break;
    case TicTacToeGameState.O_WINS:
      if (humanPiece === TicTacToePiece.O) {
        text = 'You Win!';
        color = '#00aa00';
      } else {
        text = 'Computer Wins';
        color = '#cc0000';
      }
      break;
    case TicTacToeGameState.TIE:
      text = 'Tie Game';
      color = '#666666';
      break;
  }

  if (text) {
    const boardWidth = bounds.right - bounds.left;
    const fontSize = computeFontSize(ctx, text, boardWidth * 0.6);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(bounds.left, centerY - fontSize * 0.7, boardWidth, fontSize * 1.4);

    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centerX, centerY);
  }
}

/* ── "Let's Play" overlay for fresh boards ─────────────────────────── */

function getLetsPlayOpacity(element: TicTacToeElement): number {
  if (!letsPlayStartTimes.has(element.id)) {
    letsPlayStartTimes.set(element.id, performance.now());
  }

  const elapsed = performance.now() - letsPlayStartTimes.get(element.id)!;

  if (elapsed >= LETS_PLAY_TOTAL_MS) {
    activeLetsPlayAnimations.delete(element.id);
    letsPlayStartTimes.delete(element.id);
    return 0;
  }

  activeLetsPlayAnimations.add(element.id);

  if (elapsed < LETS_PLAY_DELAY_MS) {
    return 0;
  }
  const active = elapsed - LETS_PLAY_DELAY_MS;
  if (active < LETS_PLAY_FADE_IN_MS) {
    return easeOutCubic(active / LETS_PLAY_FADE_IN_MS);
  }
  if (active < LETS_PLAY_FADE_IN_MS + LETS_PLAY_HOLD_MS) {
    return 1;
  }
  const fadeOutElapsed = active - LETS_PLAY_FADE_IN_MS - LETS_PLAY_HOLD_MS;
  return 1 - easeOutCubic(fadeOutElapsed / LETS_PLAY_FADE_OUT_MS);
}

function renderLetsPlayOverlay(ctx: CanvasRenderingContext2D, element: TicTacToeElement): void {
  const opacity = getLetsPlayOpacity(element);
  if (opacity <= 0) return;

  const bounds = getBounds(element);
  if (!bounds) return;

  const boardWidth = bounds.right - bounds.left;
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;

  const text = "Let's Play!";
  const fontSize = computeFontSize(ctx, text, boardWidth * 0.8);

  ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * opacity})`;
  ctx.fillRect(bounds.left, centerY - fontSize * 0.7, boardWidth, fontSize * 1.4);

  ctx.fillStyle = `rgba(0, 102, 204, ${opacity})`;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, centerX, centerY);
}

/* ── Shared text helpers ────────────────────────────────────────────── */

function computeFontSize(ctx: CanvasRenderingContext2D, text: string, targetWidth: number): number {
  const trialSize = 24;
  ctx.font = `bold ${trialSize}px sans-serif`;
  const measured = ctx.measureText(text);
  if (measured.width === 0) return trialSize;
  return Math.round(trialSize * (targetWidth / measured.width));
}

/* ── Bounds ───────────────────────────────────────────────────────────── */

export function getBounds(element: TicTacToeElement): BoundingBox | null {
  if (element.cells.length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const cell of element.cells) {
    const points = [cell.quad.topLeft, cell.quad.topRight, cell.quad.bottomRight, cell.quad.bottomLeft];
    for (const p of points) {
      left = Math.min(left, p.x);
      top = Math.min(top, p.y);
      right = Math.max(right, p.x);
      bottom = Math.max(bottom, p.y);
    }
  }

  return { left, top, right, bottom };
}

/* ── Geometry helpers ────────────────────────────────────────────────── */

function getQuadCenter(quad: Quad): { x: number; y: number } {
  return {
    x: (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4,
    y: (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4,
  };
}

function getQuadWidth(quad: Quad): number {
  const topWidth = Math.sqrt(
    (quad.topRight.x - quad.topLeft.x) ** 2 + (quad.topRight.y - quad.topLeft.y) ** 2
  );
  const bottomWidth = Math.sqrt(
    (quad.bottomRight.x - quad.bottomLeft.x) ** 2 + (quad.bottomRight.y - quad.bottomLeft.y) ** 2
  );
  return (topWidth + bottomWidth) / 2;
}

function getQuadHeight(quad: Quad): number {
  const leftHeight = Math.sqrt(
    (quad.bottomLeft.x - quad.topLeft.x) ** 2 + (quad.bottomLeft.y - quad.topLeft.y) ** 2
  );
  const rightHeight = Math.sqrt(
    (quad.bottomRight.x - quad.topRight.x) ** 2 + (quad.bottomRight.y - quad.topRight.y) ** 2
  );
  return (leftHeight + rightHeight) / 2;
}

function interpolateQuad(quad: Quad, u: number, v: number): { x: number; y: number } {
  const top = {
    x: quad.topLeft.x + (quad.topRight.x - quad.topLeft.x) * u,
    y: quad.topLeft.y + (quad.topRight.y - quad.topLeft.y) * u,
  };
  const bottom = {
    x: quad.bottomLeft.x + (quad.bottomRight.x - quad.bottomLeft.x) * u,
    y: quad.bottomLeft.y + (quad.bottomRight.y - quad.bottomLeft.y) * u,
  };
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v,
  };
}
