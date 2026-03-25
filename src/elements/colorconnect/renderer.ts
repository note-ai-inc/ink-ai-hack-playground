// Color Connect renderer
//
// Draws: background, circle outline, connection paths (thick colored curves),
// colored dots (on perimeter and inside), crossing indicators,
// level display, reset button, generating state, and completion overlay.

import type { BoundingBox } from '../../types';
import type { ColorConnectElement } from './types';
import { PAIR_COLORS } from './types';
import type { RenderOptions } from '../registry/ElementPlugin';
import { getDotPosition, getCircleLayout, getInvalidColors, RESET_BUTTON } from './gameState';

const CANVAS_GRID_SIZE = 50;
const BG_FILL = 'rgba(240, 240, 245, 0.35)';
const BORDER_COLOR = '#333333';
const BORDER_WIDTH = 2.5;
const CIRCLE_COLOR = '#999999';
const CIRCLE_WIDTH = 2.5;
const DOT_RADIUS = 16;
const DOT_BORDER_WIDTH = 3;
const DOT_BORDER_COLOR = '#222222';
const CONNECTION_WIDTH = 8;
const CROSSING_CONNECTION_WIDTH = 6;
const TITLE_COLOR = '#0a1b65';
const TITLE_FONT = 'bold 18px sans-serif';
const LEVEL_FONT = 'bold 14px sans-serif';
const LEVEL_COLOR = '#666666';
const COMPLETION_BG = 'rgba(255, 255, 255, 0.88)';
const COMPLETION_TEXT_COLOR = '#0a1b65';
const GENERATING_COLOR = '#888888';
const RESET_COLOR = '#888888';

export function render(
  ctx: CanvasRenderingContext2D,
  element: ColorConnectElement,
  _options?: RenderOptions,
): void {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  ctx.save();
  ctx.translate(tx, ty);

  drawBackground(ctx, element);
  drawTitle(ctx, element);
  drawResetButton(ctx, element);

  if (element.gameState.isGenerating) {
    drawGeneratingState(ctx, element);
  } else {
    drawCircle(ctx, element);
    drawConnections(ctx, element);
    drawDots(ctx, element);
  }

  drawBorder(ctx, element);
  drawCompletionOverlay(ctx, element);

  ctx.restore();
}

function gridHighlightRect(element: ColorConnectElement): { x: number; y: number; w: number; h: number } {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  const g = CANVAS_GRID_SIZE;
  const startCol = Math.floor(tx / g);
  const startRow = Math.floor(ty / g);
  const endCol = Math.ceil((tx + element.width) / g);
  const endRow = Math.ceil((ty + element.height) / g);
  return {
    x: startCol * g - tx,
    y: startRow * g - ty,
    w: (endCol - startCol) * g,
    h: (endRow - startRow) * g,
  };
}

function drawBackground(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const { x, y, w, h } = gridHighlightRect(element);
  ctx.fillStyle = BG_FILL;
  ctx.fillRect(x, y, w, h);
}

function drawBorder(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const { x, y, w, h } = gridHighlightRect(element);
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = BORDER_WIDTH;
  ctx.strokeRect(x, y, w, h);
}

function drawTitle(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const { level } = element.gameState;

  // Title
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = TITLE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Color Connect', element.width / 2, 8);

  // Level badge
  ctx.fillStyle = LEVEL_COLOR;
  ctx.font = LEVEL_FONT;
  ctx.textAlign = 'left';
  ctx.fillText(`Level ${level}`, 10, 12);
}

function drawResetButton(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const bx = element.width + RESET_BUTTON.x;
  const by = RESET_BUTTON.y;
  const s = RESET_BUTTON.size;
  const cx = bx + s / 2;
  const cy = by + s / 2;

  ctx.strokeStyle = RESET_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.35, -Math.PI * 0.8, Math.PI * 0.6);
  ctx.stroke();

  // Arrow head
  const arrowAngle = Math.PI * 0.6;
  const arrowR = s * 0.35;
  const ax = cx + arrowR * Math.cos(arrowAngle);
  const ay = cy + arrowR * Math.sin(arrowAngle);
  ctx.beginPath();
  ctx.moveTo(ax - 4, ay - 3);
  ctx.lineTo(ax, ay);
  ctx.lineTo(ax + 4, ay - 2);
  ctx.stroke();
}

function drawGeneratingState(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const cx = element.width / 2;
  const cy = element.height / 2;

  ctx.fillStyle = GENERATING_COLOR;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Generating next level...', cx, cy);

  // Animated dots (based on timestamp)
  const dots = '.'.repeat(1 + (Math.floor(Date.now() / 500) % 3));
  ctx.fillText(dots, cx + 100, cy);
}

