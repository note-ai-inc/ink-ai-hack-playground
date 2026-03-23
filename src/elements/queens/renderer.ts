// Queens element renderer — draws the colored grid, region borders, cell states,
// conflict highlights, and win overlay on the shared ink canvas.

import type { BoundingBox } from '../../types';
import type { QueensElement } from './types';
import type { RenderOptions } from '../registry/ElementPlugin';

// ─── Region Colour Palette ───────────────────────────────────────────────────
// 12 pleasant pastels — rotate for grids larger than 12 (unlikely in practice).
const REGION_COLORS = [
  '#F4A8A8', // rose
  '#A8C8F4', // sky blue
  '#A8F4C0', // mint
  '#F4E8A8', // sand
  '#D0A8F4', // lavender
  '#F4C8A8', // peach
  '#A8F4EC', // teal
  '#F4A8D8', // pink
  '#C4F4A8', // lime
  '#A8B8F4', // periwinkle
  '#F4D4A8', // apricot
  '#A8F4D4', // seafoam
];

// ─── Drawing Constants ───────────────────────────────────────────────────────
const INNER_LINE_COLOR = 'rgba(0,0,0,0.12)';
const REGION_BORDER_COLOR = 'rgba(0,0,0,0.75)';
const OUTER_BORDER_COLOR = '#1a1a1a';
const INNER_LINE_WIDTH = 0.5;
const REGION_BORDER_WIDTH = 2.5;
const OUTER_BORDER_WIDTH = 3.5;

const CONFLICT_FILL = 'rgba(220,50,50,0.28)';
const WIN_FILL = 'rgba(60,200,100,0.14)';

const X_COLOR = '#555555';
const QUEEN_NORMAL_COLOR = '#1a1a2e';
const QUEEN_CONFLICT_COLOR = '#cc0000';

// ─── Main Render ─────────────────────────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  element: QueensElement,
  _options?: RenderOptions,
): void {
  const { width, height, gameState, conflictCells } = element;
  const { size, regions, cells, won } = gameState;
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];

  const cw = width / size;   // cell width
  const ch = height / size;  // cell height

  const conflictSet = new Set(conflictCells);

  ctx.save();
  ctx.translate(tx, ty);

  // 1. Region background colours
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      const regionId = regions[idx];
      ctx.fillStyle = REGION_COLORS[regionId % REGION_COLORS.length];
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }

  // 2. Conflict overlays (red tint on conflicting cells)
  for (const idx of conflictSet) {
    const r = Math.floor(idx / size);
    const c = idx % size;
    ctx.fillStyle = CONFLICT_FILL;
    ctx.fillRect(c * cw, r * ch, cw, ch);
  }

  // 3. Win overlay (green wash)
  if (won) {
    ctx.fillStyle = WIN_FILL;
    ctx.fillRect(0, 0, width, height);
  }

  // 4. Cell contents (X marks and queens)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      const state = cells[idx];
      if (state === 'empty') continue;

      const cx = c * cw + cw / 2;
      const cy = r * ch + ch / 2;

      if (state === 'x') {
        drawX(ctx, cx, cy, Math.min(cw, ch) * 0.28);
      } else if (state === 'queen') {
        const isConflict = conflictSet.has(idx);
        drawQueen(ctx, cx, cy, Math.min(cw, ch) * 0.30, isConflict);
      }
    }
  }

  // 5. Inner grid lines (thin, within regions)
  ctx.strokeStyle = INNER_LINE_COLOR;
  ctx.lineWidth = INNER_LINE_WIDTH;
  for (let i = 1; i < size; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cw, 0);
    ctx.lineTo(i * cw, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * ch);
    ctx.lineTo(width, i * ch);
    ctx.stroke();
  }

  // 6. Region boundary lines (thick, between different regions)
  ctx.strokeStyle = REGION_BORDER_COLOR;
  ctx.lineWidth = REGION_BORDER_WIDTH;

  // Vertical region edges (between columns c and c+1)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size - 1; c++) {
      if (regions[r * size + c] !== regions[r * size + c + 1]) {
        const x = (c + 1) * cw;
        ctx.beginPath();
        ctx.moveTo(x, r * ch);
        ctx.lineTo(x, (r + 1) * ch);
        ctx.stroke();
      }
    }
  }

  // Horizontal region edges (between rows r and r+1)
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r * size + c] !== regions[(r + 1) * size + c]) {
        const y = (r + 1) * ch;
        ctx.beginPath();
        ctx.moveTo(c * cw, y);
        ctx.lineTo((c + 1) * cw, y);
        ctx.stroke();
      }
    }
  }

  // 7. Outer border
  ctx.strokeStyle = OUTER_BORDER_COLOR;
  ctx.lineWidth = OUTER_BORDER_WIDTH;
  ctx.strokeRect(
    OUTER_BORDER_WIDTH / 2,
    OUTER_BORDER_WIDTH / 2,
    width - OUTER_BORDER_WIDTH,
    height - OUTER_BORDER_WIDTH,
  );

  // 8. Win banner
  if (won) {
    drawWinBanner(ctx, width, height);
  }

  ctx.restore();
}

