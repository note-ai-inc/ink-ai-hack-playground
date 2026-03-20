/**
 * Hook that watches NonogramElements where isGenerating===true and
 * gameState===null, then runs the AI image generation pipeline to
 * create the puzzle.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { NoteElements } from '../types';
import type { NonogramElement } from '../elements/nonogram/types';
import { getGeminiImageService, generateFallbackImage } from '../services/GeminiImageService';
import { imageToNonogramGrid } from '../elements/nonogram/imageConverter';
import { createGameState } from '../elements/nonogram/gameState';
import { computeNonogramSize, preloadNonogramImage } from '../elements/nonogram/renderer';

const NONOGRAM_ROWS = 10;
const NONOGRAM_COLS = 10;

export function useNonogramGeneration(
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
    (elementId: string, updater: (el: NonogramElement) => NonogramElement) => {
      const note = latestNoteRef.current;
      const hasElement = note.elements.some(
        el => el.id === elementId && el.type === 'nonogram'
      );
      if (!hasElement) return;
      syncSetCurrentNote({
        ...note,
        elements: note.elements.map(el =>
          el.id === elementId && el.type === 'nonogram' ? updater(el as NonogramElement) : el
        ),
      });
    },
    [syncSetCurrentNote]
  );

  const triggerGeneration = useCallback(async (elementId: string) => {
    const note = latestNoteRef.current;
    const element = note.elements.find(
      (el): el is NonogramElement =>
        el.type === 'nonogram' && el.id === elementId
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
        const prompt = `8bit pixel art of ${element.prompt} centered on a white background, square image`;
        ({ imageDataUrl } = await getGeminiImageService().generateImage(prompt, controller.signal));
      } else {
        ({ imageDataUrl } = generateFallbackImage());
      }

      // Check element still exists
      const currentEl = latestNoteRef.current.elements.find(el => el.id === elementId);
      if (!currentEl) return;

      const { grid: solution, cellColors } = await imageToNonogramGrid(imageDataUrl, NONOGRAM_ROWS, NONOGRAM_COLS);
      const gameState = createGameState(solution, NONOGRAM_ROWS, NONOGRAM_COLS, cellColors);

      // Preload the image into the renderer cache so it's ready on solve
      await preloadNonogramImage(imageDataUrl);

      // Resize element to fit the actual clue layout (cells are exactly 50px)
      const { width, height } = computeNonogramSize(gameState);

      updateElement(elementId, el => ({
        ...el,
        width,
        height,
        gameState,
        colorImageDataUrl: imageDataUrl,
        isGenerating: false,
      }));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('Nonogram generation failed:', err);
      // On failure, stop generating so the element shows an error state
      updateElement(elementId, el => ({
        ...el,
        isGenerating: false,
      }));
    } finally {
      controllersRef.current.delete(elementId);
    }
  }, [updateElement]);

  // Fingerprint: track nonogram elements that need generation
  const generatingFingerprint = useMemo(() => {
    return currentNote.elements
      .filter((el): el is NonogramElement =>
        el.type === 'nonogram' && el.isGenerating && el.gameState === null
      )
      .map(el => el.id)
      .join(',');
  }, [currentNote.elements]);

  useEffect(() => {
    const elements = latestNoteRef.current.elements;
    for (const element of elements) {
      if (element.type !== 'nonogram') continue;
      const nonogram = element as NonogramElement;
      if (!nonogram.isGenerating || nonogram.gameState !== null) continue;

      // Skip if already generating this element
      if (controllersRef.current.has(element.id)) continue;

      triggerGeneration(element.id);
    }
  }, [generatingFingerprint, triggerGeneration]);

  // Cleanup on unmount
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