function drawCircle(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const { centerX, centerY, radius } = getCircleLayout(element.width, element.height);

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = CIRCLE_COLOR;
  ctx.lineWidth = CIRCLE_WIDTH;
  ctx.stroke();
}

function drawConnections(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const { gameState } = element;
  const { centerX, centerY, radius } = getCircleLayout(element.width, element.height);
  const invalidColors = getInvalidColors(gameState, centerX, centerY, radius);

  for (const conn of gameState.connections) {
    const color = PAIR_COLORS[conn.colorIndex % PAIR_COLORS.length];
    const isInvalid = invalidColors.has(conn.colorIndex);
    const isOOB = !!conn.outOfBounds;

    if (conn.points.length < 2) continue;

    ctx.beginPath();
    // Bright red for out-of-bounds, faded original color for crossings
    ctx.strokeStyle = isOOB ? '#ff0000' : color;
    ctx.lineWidth = isInvalid ? CROSSING_CONNECTION_WIDTH : CONNECTION_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = isOOB ? 0.7 : isInvalid ? 0.45 : 0.85;

    ctx.moveTo(conn.points[0].x, conn.points[0].y);

    if (conn.points.length === 2) {
      ctx.lineTo(conn.points[1].x, conn.points[1].y);
    } else {
      for (let i = 1; i < conn.points.length - 1; i++) {
        const xc = (conn.points[i].x + conn.points[i + 1].x) / 2;
        const yc = (conn.points[i].y + conn.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(conn.points[i].x, conn.points[i].y, xc, yc);
      }
      const last = conn.points[conn.points.length - 1];
      const secondLast = conn.points[conn.points.length - 2];
      ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawDots(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const { centerX, centerY, radius } = getCircleLayout(element.width, element.height);
  const { gameState } = element;

  const connectedColors = new Set(gameState.connections.map(c => c.colorIndex));
  const invalidColors = getInvalidColors(gameState, centerX, centerY, radius);

  for (const dot of gameState.dots) {
    const pos = getDotPosition(dot, centerX, centerY, radius);
    const color = PAIR_COLORS[dot.colorIndex % PAIR_COLORS.length];
    const isConnectedClean = connectedColors.has(dot.colorIndex) && !invalidColors.has(dot.colorIndex);

    if (isConnectedClean) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, DOT_RADIUS + 5, 0, Math.PI * 2);
      ctx.fillStyle = color + '40';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = DOT_BORDER_COLOR;
    ctx.lineWidth = DOT_BORDER_WIDTH;
    ctx.stroke();

    // Inner highlight
    ctx.beginPath();
    ctx.arc(pos.x - 3, pos.y - 3, DOT_RADIUS * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
  }
}

function drawCompletionOverlay(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const { gameState } = element;

  if (gameState.gameComplete) {
    drawGameCompleteScreen(ctx, element);
    return;
  }

  if (!gameState.solved || gameState.isGenerating) return;

  const text = `Level ${gameState.level} Complete!`;
  const fontSize = 24;
  ctx.font = `bold ${fontSize}px sans-serif`;

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize;

  const cx = element.width / 2;
  const cy = element.height / 2;
  const padding = 14;

  ctx.fillStyle = COMPLETION_BG;
  const rx = cx - textWidth / 2 - padding;
  const ry = cy - textHeight / 2 - padding;
  const rw = textWidth + padding * 2;
  const rh = textHeight + padding * 2;

  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, 8);
  ctx.fill();

  ctx.fillStyle = COMPLETION_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#888888';
  ctx.fillText('Draw to start next level...', cx, cy + 24);
}

function drawGameCompleteScreen(ctx: CanvasRenderingContext2D, element: ColorConnectElement): void {
  const cx = element.width / 2;
  const cy = element.height / 2;

  // Semi-transparent overlay
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillRect(0, 0, element.width, element.height);

  // Trophy / star
  ctx.font = '48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u2B50', cx, cy - 40);

  // Title
  ctx.fillStyle = COMPLETION_TEXT_COLOR;
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('You Win!', cx, cy + 10);

  // Subtitle
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('All 20 levels complete!', cx, cy + 38);

  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#999999';
  ctx.fillText('Draw to play again', cx, cy + 60);
}

export function getBounds(element: ColorConnectElement): BoundingBox | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  return {
    left: tx,
    top: ty,
    right: tx + element.width,
    bottom: ty + element.height,
  };
}
