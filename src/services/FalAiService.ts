/*
 * fal.ai image generation service
 *
 * Real implementation calls flux-2/klein/4b/edit endpoint with one or more images + prompt.
 * Fake implementation returns sample images for local development.
 *
 * WARNING: The API key (INK_FAL_AI_API_KEY) is embedded into the client
 * bundle at build time and visible in browser DevTools. Only use a scoped,
 * low-privilege, rate-limited key. For production, route calls through a
 * backend proxy that holds the secret server-side.
 */

export interface RefineImageRequest {
  imageDataUrls: string[];
  prompt: string;
}

export interface RefineImageResult {
  imageDataUrl: string;
}

export interface FalAiServiceInterface {
  refineImage(request: RefineImageRequest, signal: AbortSignal): Promise<RefineImageResult>;
}

/*
 * Fixed seed ensures deterministic output for the same sketch input.
 * Change to undefined for varied results on each generation.
 */
const GENERATION_SEED = 35;

class FalAiService implements FalAiServiceInterface {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    console.warn(
      '[FalAiService] Using real fal.ai API key from client bundle. ' +
      'For production, route requests through a backend proxy.'
    );
  }

  async refineImage(request: RefineImageRequest, signal: AbortSignal): Promise<RefineImageResult> {
    if (request.imageDataUrls.length === 0) {
      throw new Error('refineImage requires at least one image');
    }
    const response = await fetch('https://fal.run/fal-ai/flux-2/klein/4b/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        image_urls: request.imageDataUrls,
        seed: GENERATION_SEED,
        num_inference_steps: 4,
        image_size: 'square',
      }),
      signal,
    });

    if (!response.ok) {
      let errorText = '';
      try { errorText = await response.text(); } catch { /* body unavailable */ }
      throw new Error(`fal.ai API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const cdnUrl: string = result.images?.[0]?.url;
    if (!cdnUrl) {
      throw new Error('fal.ai returned no image');
    }

    const imageResponse = await fetch(cdnUrl, { signal });
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch result image: ${imageResponse.status}`);
    }
    const blob = await imageResponse.blob();
    if (!blob.type.startsWith('image/')) {
      throw new Error(`Unexpected content-type from CDN: ${blob.type}`);
    }
    const dataUrl = await blobToDataUrl(blob);
    return { imageDataUrl: dataUrl };
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const SAMPLE_IMAGES = [
  '/sample-images/sample1.png',
  '/sample-images/sample2.png',
  '/sample-images/sample3.png',
];

class FakeFalAiService implements FalAiServiceInterface {
  private callCount = 0;

  async refineImage(_request: RefineImageRequest, signal: AbortSignal): Promise<RefineImageResult> {
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

    const sampleUrl = SAMPLE_IMAGES[this.callCount % SAMPLE_IMAGES.length];
    this.callCount++;

    const response = await fetch(sampleUrl, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch sample image: ${response.status}`);
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    return { imageDataUrl: dataUrl };
  }
}

let instance: FalAiServiceInterface | null = null;

export function getFalAiService(): FalAiServiceInterface {
  if (!instance) {
    const apiKey = import.meta.env.INK_FAL_AI_API_KEY as string | undefined;
    if (apiKey) {
      instance = new FalAiService(apiKey);
    } else {
      instance = new FakeFalAiService();
    }
  }
  return instance;
}
