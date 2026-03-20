// Element Registry - central registry for element plugins
//
// Provides:
// - Plugin registration
// - Rendering dispatch
// - Creation dispatch
// - Interaction dispatch

import type { Element, Stroke, BoundingBox } from '../../types';
import type {
  ElementPlugin,
  CreationContext,
  CreationResult,
  InteractionResult,
  RenderOptions,
  HandleDescriptor,
  HandleDragPhase,
} from './ElementPlugin';
import type { Offset } from '../../types';
import type { DisambiguationCandidate } from '../../disambiguation/DisambiguationIntent';
import type { ShapeType } from '../../geometry/shapeRecognition';
import type { HandwritingRecognitionResult } from '../../recognition/RecognitionService';
import { debugLog } from '../../debug/DebugLogger';

// Cross-type disambiguation thresholds
const CROSS_TYPE_DISAMBIGUATION_THRESHOLD = 0.20; // Max confidence gap for cross-type disambiguation (increased)
const CROSS_TYPE_MIN_CONFIDENCE = 0.35; // Minimum confidence for a candidate to participate (lowered for short words)

// Handle interaction defaults
const DEFAULT_HIT_RADIUS = 10;

// Registry of element plugins by type
const plugins = new Map<string, ElementPlugin<Element>>();

/**
 * Register an element plugin.
 */
export function registerPlugin<T extends Element>(plugin: ElementPlugin<T>): void {
  plugins.set(plugin.elementType, plugin as ElementPlugin<Element>);
  debugLog.info(`Registered plugin: ${plugin.name} (${plugin.elementType})`);
}

/**
 * Get a plugin by element type.
 */
export function getPlugin(elementType: string): ElementPlugin<Element> | undefined {
  return plugins.get(elementType);
}

/**
 * Get all registered plugins.
 */
export function getPlugins(): ElementPlugin<Element>[] {
  return Array.from(plugins.values());
}

// ============================================================================
// Rendering Dispatch
// ============================================================================

/**
 * Render any element using its registered plugin.
 */
export function renderElement(
  ctx: CanvasRenderingContext2D,
  element: Element,
  options?: RenderOptions
): void {
  const plugin = plugins.get(element.type);
  if (plugin) {
    plugin.render(ctx, element, options);
  } else {
    debugLog.warn(`No plugin registered for element type: ${element.type}`);
  }
}

/**
 * Get bounding box for any element using its registered plugin.
 */
export function getElementBounds(element: Element): BoundingBox | null {
  const plugin = plugins.get(element.type);
  if (plugin) {
    return plugin.getBounds(element);
  }
  debugLog.warn(`No plugin registered for element type: ${element.type}`);
  return null;
}

// ============================================================================
// Creation Dispatch
// ============================================================================

/**
 * Try all registered plugins to create an element from strokes.
 * Returns the result with highest confidence.
 */
export async function tryCreateElement(
  strokes: Stroke[],
  context: CreationContext,
  recognitionResult?: HandwritingRecognitionResult
): Promise<CreationResult | null> {
  const results: CreationResult[] = [];

  const creatablePlugins = Array.from(plugins.values()).filter(
    (p) => p.canCreate && p.createFromInk
  );

  debugLog.info('tryCreateElement', {
    strokeCount: strokes.length,
    plugins: creatablePlugins.map((p) => p.name),
  });

  for (const plugin of creatablePlugins) {
    if (!plugin.canCreate!(strokes)) {
      debugLog.info(`Plugin ${plugin.name}: canCreate=false`);
      continue;
    }

    debugLog.info(`Plugin ${plugin.name}: canCreate=true, calling createFromInk`);
    try {
      const result = await plugin.createFromInk!(strokes, context, recognitionResult);
      if (result && result.confidence > 0) {
        debugLog.info(`Plugin ${plugin.name}: success`, { confidence: result.confidence });
        results.push(result);
      } else {
        debugLog.info(`Plugin ${plugin.name}: returned null or zero confidence`);
      }
    } catch (error) {
      debugLog.error(`Plugin ${plugin.name} failed`, error);
    }
  }

  if (results.length === 0) {
    debugLog.warn('tryCreateElement: no plugins produced results');
    return null;
  }

  // Return the result with highest confidence
  const best = results.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );
  debugLog.info('tryCreateElement: returning best result', { confidence: best.confidence });
  return best;
}

/**
 * Result of tryCreateElementWithDisambiguation
 */
export interface DisambiguationResult {
  result: CreationResult | null;
  needsDisambiguation: boolean;
  candidates?: DisambiguationCandidate[];
}

/**
 * Try all registered plugins to create an element from strokes.
 * Returns the result with highest confidence, plus information about
 * whether disambiguation is needed (including cross-element-type disambiguation).
 */
