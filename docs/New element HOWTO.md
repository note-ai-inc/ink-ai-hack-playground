# How to Add a New Element Type

This guide explains how to add a new element type to Ink Playground using the plugin architecture.

## Overview

Each element type is a self-contained plugin in `src/elements/<type>/`. A plugin can provide:
- **Types** (required) - Interface definition, optional factory function
- **Rendering** (required) - How to draw the element
- **Creation** (optional) - How to create the element from ink strokes
- **Interaction** (optional) - How the element responds to additional ink input
- **Palette entry** (optional) - Appear in the rectangle+X gesture menu

## File Checklist

When adding a new element, you will create/edit these files:

| File                                 | Action            | Purpose                              |
|--------------------------------------|-------------------|--------------------------------------|
| `src/elements/<type>/types.ts`       | **Create**        | Interface, optional factory          |
| `src/elements/<type>/renderer.ts`    | **Create**        | Render + bounding box                |
| `src/elements/<type>/creator.ts`     | Create (optional) | Create from ink strokes              |
| `src/elements/<type>/interaction.ts` | Create (optional) | Handle ink interaction               |
| `src/elements/<type>/index.ts`       | **Create**        | Plugin wiring + registration         |
| `src/elements/index.ts`              | **Edit**          | Add one `import './<type>'` line     |
| `src/types/elements.ts`              | **Edit**          | Add type to `Element` union (1 line) |

No changes needed to `App.tsx`, `ElementRenderer.ts`, `PaletteMenu.tsx`, or any dispatch logic.

## Steps

### 1. Define the Type (`types.ts`)

Create a `types.ts` in your element directory with the interface and optional factory.

```typescript
import type { TransformableElement } from '../../types/primitives';
import type { Stroke } from '../../types/brush';

export interface CheckboxElement extends TransformableElement {
  type: 'checkbox';
  checked: boolean;
  sourceStrokes: Stroke[];
}
```

### 2. Register in the Type System (`src/types/elements.ts`)

Add your type to the `Element` union and its import:

```typescript
import type { CheckboxElement } from '../elements/checkbox/types';  // <-- Add import

export type Element =
  | StrokeElement
  // ...existing types...
  | CheckboxElement;  // <-- Add to union
```

### 3. Implement the Renderer (`renderer.ts`)

Every plugin must implement `render()` and `getBounds()`:

```typescript
import type { BoundingBox } from '../../types';
import type { CheckboxElement } from './types';
import type { RenderOptions } from '../registry/ElementPlugin';

export function render(
  ctx: CanvasRenderingContext2D,
  element: CheckboxElement,
  options?: RenderOptions
): void {
  const bounds = getBounds(element);
  if (!bounds) return;

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(bounds.left, bounds.top, 20, 20);

  if (element.checked) {
    ctx.beginPath();
    ctx.moveTo(bounds.left + 4, bounds.top + 10);
    ctx.lineTo(bounds.left + 8, bounds.top + 16);
    ctx.lineTo(bounds.left + 16, bounds.top + 4);
    ctx.stroke();
  }
}

export function getBounds(element: CheckboxElement): BoundingBox | null {
  return {
    left: 0,
    top: 0,
    right: 20,
    bottom: 20,
  };
}
```

### 5. Implement the Creator (`creator.ts`) — Optional

If your element can be created from ink strokes:

```typescript
import type { Stroke } from '../../types';
import type { CheckboxElement } from './types';
import { generateId, IDENTITY_MATRIX } from '../../types/primitives';
import type { CreationContext, CreationResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';

export function canCreate(strokes: Stroke[]): boolean {
  return strokes.length >= 1 && strokes.length <= 2;
}

export async function createFromInk(
  strokes: Stroke[],
  context: CreationContext,
  recognitionResult?: HandwritingRecognitionResult
): Promise<CreationResult | null> {
  const element: CheckboxElement = {
    type: 'checkbox',
    id: generateId(),
    transform: IDENTITY_MATRIX,
    checked: false,
    sourceStrokes: strokes,
  };

  return {
    elements: [element],
    consumedStrokes: strokes,
    confidence: 0.85,
  };
}
```

### 6. Implement the Interaction (`interaction.ts`) — Optional

If your element responds to additional ink input:

```typescript
import type { Stroke, BoundingBox } from '../../types';
import type { CheckboxElement } from './types';
import type { InteractionResult } from '../registry/ElementPlugin';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';

export function isInterestedIn(
  element: CheckboxElement,
  strokes: Stroke[],
  strokeBounds: BoundingBox
): boolean {
  // Return true if strokes overlap with this element
}

export async function acceptInk(
  element: CheckboxElement,
  strokes: Stroke[],
  recognitionResult?: HandwritingRecognitionResult
): Promise<InteractionResult> {
  const newElement: CheckboxElement = {
    ...element,
    checked: !element.checked,
  };

  return {
    element: newElement,
    consumed: true,
    strokesConsumed: strokes,
  };
}
```

### 7. Create the Plugin Definition (`index.ts`)

Wire everything together and register:

```typescript
import type { CheckboxElement } from './types';
import type { ElementPlugin } from '../registry/ElementPlugin';
import { registerPlugin } from '../registry/ElementRegistry';
import { render, getBounds } from './renderer';
import { canCreate, createFromInk } from './creator';
import { isInterestedIn, acceptInk } from './interaction';

const checkboxPlugin: ElementPlugin<CheckboxElement> = {
  elementType: 'checkbox',
  name: 'Checkbox',

  canCreate,
  createFromInk,

  isInterestedIn,
  acceptInk,

  render,
  getBounds,
};

registerPlugin(checkboxPlugin);

export { checkboxPlugin };
```

### 8. Register the Plugin (`src/elements/index.ts`)

Add one import line:

```typescript
import './checkbox';  // <-- Add this line
```

### 9. Add a Palette Entry — Optional

If your element should appear in the rectangle+X gesture menu, create an `icon.tsx` and register a palette entry in your `index.ts`:

**`icon.tsx`:**
```tsx
export function CheckboxIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <polyline points="9 11 12 14 22 4" />
    </svg>
  );
}
```

**In `index.ts`:**
```typescript
import { registerPaletteEntry } from '../../palette/PaletteRegistry';
import { CheckboxIcon } from './icon';
import { generateId } from '../../types/primitives';

registerPaletteEntry({
  id: 'checkbox',
  label: 'Checkbox',
  Icon: CheckboxIcon,
  category: 'content',
  onSelect: async (bounds, consumeStrokes, context?) => {
    consumeStrokes();  // or consumeStrokes(...elementIds) to remove existing elements
    return {
      type: 'checkbox' as const,
      id: generateId(),
      transform: {
        values: [1, 0, 0, 0, 1, 0, bounds.left, bounds.top, 1] as [number, number, number, number, number, number, number, number, number],
      },
      checked: false,
      sourceStrokes: [],
    };
  },
});
```

## That's It!

Your new element type will automatically:
- Render when present in `noteElements`
- Be created from ink (if you implemented creation)
- Handle ink interactions (if you implemented interaction)
- Appear in the palette menu (if you registered a palette entry)

## Plugin Interface Reference

```typescript
interface ElementPlugin<T extends Element> {
  readonly elementType: string;  // Must match element's `type` field
  readonly name: string;

  // Creation (optional)
  canCreate?(strokes: Stroke[]): boolean;
  createFromInk?(
    strokes: Stroke[],
    context: CreationContext,
    recognitionResult?: HandwritingRecognitionResult
  ): Promise<CreationResult | null>;

  // Interaction (optional)
  triesEagerInteractions?: boolean;  // Respond on pen-up (before debounce)
  isInterestedIn?(element: T, strokes: Stroke[], strokeBounds: BoundingBox): boolean;
  acceptInk?(
    element: T,
    strokes: Stroke[],
    recognitionResult?: HandwritingRecognitionResult
  ): Promise<InteractionResult>;

  // Handle-based interaction (optional)
  getHandles?(element: T): HandleDescriptor[];
  onHandleDrag?(element: T, handleId: string, phase: HandleDragPhase, point: Offset): T;

  // Rendering (required)
  render(ctx: CanvasRenderingContext2D, element: T, options?: RenderOptions): void;
  getBounds(element: T): BoundingBox | null;
}
```

## Examples

- **Render-only**: See `src/elements/stroke/`, `src/elements/glyph/`
- **With creation**: See `src/elements/shape/`, `src/elements/inktext/`
- **Full-featured (creation + interaction)**: See `src/elements/tictactoe/`
- **Game with palette entry**: See `src/elements/minesweeper/`, `src/elements/bridges/`
- **Handle-based resizing**: See `src/elements/image/`
- **Palette with context**: See `src/elements/nonogram/` (uses `consumeStrokes(...ids)` and `context`)
