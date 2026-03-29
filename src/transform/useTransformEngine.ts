// React hook for a physics-based transform engine.
//
// Each element can have a velocity vector. A rAF loop applies velocity * dt
// each frame to move elements continuously.
//
// Forces are applied as instantaneous impulses: dv = force / mass.
// Physics properties (mass, pinned, collidable) are stored separately from
// transient state so they persist across rewind.
//
// Tracks total displacement per element so rewind can restore original positions.
// All per-frame updates are batched into a single callback to avoid stale state.

import { useRef, useCallback, useEffect, useState } from 'react';
import type { Vector2 } from './TransformOperation';
import { vec2Add, vec2Scale, ZERO_VECTOR } from './TransformOperation';
import type { BoundingBox } from '../types/primitives';
import { boundingBoxesIntersect } from '../types/primitives';
import type { Element } from '../types/elements';
import { CollisionShapeCache } from '../collision';
import { testPolylineCollision } from '../collision';

interface PhysicsBody {
  velocity: Vector2;
  /** Cumulative displacement since this body was created */
  totalDisplacement: Vector2;
}

/** Snapshot of an element's origin position for rewind. */
interface OriginSnapshot {
  /** Bounds center at the time the element entered physics. */
  center: Vector2;
}

/** Persistent physics properties for an element. Survives rewind. */
export interface PhysicsProperties {
  mass: number;
  /** If true, forces have no effect — element is immovable. */
  pinned: boolean;
  /** If true, this element participates in collision detection. */
  collidable: boolean;
}

interface UseTransformEngineOptions {
  /** Called once per frame with all element displacements batched together. */
  onBatchTranslate: (displacements: Map<string, Vector2>) => void;
  /** Returns current bounding box for an element. Needed for collision detection. */
  getBounds?: (elementId: string) => BoundingBox | null;
  /** Returns the full element for an ID. Needed for polyline collision shape building. */
  getElement?: (elementId: string) => Element | null;
}

export const DEFAULT_MASS = 1;

const DEFAULT_PROPERTIES: PhysicsProperties = {
  mass: DEFAULT_MASS,
  pinned: false,
  collidable: false,
};