export async function tryCreateElementWithDisambiguation(
  strokes: Stroke[],
  context: CreationContext,
  recognitionResult?: HandwritingRecognitionResult
): Promise<DisambiguationResult> {
  // Collect results from ALL plugins (not just the best one)
  const allResults: Array<{ pluginType: string; result: CreationResult }> = [];

  const creatablePlugins = Array.from(plugins.values()).filter(
    (p) => p.canCreate && p.createFromInk
  );

  debugLog.info('tryCreateElementWithDisambiguation', {
    strokeCount: strokes.length,
    plugins: creatablePlugins.map((p) => p.name),
  });

  for (const plugin of creatablePlugins) {
    if (!plugin.canCreate!(strokes)) {
      debugLog.info(`Plugin ${plugin.name}: canCreate=false`);
      continue;
    }

    debugLog.info(`Plugin ${plugin.name}: canCreate=true, calling createFromInk`);
    try {
      const result = await plugin.createFromInk!(strokes, context, recognitionResult);
      if (result && result.confidence >= CROSS_TYPE_MIN_CONFIDENCE) {
        debugLog.info(`Plugin ${plugin.name}: success`, { confidence: result.confidence });
        allResults.push({ pluginType: plugin.elementType, result });
      } else if (result) {
        debugLog.info(`Plugin ${plugin.name}: confidence too low for cross-type`, {
          confidence: result.confidence,
          threshold: CROSS_TYPE_MIN_CONFIDENCE,
        });
      } else {
        debugLog.info(`Plugin ${plugin.name}: returned null`);
      }
    } catch (error) {
      debugLog.error(`Plugin ${plugin.name} failed`, error);
    }
  }

  if (allResults.length === 0) {
    debugLog.warn('tryCreateElementWithDisambiguation: no plugins produced results');
    return {
      result: null,
      needsDisambiguation: false,
    };
  }

  // Sort by confidence descending
  allResults.sort((a, b) => b.result.confidence - a.result.confidence);
  const bestResult = allResults[0];

  debugLog.info('tryCreateElementWithDisambiguation: collected results', {
    resultCount: allResults.length,
    results: allResults.map(r => `${r.pluginType}(${r.result.confidence.toFixed(2)})`),
    bestType: bestResult.pluginType,
    bestConfidence: bestResult.result.confidence.toFixed(2),
  });

  // Build cross-type candidates list
  // Include all results within the threshold of the best
  const crossTypeCandidates: DisambiguationCandidate[] = [];

  for (const { pluginType, result } of allResults) {
    const confidenceGap = bestResult.result.confidence - result.confidence;
    debugLog.info(`Processing result for ${pluginType}`, {
      confidence: result.confidence.toFixed(2),
      gap: confidenceGap.toFixed(2),
      threshold: CROSS_TYPE_DISAMBIGUATION_THRESHOLD,
      withinThreshold: confidenceGap <= CROSS_TYPE_DISAMBIGUATION_THRESHOLD,
      hasAlternatives: result.alternativeCandidates?.length ?? 0,
    });
    if (confidenceGap > CROSS_TYPE_DISAMBIGUATION_THRESHOLD) {
      continue; // Too far from the best, skip
    }

    // If this result has its own alternativeCandidates (e.g., shape with multiple shape types),
    // add those instead of a single entry
    if (result.alternativeCandidates && result.alternativeCandidates.length > 0) {
      for (const alt of result.alternativeCandidates) {
        // Only include if within threshold of the best overall result
        const altGap = bestResult.result.confidence - alt.confidence;
        if (altGap <= CROSS_TYPE_DISAMBIGUATION_THRESHOLD) {
          crossTypeCandidates.push({
            label: alt.label,
            elementType: alt.elementType,
            shapeType: alt.shapeType as ShapeType | undefined,
            confidence: alt.confidence,
            icon: alt.shapeType ?? alt.elementType,
          });
        }
      }
    } else {
      // Single element type candidate (e.g., InkText, TicTacToe)
      const element = result.elements[0];
      crossTypeCandidates.push({
        label: getElementLabel(pluginType, element),
        elementType: pluginType,
        confidence: result.confidence,
        icon: pluginType,
      });
    }
  }

  // Remove duplicates (same elementType + shapeType)
  const uniqueCandidates = deduplicateCandidates(crossTypeCandidates);

  debugLog.info('tryCreateElementWithDisambiguation: cross-type analysis', {
    totalResults: allResults.length,
    uniqueCandidates: uniqueCandidates.length,
    candidates: uniqueCandidates.map(c => `${c.elementType}:${c.label}(${c.confidence.toFixed(2)})`),
  });

  // Check if disambiguation is needed
  // Need at least 2 candidates, or 1 candidate with multiple shape alternatives
  const needsDisambiguation = uniqueCandidates.length >= 2;

  if (needsDisambiguation) {
    debugLog.info('tryCreateElementWithDisambiguation: disambiguation needed', {
      candidateCount: uniqueCandidates.length,
    });

    return {
      result: bestResult.result,
      needsDisambiguation: true,
      candidates: uniqueCandidates,
    };
  }

  return {
    result: bestResult.result,
    needsDisambiguation: false,
  };
}

/**
 * Get a human-readable label for an element.
 */
