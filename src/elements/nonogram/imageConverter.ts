// Convert an image to a binary nonogram grid with per-cell colors

export interface NonogramGridResult {
  grid: boolean[];
  cellColors: string[];  // css color per cell
}

export function imageToNonogramGrid(imageDataUrl: string, rows: number, cols: number): Promise<NonogramGridResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Crop source image to square
      const srcSize = Math.min(img.width, img.height);
      const srcX = (img.width - srcSize) / 2;
      const srcY = (img.height - srcSize) / 2;

      // Render at higher resolution to find content bounds
      const sampleSize = 128;
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = sampleSize;
      sampleCanvas.height = sampleSize;
      const sampleCtx = sampleCanvas.getContext('2d')!;
      sampleCtx.fillStyle = '#ffffff';
      sampleCtx.fillRect(0, 0, sampleSize, sampleSize);
      sampleCtx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, sampleSize, sampleSize);

      // Find bounding box of non-white content
      const sampleData = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
      const WHITE_THRESHOLD = 240; // pixels brighter than this are "white"
      let minX = sampleSize, minY = sampleSize, maxX = 0, maxY = 0;
      for (let y = 0; y < sampleSize; y++) {
        for (let x = 0; x < sampleSize; x++) {
          const i = (y * sampleSize + x) * 4;
          const r = sampleData[i], g = sampleData[i + 1], b = sampleData[i + 2];
          if (r < WHITE_THRESHOLD || g < WHITE_THRESHOLD || b < WHITE_THRESHOLD) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      // If no content found, use full image
      if (maxX <= minX || maxY <= minY) {
        minX = 0; minY = 0; maxX = sampleSize - 1; maxY = sampleSize - 1;
      }

      // Add a 1-cell margin and make the crop square
      const margin = Math.max(1, Math.round(sampleSize * 0.02));
      minX = Math.max(0, minX - margin);
      minY = Math.max(0, minY - margin);
      maxX = Math.min(sampleSize - 1, maxX + margin);
      maxY = Math.min(sampleSize - 1, maxY + margin);

      // Make crop square (use the larger dimension)
      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const cropSize = Math.max(cropW, cropH);
      // Center the smaller dimension
      const cx = minX + cropW / 2;
      const cy = minY + cropH / 2;
      const cropLeft = Math.max(0, Math.min(sampleSize - cropSize, Math.round(cx - cropSize / 2)));
      const cropTop = Math.max(0, Math.min(sampleSize - cropSize, Math.round(cy - cropSize / 2)));

      // Now sample the cropped region into the grid
      const gridCanvas = document.createElement('canvas');
      gridCanvas.width = cols;
      gridCanvas.height = rows;
      const gridCtx = gridCanvas.getContext('2d')!;
      gridCtx.fillStyle = '#ffffff';
      gridCtx.fillRect(0, 0, cols, rows);
      gridCtx.drawImage(sampleCanvas, cropLeft, cropTop, cropSize, cropSize, 0, 0, cols, rows);

      const imageData = gridCtx.getImageData(0, 0, cols, rows);
      const pixels = imageData.data;

      // Extract luminance and RGB per cell
      const luminances: number[] = [];
      const cellColors: string[] = [];
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        luminances.push(0.299 * r + 0.587 * g + 0.114 * b);
        cellColors.push(`rgb(${r},${g},${b})`);
      }

      // Find optimal threshold: start at 128, then adjust if too few or too many filled
      let threshold = 128;
      const totalCells = rows * cols;
      let grid = luminances.map(l => l < threshold);
      const filledCount = grid.filter(Boolean).length;
      const filledRatio = filledCount / totalCells;

      if (filledRatio < 0.15 || filledRatio > 0.85) {
        const sorted = [...luminances].sort((a, b) => a - b);
        threshold = sorted[Math.floor(totalCells * 0.4)];
        grid = luminances.map(l => l < threshold);
      }

      resolve({ grid, cellColors });
    };
    img.onerror = () => reject(new Error('Failed to load image for nonogram conversion'));
    img.src = imageDataUrl;
  });
}
