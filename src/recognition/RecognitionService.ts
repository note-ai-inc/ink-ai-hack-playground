// Recognition service - REST client for handwriting recognition backend

import type { Stroke, StrokeInput } from '../types';

// API request/response types

export interface RecognitionStrokeInput {
  x: number;
  y: number;
  t: number; // Time in milliseconds
}

export interface RecognitionStroke {
  points: RecognitionStrokeInput[];
}

export interface StrokesGroupingRequest {
  strokes: RecognitionStroke[];
  writingAreaWidth?: number;
  writingAreaHeight?: number;
  preContext?: string;
}

export interface RecognitionCandidate {
  text: string;
  score: number;
}

export interface RecognizedToken {
  text: string;
  candidates: RecognitionCandidate[];
  strokeIndices: number[];
  boundingBox?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

export interface RecognitionLine {
  tokens: RecognizedToken[];
}

export interface HandwritingRecognitionResult {
  lines: RecognitionLine[];
  rawText: string;
}

export interface RecognitionError {
  code: string;
  message: string;
}

// Convert app strokes to API format
function convertStrokesToApiFormat(strokes: Stroke[]): RecognitionStroke[] {
  return strokes.map((stroke) => ({
    points: stroke.inputs.inputs.map((input: StrokeInput) => ({
      x: input.x,
      y: input.y,
      t: input.timeMillis,
    })),
  }));
}

// Calculate writing area from strokes
function calculateWritingArea(strokes: Stroke[]): { width: number; height: number } {
  if (strokes.length === 0) {
    return { width: 1000, height: 1000 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (const input of stroke.inputs.inputs) {
      minX = Math.min(minX, input.x);
      minY = Math.min(minY, input.y);
      maxX = Math.max(maxX, input.x);
      maxY = Math.max(maxY, input.y);
    }
  }

  // Add some padding
  const padding = 50;
  return {
    width: Math.max(100, maxX - minX + padding * 2),
    height: Math.max(100, maxY - minY + padding * 2),
  };
}

export class RecognitionService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // In development, use the Vite proxy to avoid CORS issues
    // In production, use the direct API URL from environment variable
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else if (import.meta.env.DEV) {
      this.baseUrl = '/api/recognition';
    } else {
      this.baseUrl = import.meta.env.INK_RECOGNITION_API_URL || 'http://localhost:8080';
    }
  }