function getElementLabel(elementType: string, element: Element): string {
  switch (elementType) {
    case 'inkText': {
      // Extract recognized text from InkTextElement
      const inkTextEl = element as { lines?: Array<{ tokens?: Array<{ text?: string }> }> };
      const text = inkTextEl.lines
        ?.flatMap(l => l.tokens?.map(t => t.text) ?? [])
        .join(' ')
        .trim();
      if (text) {
        // Truncate long text
        const displayText = text.length > 15 ? text.slice(0, 12) + '...' : text;
        return `Text: ${displayText}`;
      }
      return 'Text';
    }
    case 'tictactoe':
      return 'TicTacToe';
    case 'shape':
      return 'Shape';
    default:
      return elementType;
  }
}

/**
 * Remove duplicate candidates (same elementType + shapeType).
 * Keep the one with highest confidence.
 */
function deduplicateCandidates(candidates: DisambiguationCandidate[]): DisambiguationCandidate[] {
  const seen = new Map<string, DisambiguationCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.elementType}:${candidate.shapeType ?? ''}`;
    const existing = seen.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      seen.set(key, candidate);
    }
  }

  // Return sorted by confidence descending
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// Interaction Dispatch
// ============================================================================

/**
 * Get bounding box of a set of strokes.
 */
export function getStrokesBoundingBox(strokes: Stroke[]): BoundingBox | null {
  if (strokes.length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const stroke of strokes) {
    for (const input of stroke.inputs.inputs) {
      left = Math.min(left, input.x);
      top = Math.min(top, input.y);
      right = Math.max(right, input.x);
      bottom = Math.max(bottom, input.y);
    }
    const halfSize = stroke.brush.size / 2;
    left -= halfSize;
    top -= halfSize;
    right += halfSize;
    bottom += halfSize;
  }

  return { left, top, right, bottom };
}

/**
 * Try to find an element that wants to handle the given strokes.
 * Returns the interaction result if an element accepts the strokes.
 *
 * @param elements - All elements on the canvas, checked in order.
 * @param strokes - The strokes to offer to elements.
 * @param recognitionResult - Optional pre-computed handwriting recognition.
 * @param isEagerInteraction - When true, only try plugins with
 *   `triesEagerInteractions: true`. Used on immediate pen-up to give
 *   tap-based games instant feedback without waiting for the debounce timer.
 */
export async function tryInteraction(
  elements: Element[],
  strokes: Stroke[],
  recognitionResult?: HandwritingRecognitionResult,
  isEagerInteraction?: boolean,
): Promise<{ elementId: string; result: InteractionResult } | null> {
  const strokeBounds = getStrokesBoundingBox(strokes);
  if (!strokeBounds) return null;

  for (const element of elements) {
    const plugin = plugins.get(element.type);
    if (!plugin || !plugin.isInterestedIn || !plugin.acceptInk) {
      continue;
    }

    if (isEagerInteraction && !plugin.triesEagerInteractions) {
      continue;
    }

    // Check if plugin is interested
    if (!plugin.isInterestedIn(element, strokes, strokeBounds)) {
      continue;
    }

    try {
      const result = await plugin.acceptInk(element, strokes, recognitionResult);
      if (result.consumed) {
        return { elementId: element.id, result };
      }
    } catch (error) {
      debugLog.error(`Interaction error for ${plugin.name}`, error);
    }
  }

  return null;
}

// ============================================================================
// Handle-based Interaction (Unified API)
// ============================================================================

/**
 * Result of finding a handle at a point.
 */
export interface HandleHitResult {
  element: Element;
  handle: HandleDescriptor;
}

/**
 * Get all handles for an element.
 */
export function getElementHandles(element: Element): HandleDescriptor[] {
  const plugin = plugins.get(element.type);
  if (plugin?.getHandles) {
    return plugin.getHandles(element);
  }
  return [];
}

/**
 * Get all handles for all elements (for rendering).
 */
export function getAllHandles(elements: Element[]): Array<{ elementId: string; handles: HandleDescriptor[] }> {
  return elements
    .map(el => ({ elementId: el.id, handles: getElementHandles(el) }))
    .filter(item => item.handles.length > 0);
}

/**
 * Find a handle at a given canvas point.
 * Framework performs hit testing against all handle positions.
 */
export function findHandleAtPoint(elements: Element[], point: Offset): HandleHitResult | null {
  // Iterate in reverse (topmost first)
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    const handles = getElementHandles(element);

    for (const handle of handles) {
      const hitRadius = handle.hitRadius ?? DEFAULT_HIT_RADIUS;
      const dx = point.x - handle.position.x;
      const dy = point.y - handle.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= hitRadius) {
        return { element, handle };
      }
    }
  }

  return null;
}

/**
 * Dispatch handle drag event to plugin.
 */
export function dispatchHandleDrag(
  element: Element,
  handleId: string,
  phase: HandleDragPhase,
  point: Offset
): Element {
  const plugin = plugins.get(element.type);
  if (plugin?.onHandleDrag) {
    return plugin.onHandleDrag(element, handleId, phase, point);
  }
  return element;
}