// ─── Draw Helpers ─────────────────────────────────────────────────────────────

function drawX(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.strokeStyle = X_COLOR;
  ctx.lineWidth = Math.max(1.2, r * 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r);
  ctx.lineTo(cx + r, cy + r);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r, cy - r);
  ctx.lineTo(cx - r, cy + r);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawQueen(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  conflict: boolean,
): void {
  // Crown shape mirrors the palette icon SVG (viewBox 0 0 24 24).
  // Normalised to be centred at (0,0): original points minus (12, 11).
  // Crown spans ±10 in X, -6..+6 in Y → we scale so height ≈ size.
  const s = size / 11; // scale factor

  // Crown polyline points (centred)
  const pts: [number, number][] = [
    [-10,  6],  // 2,17
    [ -7, -4],  // 5,7
    [-2.5, 2],  // 9.5,13
    [  0, -6],  // 12,5   ← topmost peak
    [ 2.5, 2],  // 14.5,13
    [  7, -4],  // 19,7
    [ 10,  6],  // 22,17
  ];

  const color = conflict ? QUEEN_CONFLICT_COLOR : QUEEN_NORMAL_COLOR;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Subtle fill for depth
  ctx.fillStyle = conflict
    ? 'rgba(204,0,0,0.18)'
    : 'rgba(26,26,46,0.10)';

  // Crown outline (filled + stroked)
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); // close back to first point to fill cleanly
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();

  // Base bar
  ctx.beginPath();
  ctx.moveTo(-10, 6);
  ctx.lineTo( 10, 6);
  ctx.stroke();

  // Jewel dots on the three peaks
  ctx.fillStyle = color;
  for (const [px, py] of [[-7, -4], [0, -6], [7, -4]] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(px, py, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawWinBanner(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const text = '✓ Puzzle Complete!';
  const fontSize = Math.min(width, height) * 0.075;
  ctx.save();
  ctx.font = `bold ${fontSize}px sans-serif`;

  const m = ctx.measureText(text);
  const tw = m.width;
  const pad = fontSize * 0.7;

  const bx = (width - tw) / 2 - pad;
  const by = height / 2 - fontSize - pad;
  const bw = tw + pad * 2;
  const bh = fontSize * 1.5 + pad * 2;
  const br = 8;

  // Banner background
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 12;
  roundRect(ctx, bx, by, bw, bh, br);
  ctx.fill();

  ctx.shadowBlur = 0;

  // Green border
  ctx.strokeStyle = '#28a745';
  ctx.lineWidth = 2.5;
  roundRect(ctx, bx, by, bw, bh, br);
  ctx.stroke();

  // Text
  ctx.fillStyle = '#155724';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, by + bh / 2);

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Bounds ──────────────────────────────────────────────────────────────────

export function getBounds(element: QueensElement): BoundingBox | null {
  const tx = element.transform.values[6];
  const ty = element.transform.values[7];
  return {
    left: tx,
    top: ty,
    right: tx + element.width,
    bottom: ty + element.height,
  };
}