  /**
   * Recognize handwriting from strokes using Google Handwriting API.
   */
  async recognizeGoogle(
    strokes: Stroke[],
    preContext?: string
  ): Promise<HandwritingRecognitionResult> {
    if (strokes.length === 0) {
      return { lines: [], rawText: '' };
    }

    const writingArea = calculateWritingArea(strokes);
    const request: StrokesGroupingRequest = {
      strokes: convertStrokesToApiFormat(strokes),
      writingAreaWidth: writingArea.width,
      writingAreaHeight: writingArea.height,
      preContext,
    };

    try {
      const response = await fetch(`${this.baseUrl}/recognize_google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Recognition API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      return this.parseRecognitionResponse(result, strokes);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Recognition failed: ${error.message}`);
      }
      throw new Error('Recognition failed: Unknown error');
    }
  }

  /**
   * Parse the API response into our internal format.
   * The API may return different formats, so we normalize here.
   */
  private parseRecognitionResponse(
    response: unknown,
    _originalStrokes: Stroke[]
  ): HandwritingRecognitionResult {
    // Handle the common response format from Google Handwriting API
    // The actual format will depend on the backend implementation

    if (!response || typeof response !== 'object') {
      return { lines: [], rawText: '' };
    }

    const resp = response as Record<string, unknown>;

    // If response already has our expected format
    if ('lines' in resp && Array.isArray(resp.lines)) {
      return {
        lines: resp.lines as RecognitionLine[],
        rawText: typeof resp.rawText === 'string' ? resp.rawText : this.extractRawText(resp.lines as RecognitionLine[]),
      };
    }

    // Handle Google Handwriting API format [[candidates], [candidates], ...]
    if (Array.isArray(resp.results) || Array.isArray(response)) {
      const results = Array.isArray(response) ? response : resp.results;
      return this.parseGoogleFormat(results as unknown[]);
    }

    // Handle simple text response
    if ('text' in resp && typeof resp.text === 'string') {
      return {
        lines: [{
          tokens: [{
            text: resp.text,
            candidates: [{ text: resp.text, score: 1.0 }],
            strokeIndices: [],
          }],
        }],
        rawText: resp.text,
      };
    }

    // Handle groupstrokes API format with label and wordGroups
    if ('label' in resp && typeof resp.label === 'string') {
      const rawText = resp.label;
      const wordGroups = Array.isArray(resp.wordGroups) ? resp.wordGroups : [];
      const score = typeof resp.score === 'number' ? resp.score : 1.0;

      const tokens: RecognizedToken[] = wordGroups.map((wg: unknown) => {
        const group = wg as Record<string, unknown>;
        const text = typeof group.text === 'string' ? group.text : '';
        const strokeIndices = Array.isArray(group.strokeIndices) ? group.strokeIndices as number[] : [];
        const bbox = group.bbox as Record<string, number> | undefined;

        return {
          text,
          candidates: [{ text, score }],
          strokeIndices,
          boundingBox: bbox ? {
            left: bbox.min_x ?? 0,
            top: bbox.min_y ?? 0,
            right: bbox.max_x ?? 0,
            bottom: bbox.max_y ?? 0,
          } : undefined,
        };
      });

      // If no word groups, create a single token from the label
      if (tokens.length === 0 && rawText) {
        tokens.push({
          text: rawText,
          candidates: [{ text: rawText, score }],
          strokeIndices: [],
        });
      }

      return {
        lines: [{ tokens }],
        rawText,
      };
    }

    return { lines: [], rawText: '' };
  }

  /**
   * Parse Google Handwriting API format.
   */
  private parseGoogleFormat(results: unknown[]): HandwritingRecognitionResult {
    const lines: RecognitionLine[] = [];
    let currentLine: RecognizedToken[] = [];
    let rawText = '';

    for (const result of results) {
      if (!result || typeof result !== 'object') continue;

      const resultObj = result as Record<string, unknown>;

      // Each result typically has candidates array
      const candidates = Array.isArray(resultObj.candidates)
        ? resultObj.candidates.map((c: unknown) => {
            const cObj = c as Record<string, unknown>;
            return {
              text: typeof cObj.text === 'string' ? cObj.text : '',
              score: typeof cObj.score === 'number' ? cObj.score : 1.0,
            };
          })
        : [];

      const text = candidates[0]?.text || '';
      const strokeIndices = Array.isArray(resultObj.strokeIndices)
        ? (resultObj.strokeIndices as number[])
        : [];

      if (text) {
        // Check for newline
        if (text === '\n' || text.includes('\n')) {
          if (currentLine.length > 0) {
            lines.push({ tokens: currentLine });
            currentLine = [];
          }
          rawText += '\n';
        } else {
          currentLine.push({
            text,
            candidates,
            strokeIndices,
          });
          rawText += text;
        }
      }
    }

    // Add remaining tokens as final line
    if (currentLine.length > 0) {
      lines.push({ tokens: currentLine });
    }

    return { lines, rawText };
  }

  /**
   * Extract raw text from lines.
   */
  private extractRawText(lines: RecognitionLine[]): string {
    return lines
      .map((line) => line.tokens.map((token) => token.text).join(''))
      .join('\n');
  }

  /**
   * Check if the recognition service is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let recognitionServiceInstance: RecognitionService | null = null;

export function getRecognitionService(): RecognitionService {
  if (!recognitionServiceInstance) {
    recognitionServiceInstance = new RecognitionService();
  }
  return recognitionServiceInstance;
}
