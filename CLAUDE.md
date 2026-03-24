# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ink Playground is a React + TypeScript + Vite web app for rapid prototyping of interactive ink-based elements. It renders, edits, and recognizes handwritten content while maintaining data compatibility with a Kotlin-based NoteContent structure (protobuf schema).

Features: Interactive ink canvas, handwriting recognition via REST API, interactive elements (TicTacToe, InkText), eraser with stroke splitting, undo/redo.

## Build Commands

```bash
npm run dev      # Start dev server with HMR
npm run build    # TypeScript compile + Vite bundle
npm run lint     # ESLint check
npm run preview  # Preview production build
```

## Architecture

### Directory Structure

- `src/types/` - TypeScript interfaces mirroring protobuf schema (primitives, brush, elements, noteContent)
- `src/canvas/` - Core rendering: InkCanvas.tsx (main component), ViewportManager.ts (pan/zoom), StrokeRenderer.ts
- `src/elements/` - Element logic split into:
  - `registry/` - ElementPlugin interface and ElementRegistry dispatcher
  - Per-type directories (`coordinateplane/`, `glyph/`, `inktext/`, `shape/`, `stroke/`, `tictactoe/`) each with `renderer.ts` and optionally `creator.ts`, `interaction.ts`
  - `rendering/` - Element rendering functions
- `src/input/` - StrokeBuilder accumulates pointer events into Stroke objects
- `src/recognition/` - RecognitionService (REST client), StrokeClustering (spatial/temporal grouping)
- `src/eraser/` - ScribbleEraser, scribble detection, overlap calculators
- `src/state/` - useUndoRedo custom hook
- `src/debug/` - DebugLogger, DebugConsole overlay

### Key Patterns

**Element Creator Pattern**: Registry-based system where each creator has `canCreate()` + async `createFromInk()`. Creators auto-register on import. Dispatcher `tryCreateElement()` tries all creators.

**Element Interaction Pattern**: Each element type has optional interaction handler with `isInterestedIn()` → `acceptInk()` pipeline.

**Dual Canvas Rendering**: Main canvas renders completed elements (noteElements), overlay canvas renders in-progress strokes and selection marquee.

**Stroke Lifecycle**: Pointer events → StrokeBuilder → finishedStrokesRef (overlay) → debounce (150ms) → processStrokes → noteElements (main canvas). Strokes clear from overlay when they appear in noteElements.

### Key Files

| Purpose | Path |
|---------|------|
| Main app logic | `src/App.tsx` |
| Canvas component | `src/canvas/InkCanvas.tsx` |
| Element types | `src/types/elements.ts` |
| Element registry | `src/elements/registry/ElementRegistry.ts` |
| Recognition client | `src/recognition/RecognitionService.ts` |
| Planning doc | `ink-prototyping-app-plan.md` |

## Configuration

**Environment**: `INK_RECOGNITION_API_URL=https://strokes.hack.ink.ai`

**TypeScript**: Strict mode, ES2022 target, react-jsx

## Type System

Core immutable, JSON-serializable interfaces:
- `Stroke` contains `inputs` (StrokeInput[]) and `brush` (color, size, stockBrush)
- `Element` is a union type: StrokeElement, ShapeElement, GlyphElement, InkTextElement, TicTacToeElement
- Only StrokeElement has no transform; others have position/rotation/scale via `transform` matrix
- `NoteElements` is the container with `elements: Element[]`
