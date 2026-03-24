/**
 * Hook that watches JigsawElements where isGenerating===true and
 * gameState===null, then runs the AI image generation pipeline to
 * create the puzzle pieces.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { NoteElements } from '../types';
import type { JigsawElement } from '../elements/jigsaw/types';
import { getGeminiImageService, generateFallbackImage } from '../services/GeminiImageService';
import { createGameState } from '../elements/jigsaw/gameState';
import { preloadJigsawImage } from '../elements/jigsaw/renderer';
import { JIGSAW_ROWS, JIGSAW_COLS, PUZZLE_SIZE, PUZZLE_LEFT, PUZZLE_TOP } from '../elements/jigsaw/constants';

export function useJigsawGeneration(
  currentNote: NoteElements,
  setCurrentNote: (value: NoteElements) => void,
): void {
  const controllersRef = useRef(new Map<string, AbortController>());
  const latestNoteRef = useRef(currentNote);
  latestNoteRef.current = currentNote;

  const syncSetCurrentNote = useCallback((note: NoteElements) => {
    latestNoteRef.current = note;
    setCurrentNote(note);
  }, [setCurrentNote]);

  const updateElement = useCallback(
    (elementId: string, updater: (el: JigsawElement) => JigsawElement) => {
      const note = latestNoteRef.current;
      const hasElement = note.elements.some(
        el => el.id === elementId && el.type === 'jigsaw'
      );
      if (!hasElement) return;
      syncSetCurrentNote({
        ...note,
        elements: note.elements.map(el =>
          el.id === elementId && el.type === 'jigsaw' ? updater(el as JigsawElement) : el
        ),
      });
    },
    [syncSetCurrentNote]
  );

  const triggerGeneration = useCallback(async (elementId: string) => {
    const note = latestNoteRef.current;
    const element = note.elements.find(
      (el): el is JigsawElement =>
        el.type === 'jigsaw' && el.id === elementId
    );
    if (!element) return;
    if (!element.isGenerating || element.gameState !== null) return;

    const existingController = controllersRef.current.get(elementId);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    controllersRef.current.set(elementId, controller);

    try {
      let imageDataUrl: string;
      if (element.prompt) {
        const prompt = `colorful illustration of ${element.prompt}, centered on white background, square image, bold colors, flat design`;
        ({ imageDataUrl } = await getGeminiImageService().generateImage(prompt, controller.signal));
      } else {
        ({ imageDataUrl } = generateFallbackImage());
      }

      const currentEl = latestNoteRef.current.elements.find(el => el.id === elementId);
      if (!currentEl) return;

      await preloadJigsawImage(imageDataUrl);
      if (controller.signal.aborted) return;

      // Re-fetch element to get current dimensions (may have changed during async)
      const freshEl = latestNoteRef.current.elements.find(
        (el): el is JigsawElement => el.type === 'jigsaw' && el.id === elementId
      );
      if (!freshEl || !freshEl.isGenerating) return;

      const gameState = createGameState(
        JIGSAW_ROWS,
        JIGSAW_COLS,
        PUZZLE_SIZE,
        PUZZLE_SIZE,
        PUZZLE_LEFT,
        PUZZLE_TOP,
        freshEl.width,
        freshEl.height,
      );

      updateElement(elementId, el => ({
        ...el,
        gameState,
        imageDataUrl,
        isGenerating: false,
      }));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('Jigsaw generation failed:', err);
      updateElement(elementId, el => ({
        ...el,
        isGenerating: false,
      }));
    } finally {
      controllersRef.current.delete(elementId);
    }
  }, [updateElement]);

  const generatingFingerprint = useMemo(() => {
    return currentNote.elements
      .filter((el): el is JigsawElement =>
        el.type === 'jigsaw' && el.isGenerating && el.gameState === null
      )
      .map(el => el.id)
      .join(',');
  }, [currentNote.elements]);

  useEffect(() => {
    const elements = latestNoteRef.current.elements;
    for (const element of elements) {
      if (element.type !== 'jigsaw') continue;
      const jigsaw = element as JigsawElement;
      if (!jigsaw.isGenerating || jigsaw.gameState !== null) continue;
      if (controllersRef.current.has(element.id)) continue;

      triggerGeneration(element.id);
    }
  }, [generatingFingerprint, triggerGeneration]);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);
}
