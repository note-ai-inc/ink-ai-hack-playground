// Element Plugin Interface - unified interface for element types
//
// Each element type implements this interface to provide:
// - Rendering (required)
// - Creation from ink (optional)
// - Interaction with ink (optional)
// - Handle-based interaction (optional)

import type { Stroke, BoundingBox, Element, Offset } from '../../types';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import type { StrokeRenderOptions } from '../../canvas/StrokeRenderer';

// ============================================================================
// Handle Types
// ============================================================================

/**
 * Visual appearance configuration for a handle.
 */
export interface HandleAppearance {
  shape: 'circle' | 'square' | 'diamond';
  size: number;                  // Diameter/width in pixels
  fillColor?: string;            // Default: '#ffffff'
  strokeColor?: string;          // Default: '#333333'
  strokeWidth?: number;          // Default: 1
  activeFillColor?: string;      // When being dragged (default: '#0066ff')
}

/**
 * Describes a draggable handle on an element.
 * Framework uses this for hit testing and rendering.
 */
export interface HandleDescriptor {
  id: string;                    // Unique handle identifier (e.g., 'xPositive', 'point-0')
  position: Offset;              // Position in CANVAS coordinates
  hitRadius?: number;            // Hit test radius (default: 10)
  cursor?: string;               // CSS cursor style (default: 'pointer')
  appearance?: HandleAppearance; // Visual styling (optional, has defaults)
}

/**
 * Phase of a handle drag operation.
 */
export type HandleDragPhase = 'start' | 'update' | 'end';

// Legacy HandleInfo type - kept for backward compatibility during migration
// @deprecated Use HandleDescriptor instead
export interface HandleInfo {
  id: string;           // Unique handle identifier (e.g., 'xPositive', 'yNegative')
  position: Offset;     // Current position of the handle
  cursor?: string;      // Optional cursor style for this handle
}

// Context provided when creating elements
export interface CreationContext {
  existingElements: Element[];
  canvasWidth: number;
  canvasHeight: number;
}

// Result of element creation
export interface CreationResult {
  elements: Element[];
  consumedStrokes: Stroke[];
  confidence: number;
  // Optional: IDs of existing elements to remove (e.g., circles consumed by Bridges)
  consumedElementIds?: string[];
  // Optional: alternative candidates for disambiguation
  // When provided, indicates other viable shape types with close confidence
  alternativeCandidates?: AlternativeCandidate[];
}

// Alternative candidate for disambiguation menu
export interface AlternativeCandidate {
  label: string;
  elementType: string;  // 'shape' | 'inktext' | 'tictactoe'
  shapeType?: string;   // ShapeType from shapeRecognition (only for shapes)
  confidence: number;
}

// Result of element interaction
export interface InteractionResult {
  element: Element;
  consumed: boolean;
  strokesConsumed: Stroke[];
}

// Render options passed to plugins
export interface RenderOptions {
  strokeOptions?: StrokeRenderOptions;
  // Morph animation progress for shapes (0 = source strokes, 1 = final shape)
  morphProgress?: number;
}

/**
 * ElementPlugin interface - defines all capabilities for an element type.
 *
 * A plugin must implement:
 * - elementType: string matching the element's `type` field
 * - name: human-readable name
 * - render: render the element to canvas
 * - getBounds: calculate element bounding box
 *
 * A plugin may optionally implement:
 * - isElementOfType: type guard for this element type
 * - canCreate: quick check if strokes could create this element
 * - createFromInk: create element from strokes
 * - isInterestedIn: check if element wants to handle strokes
 * - acceptInk: handle strokes and update element
 */
export interface ElementPlugin<T extends Element = Element> {
  // Identification
  readonly elementType: string; // Must match element's `type` field
  readonly name: string; // Human-readable name

  // Creation (optional)
  canCreate?(strokes: Stroke[]): boolean;
  createFromInk?(
    strokes: Stroke[],
    context: CreationContext,
    recognitionResult?: HandwritingRecognitionResult
  ): Promise<CreationResult | null>;

  // When true, interaction is attempted immediately on stroke completion
  // (bypassing the debounce). Use for tap-based games like Minesweeper.
  readonly triesEagerInteractions?: boolean;

  // Interaction (optional)
  isInterestedIn?(element: T, strokes: Stroke[], strokeBounds: BoundingBox): boolean;
  acceptInk?(
    element: T,
    strokes: Stroke[],
    recognitionResult?: HandwritingRecognitionResult
  ): Promise<InteractionResult>;

  // === Handle-based Interaction (NEW unified API) ===

  /**
   * Return all handles for this element.
   * Framework uses this for:
   * - Hit testing (checks point against each handle position + hitRadius)
   * - Rendering (draws handles with specified appearance)
   */
  getHandles?(element: T): HandleDescriptor[];

  /**
   * Handle drag behavior for all lifecycle phases.
   * @param element - Current element state
   * @param handleId - ID of the handle being dragged (from HandleDescriptor.id)
   * @param phase - 'start' | 'update' | 'end'
   * @param point - Current pointer position in CANVAS coordinates
   * @returns Updated element (or same element if no change)
   */
  onHandleDrag?(element: T, handleId: string, phase: HandleDragPhase, point: Offset): T;

  // Rendering (required)
  render(ctx: CanvasRenderingContext2D, element: T, options?: RenderOptions): void;
  getBounds(element: T): BoundingBox | null;
}
