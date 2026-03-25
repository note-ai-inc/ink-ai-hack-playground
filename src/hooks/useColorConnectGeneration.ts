/**
 * Hook that watches ColorConnectElements where isGenerating===true,
 * then uses AI (OpenRouter LLM) to generate the next puzzle level.
 * Falls back to local generation if OpenRouter is not configured.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { NoteElements } from '../types';
import type { ColorConnectElement, ColorConnectDot } from '../elements/colorconnect/types';
import { generateForLevel, getLevelParams } from '../elements/colorconnect/puzzleGenerator';
import { isOpenRouterConfigured, chatCompletionJSON } from '../ai/OpenRouterService';

export function useColorConnectGeneration(
  currentNote: NoteElements,
  setCurrentNote: (value: NoteElements) => void,
): void {
  const latestNoteRef = useRef(currentNote);
  latestNoteRef.current = currentNote;
  const generatingRef = useRef(new Set<string>());

  const updateElement = useCallback(
    (elementId: string, updater: (el: ColorConnectElement) => ColorConnectElement) => {
      const note = latestNoteRef.current;
      const hasElement = note.elements.some(
        el => el.id === elementId && el.type === 'colorconnect',
      );
      if (!hasElement) return;
      const updated = {
        ...note,
        elements: note.elements.map(el =>
          el.id === elementId && el.type === 'colorconnect' ? updater(el as ColorConnectElement) : el,
        ),
      };
      latestNoteRef.current = updated;
      setCurrentNote(updated);
    },
    [setCurrentNote],
  );

  const triggerGeneration = useCallback(async (elementId: string, nextLevel: number) => {
    if (generatingRef.current.has(elementId)) return;
    generatingRef.current.add(elementId);

    try {
      let newState;

      if (isOpenRouterConfigured()) {
        try {
          newState = await generateWithAI(nextLevel);
        } catch (err) {
          console.warn('[ColorConnect] AI generation failed, using local fallback:', err);
          newState = generateForLevel(nextLevel);
        }
      } else {
        newState = generateForLevel(nextLevel);
      }

      updateElement(elementId, (el) => ({
        ...el,
        gameState: newState,
      }));
    } finally {
      generatingRef.current.delete(elementId);
    }
  }, [updateElement]);

  useEffect(() => {
    for (const element of currentNote.elements) {
      if (element.type !== 'colorconnect') continue;
      const cc = element as ColorConnectElement;
      if (!cc.gameState.isGenerating) continue;
      if (generatingRef.current.has(cc.id)) continue;

      const nextLevel = cc.gameState.level + 1;
      triggerGeneration(cc.id, nextLevel);
    }
  }, [currentNote.elements, triggerGeneration]);
}

interface AIDotResponse {
  dots: Array<{
    angle: number;
    radius: number;
    colorIndex: number;
    pairSlot: 0 | 1;
  }>;
}

async function generateWithAI(level: number): Promise<ColorConnectElement['gameState']> {
  const { numPairs, numInteriorDots } = getLevelParams(level);
  const perimeterDots = numPairs * 2 - numInteriorDots;

  const prompt = `You are generating a puzzle for "Color Connect" — a game where colored dot pairs are placed around/inside a circle.

Rules:
- There are ${numPairs} color pairs (colorIndex 0 to ${numPairs - 1}).
- Each color has exactly 2 dots (pairSlot 0 and pairSlot 1).
- ${perimeterDots} dots go ON the circle perimeter (radius = 1.0).
- ${numInteriorDots} dots go INSIDE the circle (radius between 0.25 and 0.70).
- Angles are in radians (0 to ${(2 * Math.PI).toFixed(4)}).
- Perimeter dots should be spread evenly around the circle.
- The puzzle must be SOLVABLE: it must be possible to connect all matching pairs with non-crossing curved lines.
- For solvability: perimeter-only pairs should be nested (like valid parentheses).

Generate a creative, interesting arrangement for level ${level}.

Return JSON: { "dots": [{ "angle": number, "radius": number, "colorIndex": number, "pairSlot": 0|1 }, ...] }`;

  const response = await chatCompletionJSON<AIDotResponse>(
    [
      { role: 'system', content: 'You generate puzzle configurations as JSON. Be precise with numbers.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.8, maxTokens: 1024 },
  );

  // Validate the response
  const dots = validateDots(response.dots, numPairs);
  if (!dots) {
    throw new Error('Invalid AI response: dot validation failed');
  }

  return {
    dots,
    connections: [],
    numPairs,
    solved: false,
    level,
    isGenerating: false,
    gameComplete: false,
  };
}

function validateDots(
  dots: AIDotResponse['dots'] | undefined,
  numPairs: number,
): ColorConnectDot[] | null {
  if (!Array.isArray(dots)) return null;
  if (dots.length !== numPairs * 2) return null;

  // Check each color has exactly 2 dots with slots 0 and 1
  const colorSlots = new Map<number, Set<number>>();
  for (const dot of dots) {
    if (typeof dot.angle !== 'number' || typeof dot.radius !== 'number') return null;
    if (typeof dot.colorIndex !== 'number' || (dot.pairSlot !== 0 && dot.pairSlot !== 1)) return null;
    if (dot.colorIndex < 0 || dot.colorIndex >= numPairs) return null;
    if (dot.radius < 0 || dot.radius > 1.0) return null;

    const slots = colorSlots.get(dot.colorIndex) ?? new Set();
    slots.add(dot.pairSlot);
    colorSlots.set(dot.colorIndex, slots);
  }

  // Verify all colors have both slots
  for (let i = 0; i < numPairs; i++) {
    const slots = colorSlots.get(i);
    if (!slots || !slots.has(0) || !slots.has(1)) return null;
  }

  // Normalize angles to [0, 2*PI)
  return dots.map(d => ({
    angle: ((d.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
    radius: Math.max(0.1, Math.min(1.0, d.radius)),
    colorIndex: d.colorIndex,
    pairSlot: d.pairSlot,
  }));
}