export function useTransformEngine({ onBatchTranslate, getBounds, getElement }: UseTransformEngineOptions) {
  const bodiesRef = useRef<Map<string, PhysicsBody>>(new Map());
  /** Per-element physics properties — persist across rewind. */
  const propsRef = useRef<Map<string, PhysicsProperties>>(new Map());
  /** Bumped when physics properties change, so React consumers re-render. */
  const [propsVersion, setPropsVersion] = useState(0);
  const bumpVersion = () => setPropsVersion(v => v + 1);
  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const onBatchTranslateRef = useRef(onBatchTranslate);
  const getBoundsRef = useRef(getBounds);
  const getElementRef = useRef(getElement);
  const shapeCacheRef = useRef(new CollisionShapeCache());
  /** Origin positions for rewind — snapshotted when an element first enters physics. */
  const originsRef = useRef<Map<string, OriginSnapshot>>(new Map());

  useEffect(() => {
    onBatchTranslateRef.current = onBatchTranslate;
  }, [onBatchTranslate]);

  useEffect(() => {
    getBoundsRef.current = getBounds;
  }, [getBounds]);

  useEffect(() => {
    getElementRef.current = getElement;
  }, [getElement]);

  const getProps = (elementId: string): PhysicsProperties => {
    return propsRef.current.get(elementId) ?? DEFAULT_PROPERTIES;
  };

  const ensureProps = (elementId: string): PhysicsProperties => {
    let p = propsRef.current.get(elementId);
    if (!p) {
      p = { ...DEFAULT_PROPERTIES };
      propsRef.current.set(elementId, p);
    }
    return p;
  };

  /** Snapshot the element's current bounds center as its origin, if not already stored. */
  const snapshotOrigin = (elementId: string) => {
    if (originsRef.current.has(elementId)) return;
    const bounds = getBoundsRef.current?.(elementId);
    if (bounds) {
      originsRef.current.set(elementId, {
        center: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
      });
    }
  };

  const scheduleLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;
    lastTimeRef.current = null;

    const tick = (now: number) => {
      const dt = lastTimeRef.current !== null
        ? (now - lastTimeRef.current) / 1000
        : 0;
      lastTimeRef.current = now;

      const bodies = bodiesRef.current;
      const batch = new Map<string, Vector2>();

      for (const [elementId, body] of bodies) {
        const displacement = vec2Scale(body.velocity, dt);
        if (displacement.x !== 0 || displacement.y !== 0) {
          body.totalDisplacement = vec2Add(body.totalDisplacement, displacement);
          batch.set(elementId, displacement);
        }
      }

      if (batch.size > 0) {
        onBatchTranslateRef.current(batch);
      }

      // --- Polyline collision detection between collidable bodies ---
      {
        const shapeCache = shapeCacheRef.current;

        // Update cached shapes with this frame's displacements
        for (const [elementId, displacement] of batch) {
          shapeCache.translateShape(elementId, displacement);
        }

        // Collect collidable element IDs and ensure shapes exist.
        // After rewind the cache is empty — rebuild from current (rest) positions.
        const getElementFn = getElementRef.current;
        const collidableIds: string[] = [];
        for (const [elementId, props] of propsRef.current) {
          if (props.collidable) {
            if (!shapeCache.get(elementId)) {
              shapeCache.ensureBuilt(elementId, getElementFn?.(elementId) ?? null);
            }
            collidableIds.push(elementId);
          }
        }

        // Test all collidable pairs
        for (let i = 0; i < collidableIds.length; i++) {
          for (let j = i + 1; j < collidableIds.length; j++) {
            const idA = collidableIds[i];
            const idB = collidableIds[j];
            const shapeA = shapeCache.get(idA);
            const shapeB = shapeCache.get(idB);
            if (!shapeA || !shapeB) continue;

            // Narrow phase: polyline collision (includes its own expanded-AABB broad phase)
            const result = testPolylineCollision(shapeA, shapeB);
            if (!result.colliding) continue;

            // --- Collision response ---
            const { normal, depth } = result;
            // Ensure bodies exist for stationary collidable elements
            let bodyA = bodies.get(idA);
            if (!bodyA) {
              snapshotOrigin(idA);
              bodyA = { velocity: { ...ZERO_VECTOR }, totalDisplacement: { ...ZERO_VECTOR } };
              bodies.set(idA, bodyA);
            }
            let bodyB = bodies.get(idB);
            if (!bodyB) {
              snapshotOrigin(idB);
              bodyB = { velocity: { ...ZERO_VECTOR }, totalDisplacement: { ...ZERO_VECTOR } };
              bodies.set(idB, bodyB);
            }
            const propsA = getProps(idA);
            const propsB = getProps(idB);
            const massA = propsA.pinned ? Infinity : propsA.mass;
            const massB = propsB.pinned ? Infinity : propsB.mass;

            // Separation along collision normal
            // After separating, also update cached shapes so next-frame collision
            // detection sees the corrected positions (prevents repeated collision
            // with drifting normals that cause circular motion).
            if (massA === Infinity && massB === Infinity) {
              const sep = vec2Scale(normal, depth / 2);
              const sepNeg = vec2Scale(normal, -depth / 2);
              bodyA.totalDisplacement = vec2Add(bodyA.totalDisplacement, sepNeg);
              bodyB.totalDisplacement = vec2Add(bodyB.totalDisplacement, sep);
              onBatchTranslateRef.current(new Map([[idA, sepNeg], [idB, sep]]));
              shapeCache.translateShape(idA, sepNeg);
              shapeCache.translateShape(idB, sep);
            } else if (massA === Infinity) {
              const sep = vec2Scale(normal, depth);
              bodyB.totalDisplacement = vec2Add(bodyB.totalDisplacement, sep);
              onBatchTranslateRef.current(new Map([[idB, sep]]));
              shapeCache.translateShape(idB, sep);
            } else if (massB === Infinity) {
              const sep = vec2Scale(normal, -depth);
              bodyA.totalDisplacement = vec2Add(bodyA.totalDisplacement, sep);
              onBatchTranslateRef.current(new Map([[idA, sep]]));
              shapeCache.translateShape(idA, sep);
            } else {
              const totalMass = massA + massB;
              const sepA = vec2Scale(normal, -depth * (massB / totalMass));
              const sepB = vec2Scale(normal, depth * (massA / totalMass));
              bodyA.totalDisplacement = vec2Add(bodyA.totalDisplacement, sepA);
              bodyB.totalDisplacement = vec2Add(bodyB.totalDisplacement, sepB);
              onBatchTranslateRef.current(new Map([[idA, sepA], [idB, sepB]]));
              shapeCache.translateShape(idA, sepA);
              shapeCache.translateShape(idB, sepB);
            }

            // Velocity: decompose into normal + tangential, apply 1D elastic collision along normal
            const dot = (a: Vector2, b: Vector2) => a.x * b.x + a.y * b.y;
            const relVel = { x: bodyA.velocity.x - bodyB.velocity.x, y: bodyA.velocity.y - bodyB.velocity.y };
            const velAlongNormal = dot(relVel, normal);
            // Normal points from A toward B. Positive dot = A approaching B.
            // Negative = already separating, skip velocity response.
            if (velAlongNormal < 0) continue;

            const vnA = dot(bodyA.velocity, normal);
            const vnB = dot(bodyB.velocity, normal);

            if (massA === Infinity) {
              // Reflect B's normal component
              const newVnB = -vnB + 2 * vnA;
              const tangentB = { x: bodyB.velocity.x - vnB * normal.x, y: bodyB.velocity.y - vnB * normal.y };
              bodyB.velocity = { x: tangentB.x + newVnB * normal.x, y: tangentB.y + newVnB * normal.y };
            } else if (massB === Infinity) {
              // Reflect A's normal component
              const newVnA = -vnA + 2 * vnB;
              const tangentA = { x: bodyA.velocity.x - vnA * normal.x, y: bodyA.velocity.y - vnA * normal.y };
              bodyA.velocity = { x: tangentA.x + newVnA * normal.x, y: tangentA.y + newVnA * normal.y };
            } else {
              const totalMass = massA + massB;
              const newVnA = ((massA - massB) / totalMass) * vnA + (2 * massB / totalMass) * vnB;
              const newVnB = (2 * massA / totalMass) * vnA + ((massB - massA) / totalMass) * vnB;
              const tangentA = { x: bodyA.velocity.x - vnA * normal.x, y: bodyA.velocity.y - vnA * normal.y };
              const tangentB = { x: bodyB.velocity.x - vnB * normal.x, y: bodyB.velocity.y - vnB * normal.y };
              bodyA.velocity = { x: tangentA.x + newVnA * normal.x, y: tangentA.y + newVnA * normal.y };
              bodyB.velocity = { x: tangentB.x + newVnB * normal.x, y: tangentB.y + newVnB * normal.y };
            }
          }
        }
      }

      if (bodies.size > 0) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
        lastTimeRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  /**
   * Apply a force vector to an element as an instantaneous impulse.
   * dv = force / mass. Heavier elements accelerate less.
   * Pinned elements ignore forces entirely.
   */
  const applyForce = useCallback((elementId: string, force: Vector2) => {
    const props = getProps(elementId);
    if (props.pinned) return;

    const bodies = bodiesRef.current;
    const body = bodies.get(elementId);
    const dv = vec2Scale(force, 1 / props.mass);

    if (body) {
      body.velocity = vec2Add(body.velocity, dv);
    } else {
      snapshotOrigin(elementId);
      bodies.set(elementId, {
        velocity: { ...dv },
        totalDisplacement: { ...ZERO_VECTOR },
      });
    }
    scheduleLoop();
  }, [scheduleLoop]);

  /**
   * Add velocity directly, bypassing mass. Works on any element
   * regardless of mass or pinned state.
   */
  const addVelocity = useCallback((elementId: string, dv: Vector2) => {
    const bodies = bodiesRef.current;
    const body = bodies.get(elementId);

    if (body) {
      body.velocity = vec2Add(body.velocity, dv);
    } else {
      snapshotOrigin(elementId);
      bodies.set(elementId, {
        velocity: { ...dv },
        totalDisplacement: { ...ZERO_VECTOR },
      });
    }
    scheduleLoop();
  }, [scheduleLoop]);

  /** Set mass for an element. Persists across rewind. */
  const setMass = useCallback((elementId: string, mass: number) => {
    if (mass <= 0) return;
    const p = ensureProps(elementId);
    p.mass = mass;
    bumpVersion();
  }, []);

  /** Get mass for an element. Returns DEFAULT_MASS if not set. */
  const getMass = useCallback((elementId: string): number => {
    return getProps(elementId).mass;
  }, []);

  /** Pin an element (infinite mass — immune to forces). */
  const setPinned = useCallback((elementId: string, pinned: boolean) => {
    const p = ensureProps(elementId);
    p.pinned = pinned;
    if (pinned) {
      bodiesRef.current.delete(elementId);
    }
    bumpVersion();
  }, []);

  /** Check if an element is pinned. */
  const isPinned = useCallback((elementId: string): boolean => {
    return getProps(elementId).pinned;
  }, []);

  /** Set whether an element participates in collision detection. */
  const setCollidable = useCallback((elementId: string, collidable: boolean) => {
    const p = ensureProps(elementId);
    p.collidable = collidable;
    // Eagerly build collision shape from the element's current (rest) position
    if (collidable) {
      const el = getElementRef.current?.(elementId) ?? null;
      shapeCacheRef.current.ensureBuilt(elementId, el);
    } else {
      shapeCacheRef.current.invalidate(elementId);
    }
    bumpVersion();
  }, []);

  /** Check if an element is collidable. */
  const isCollidable = useCallback((elementId: string): boolean => {
    return getProps(elementId).collidable;
  }, []);

  /** Get all physics properties for an element. */
  const getPhysicsProperties = useCallback((elementId: string): PhysicsProperties => {
    return { ...getProps(elementId) };
  }, [propsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Stop all velocity on an element. Properties are preserved. */
  const stopElement = useCallback((elementId: string) => {
    bodiesRef.current.delete(elementId);
  }, []);

  /** Stop all physics bodies. Properties are preserved. */
  const stopAll = useCallback(() => {
    bodiesRef.current.clear();
  }, []);

  /**
   * Rewind all elements to their original positions.
   * Uses snapshotted origin positions for accuracy instead of accumulated
   * displacement, which can drift due to collision separations.
   * Physics properties (mass, pinned, collidable) are preserved.
   */
  const rewind = useCallback(() => {
    const bodies = bodiesRef.current;
    const origins = originsRef.current;
    const batch = new Map<string, Vector2>();

    for (const [elementId] of bodies) {
      const origin = origins.get(elementId);
      if (!origin) continue;
      const currentBounds = getBoundsRef.current?.(elementId);
      if (!currentBounds) continue;
      const currentCenter: Vector2 = {
        x: (currentBounds.left + currentBounds.right) / 2,
        y: (currentBounds.top + currentBounds.bottom) / 2,
      };
      const reversal: Vector2 = {
        x: origin.center.x - currentCenter.x,
        y: origin.center.y - currentCenter.y,
      };
      if (reversal.x !== 0 || reversal.y !== 0) {
        batch.set(elementId, reversal);
      }
    }

    if (batch.size > 0) {
      onBatchTranslateRef.current(batch);
    }
    bodies.clear();
    origins.clear();
    shapeCacheRef.current.clear();
  }, []);

  /** Get current velocity of an element (or zero). */
  const getVelocity = useCallback((elementId: string): Vector2 => {
    return bodiesRef.current.get(elementId)?.velocity ?? ZERO_VECTOR;
  }, []);

  /** Whether any element has active physics. */
  const hasActiveBodies = useCallback(() => {
    return bodiesRef.current.size > 0;
  }, []);

  /**
   * Load physics properties from a serialized record (e.g. from saved note).
   * Merges with existing properties.
   */
  const loadProperties = useCallback((record: Record<string, { mass?: number; pinned?: boolean; collidable?: boolean }>) => {
    for (const [elementId, stored] of Object.entries(record)) {
      const p = ensureProps(elementId);
      if (stored.mass !== undefined) p.mass = stored.mass;
      if (stored.pinned !== undefined) p.pinned = stored.pinned;
      if (stored.collidable !== undefined) p.collidable = stored.collidable;
      // Eagerly build collision shapes for collidable elements at their rest positions
      if (p.collidable) {
        const el = getElementRef.current?.(elementId) ?? null;
        shapeCacheRef.current.ensureBuilt(elementId, el);
      }
    }
    bumpVersion();
  }, []);

  /**
   * Serialize all non-default physics properties to a plain record
   * suitable for JSON storage.
   */
  const serializeProperties = useCallback((): Record<string, { mass?: number; pinned?: boolean; collidable?: boolean }> => {
    const result: Record<string, { mass?: number; pinned?: boolean; collidable?: boolean }> = {};
    for (const [elementId, p] of propsRef.current) {
      const stored: { mass?: number; pinned?: boolean; collidable?: boolean } = {};
      if (p.mass !== DEFAULT_MASS) stored.mass = p.mass;
      if (p.pinned) stored.pinned = true;
      if (p.collidable) stored.collidable = true;
      if (Object.keys(stored).length > 0) {
        result[elementId] = stored;
      }
    }
    return result;
  }, []);

  return {
    applyForce, addVelocity,
    setMass, getMass,
    setPinned, isPinned,
    setCollidable, isCollidable,
    getPhysicsProperties,
    stopElement, stopAll, rewind,
    getVelocity, hasActiveBodies,
    loadProperties, serializeProperties,
  };
}
