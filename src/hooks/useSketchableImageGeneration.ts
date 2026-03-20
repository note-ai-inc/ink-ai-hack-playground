/**
 * Hook that watches SketchableImageElements for new overlay strokes and
 * triggers AI generation after a 3-second debounce.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { NoteElements } from '../types';
import type { SketchableImageElement } from '../elements/sketchableimage/types';
import { getFalAiService } from '../services/FalAiService';
import { compositeStrokesOnWhite, compositeStrokesOnImage } from '../services/compositing';
import { buildPrompt, buildIterativePrompt } from '../services/stylePresets';
import type { StylePresetKey } from '../services/stylePresets';
import { preloadImage } from '../elements/sketchableimage/renderer';
import { showToast } from '../toast/Toast';

export type RefinementMode = 'twoImage' | 'composite';

const DEBOUNCE_MS = 3000;

export function useSketchableImageGeneration(
  currentNote: NoteElements,
  setCurrentNote: (value: NoteElements) => void,
  stylePreset: StylePresetKey,
  refinementMode: RefinementMode
): void {
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const controllersRef = useRef(new Map<string, AbortController>());
  const lastAttemptedStrokeCountRef = useRef(new Map<string, number>());
  const latestNoteRef = useRef(currentNote);
  latestNoteRef.current = currentNote;

  /*
   * Track preset via ref so changes don't recreate triggerGeneration or
   * re-fire the debounce effect. A preset change takes effect on the next
   * generation (when new strokes are drawn), not retroactively.
   */
  const stylePresetRef = useRef(stylePreset);
  stylePresetRef.current = stylePreset;

  const refinementModeRef = useRef(refinementMode);
  refinementModeRef.current = refinementMode;

  /*
   * Wrapper that synchronously updates latestNoteRef before calling
   * setCurrentNote, preventing concurrent updates from reading stale state.
   */
  const syncSetCurrentNote = useCallback((note: NoteElements) => {
    latestNoteRef.current = note;
    setCurrentNote(note);
  }, [setCurrentNote]);

  const updateElement = useCallback(
    (elementId: string, updater: (el: SketchableImageElement) => SketchableImageElement) => {
      const note = latestNoteRef.current;
      const hasElement = note.elements.some(
        el => el.id === elementId && el.type === 'sketchableImage'
      );
      if (!hasElement) return;
      syncSetCurrentNote({
        ...note,
        elements: note.elements.map(el =>
          el.id === elementId && el.type === 'sketchableImage' ? updater(el as SketchableImageElement) : el
        ),
      });
    },
    [syncSetCurrentNote]
  );

  const triggerGeneration = useCallback(async (elementId: string) => {
    const note = latestNoteRef.current;
    const element = note.elements.find(
      (el): el is SketchableImageElement =>
        el.type === 'sketchableImage' && el.id === elementId
    );
    if (!element) return;
    if (element.overlayStrokes.length === 0) return;

    /*
     * Capture the total stroke count now. Strokes added while generation is
     * in-flight will have higher indices and stay visible after we update
     * hiddenStrokeCount on success.
     */
    const strokeCountAtGeneration = element.overlayStrokes.length;
    lastAttemptedStrokeCountRef.current.set(elementId, strokeCountAtGeneration);

    const existingController = controllersRef.current.get(elementId);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    controllersRef.current.set(elementId, controller);

    updateElement(elementId, el => ({ ...el, isGenerating: true }));

    try {
      const isFirstGeneration = element.bitmapDataUrl.length === 0;
      const mode = refinementModeRef.current;
      let imageDataUrls: string[];
      let prompt: string;

      if (isFirstGeneration) {
        /*
         * First generation: all strokes on white, single image, standard prompt.
         * Identical for both refinement modes.
         */
        imageDataUrls = [compositeStrokesOnWhite(element.overlayStrokes)];
        prompt = buildPrompt(stylePresetRef.current);
      } else if (mode === 'twoImage') {
        /*
         * twoImage: send two images — (1) full sketch (all strokes on white)
         * and (2) previous AI bitmap. The iterative prompt tells the model to
         * refine image 2 guided by the shape in image 1.
         */
        imageDataUrls = [
          compositeStrokesOnWhite(element.overlayStrokes),
          element.bitmapDataUrl,
        ];
        prompt = buildIterativePrompt(stylePresetRef.current);
      } else if (mode === 'composite') {
        /*
         * composite: render only the NEW strokes (since hiddenStrokeCount)
         * on top of the previous AI bitmap and send as a single image.
         */
        const newStrokes = element.overlayStrokes.slice(element.hiddenStrokeCount);
        if (newStrokes.length === 0) {
          updateElement(elementId, el => ({ ...el, isGenerating: false }));
          return;
        }
        imageDataUrls = [
          await compositeStrokesOnImage(element.bitmapDataUrl, newStrokes),
        ];
        prompt = buildPrompt(stylePresetRef.current);
      } else {
        const _exhaustive: never = mode;
        throw new Error(`Unknown refinement mode: ${_exhaustive}`);
      }

      const result = await getFalAiService().refineImage(
        { imageDataUrls, prompt },
        controller.signal
      );

      await preloadImage(result.imageDataUrl);

      updateElement(elementId, el => ({
        ...el,
        bitmapDataUrl: result.imageDataUrl,
        hiddenStrokeCount: strokeCountAtGeneration,
        isGenerating: false,
      }));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        updateElement(elementId, el => ({ ...el, isGenerating: false }));
        return;
      }
      console.error('SketchableImage generation failed:', err);
      showToast(humanizeGenerationError(err));
      updateElement(elementId, el => ({ ...el, isGenerating: false }));
    } finally {
      controllersRef.current.delete(elementId);
    }
  }, [updateElement]);

  /*
   * Derive a stable fingerprint based only on stroke counts. Generation
   * success/failure does not change the fingerprint -- only new strokes do.
   * This prevents retry loops when generation fails.
   */
  const sketchableFingerprint = useMemo(() => {
    return currentNote.elements
      .filter((el): el is SketchableImageElement => el.type === 'sketchableImage')
      .map(el => `${el.id}:${el.overlayStrokes.length}`)
      .join(',');
  }, [currentNote.elements]);

  useEffect(() => {
    const elements = latestNoteRef.current.elements;
    for (const element of elements) {
      if (element.type !== 'sketchableImage') continue;
      if (element.isGenerating) continue;

      /*
       * Only trigger when strokes have been added since the last attempt.
       * If a previous generation failed, the attempted count stays put and
       * we won't retry until new strokes arrive.
       */
      const lastAttempted = lastAttemptedStrokeCountRef.current.get(element.id) ?? 0;
      if (element.overlayStrokes.length <= lastAttempted) continue;

      const existingTimer = timersRef.current.get(element.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const existingController = controllersRef.current.get(element.id);
      if (existingController) {
        existingController.abort();
        controllersRef.current.delete(element.id);
      }

      const timer = setTimeout(() => {
        timersRef.current.delete(element.id);
        triggerGeneration(element.id);
      }, DEBOUNCE_MS);
      timersRef.current.set(element.id, timer);
    }
    /*
     * currentNote is intentionally omitted: latestNoteRef provides access
     * to the latest value without re-triggering the debounce effect on
     * every note update.
     */
  }, [sketchableFingerprint, triggerGeneration]);

  useEffect(() => {
    const timers = timersRef.current;
    const controllers = controllersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);
}

function humanizeGenerationError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  const statusMatch = msg.match(/\((\d{3})\)/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status === 401 || status === 403) return 'AI sketch failed: not authorized — check your API key';
    if (status === 429) return 'AI sketch failed: rate limit exceeded — try again shortly';
    if (status >= 500) return 'AI sketch failed: the service is temporarily unavailable';
    return `AI sketch failed: server error (${status})`;
  }

  if (msg.includes('no image')) return 'AI sketch failed: the service returned no image';
  if (msg.includes('Failed to fetch')) return 'AI sketch failed: network error — check your connection';

  return `AI sketch failed: ${msg}`;
}
