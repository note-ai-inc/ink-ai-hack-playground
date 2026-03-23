/*
 * Gemini image generation service
 *
 * Real implementation calls Gemini gemini-3.1-flash-image-preview endpoint.
 * Fake implementation returns a generated pixel-art placeholder for local development.
 *
 * WARNING: The API key (INK_GEMINI_API_KEY) is embedded into the client
 * bundle at build time and visible in browser DevTools. Only use a scoped,
 * low-privilege, rate-limited key. For production, route calls through a
 * backend proxy that holds the secret server-side.
 */

export interface GeminiImageServiceInterface {
  generateImage(prompt: string, signal: AbortSignal): Promise<{ imageDataUrl: string }>;
}

class GeminiImageService implements GeminiImageServiceInterface {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    console.warn(
      '[GeminiImageService] Using real Gemini API key from client bundle. ' +
      'For production, route requests through a backend proxy.'
    );
  }

  async generateImage(prompt: string, signal: AbortSignal): Promise<{ imageDataUrl: string }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
      signal,
    });

    if (!response.ok) {
      let errorText = '';
      try { errorText = await response.text(); } catch { /* body unavailable */ }
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const candidates = result.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('Gemini returned no candidates');
    }

    const parts = candidates[0].content?.parts;
    if (!parts) {
      throw new Error('Gemini returned no content parts');
    }

    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        const imageDataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
        return { imageDataUrl };
      }
    }

    throw new Error('Gemini returned no image data');
  }
}

// Predefined 10x10 pixel-art patterns for the fake service.
// Each is a recognizable shape so puzzles are fun to solve without an API key.
// 1 = filled (dark), 0 = empty (white).
const FAKE_INK_PATTERN = {
  color: '#0a1b65',
  grid: [
    // I  N     K
    0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,
    1,0,1,1,1,0,1,0,0,1,
    1,0,1,0,1,0,1,0,1,0,
    1,0,1,0,1,0,1,1,0,0,
    1,0,1,0,1,0,1,1,0,0,
    1,0,1,0,1,0,1,0,1,0,
    1,0,1,0,1,0,1,0,0,1,
    0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,
  ],
};

function renderPatternToDataUrl(pattern: typeof FAKE_INK_PATTERN): string {
  const size = 128;
  const gridSize = 10;
  const cellSize = size / gridSize;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = pattern.color;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (pattern.grid[r * gridSize + c]) {
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }

  return canvas.toDataURL('image/png');
}

class FakeGeminiImageService implements GeminiImageServiceInterface {
  async generateImage(_prompt: string, signal: AbortSignal): Promise<{ imageDataUrl: string }> {
    // Simulate API delay
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, 1500);
      signal.addEventListener('abort', onAbort, { once: true });
    });

    return { imageDataUrl: renderPatternToDataUrl(FAKE_INK_PATTERN) };
  }
}

/** Generate the default INK fallback image synchronously (no API call). */
export function generateFallbackImage(): { imageDataUrl: string } {
  return { imageDataUrl: renderPatternToDataUrl(FAKE_INK_PATTERN) };
}

let instance: GeminiImageServiceInterface | null = null;

export function getGeminiImageService(): GeminiImageServiceInterface {
  if (!instance) {
    const apiKey = import.meta.env.INK_GEMINI_API_KEY as string | undefined;
    if (apiKey) {
      instance = new GeminiImageService(apiKey);
    } else {
      instance = new FakeGeminiImageService();
    }
  }
  return instance;
}
