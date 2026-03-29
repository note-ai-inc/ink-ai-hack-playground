# Transform Engine — Design & Roadmap

## Current State

The engine is a physics simulation loop (`useTransformEngine`) that runs via `requestAnimationFrame`. Each element can be registered as a `PhysicsBody` with a velocity vector. Per frame, the engine computes `displacement = velocity * dt`, batches all element displacements, and emits a single `onBatchTranslate` callback. It tracks cumulative displacement per body for rewind.

**What exists today:**
- `Vector2` type with `vec2Add`, `vec2Scale`, `vec2Magnitude`
- `PhysicsBody` with `velocity` and `totalDisplacement`
- `applyForce(elementId, force)` — impulse that changes velocity (dv = force / mass, mass=1)
- `translateElement(element, displacement)` — pure function, handles strokes (point translation) and transformable elements (matrix translation)
- `rewind()` — reverses all accumulated displacement and clears bodies
- Batched per-frame updates so multiple elements move simultaneously

**Matrix infrastructure already in `primitives.ts`:**
- `createTranslationMatrix`, `createRotationMatrix`, `createScaleMatrix`
- `multiplyMatrices`, `applyMatrix`
- All non-stroke elements have a `transform: Matrix` field

## Transformations to Implement

### 1. Physics Properties on Bodies

Extend `PhysicsBody` to support richer simulation.

```
PhysicsBody {
  velocity: Vector2
  mass: number              // default 1; affects force response (dv = F/m)
  angularVelocity: number   // radians/s — for continuous spin
  friction: number           // 0–1 coefficient; velocity *= (1 - friction * dt) per frame
  restitution: number       // 0–1 bounciness for collisions
  pinned: boolean           // if true, forces have no effect (static body)
}
```

**Friction/drag** is the most impactful addition — without it, elements accelerate forever. A linear drag model (`v *= 1 - friction * dt`) gives natural deceleration. Setting friction=0 keeps current behavior; friction=1 is heavy damping.

### 2. Continuous Forces (Gravity, Wind)

Currently forces are impulses (one-shot velocity changes). Add support for **persistent forces** that apply every frame.

```
EnvironmentForce {
  id: string
  vector: Vector2           // force direction and magnitude
  affects: 'all' | string[] // which element IDs, or all
}
```

Per frame: `velocity += (sum of forces / mass) * dt` for each body.

**Use cases:**
- **Gravity**: `{ vector: { x: 0, y: 300 }, affects: 'all' }` — everything falls
- **Wind**: `{ vector: { x: 50, y: 0 }, affects: 'all' }` — lateral drift
- **Per-element thrust**: targeted force on specific elements

### 3. Rotation

Two modes, both operating on the existing `transform: Matrix`:

**a) Continuous spin** — `angularVelocity` on `PhysicsBody`, applied per frame:
- Decompose current matrix → extract current angle → add `angularVelocity * dt` → recompose
- Or: multiply current transform by `createRotationMatrix(angularVelocity * dt)` around element center

**b) Torque impulse** — like `applyForce` but rotational:
- `applyTorque(elementId, torque: number)` → `angularVelocity += torque / mass`

**Spell menu addition:** Rotate CW / Rotate CCW buttons with torque impulse.

**Rewind:** Track `totalRotation` alongside `totalDisplacement` and reverse it.

### 4. Scale

Animate size changes over time.

**a) Scale velocity** — `scaleRate: number` on body (multiplier per second):
- Per frame: multiply transform by `createScaleMatrix(1 + scaleRate * dt, 1 + scaleRate * dt)`
- Grows/shrinks continuously

**b) Scale impulse:**
- `applyScaleImpulse(elementId, factor: number)` → sets or adds to scale rate

**Spell menu addition:** Grow / Shrink buttons.

**Rewind:** Track `totalScaleFactor` and apply inverse.

### 5. Boundaries & Collision

**a) Canvas boundaries** — prevent elements from leaving the visible area:
- Per frame, after applying displacement, check if element bounds exceed canvas bounds
- If so: clamp position and reflect velocity (`v.x *= -restitution`)
- Requires knowing canvas/viewport dimensions (passed to engine or callback)

**b) Element-element collision:**
- Broad phase: AABB overlap check between all active bodies
- Narrow phase: for now, treat elements as their bounding boxes
- Response: elastic collision using mass and restitution
  - `v1' = v1 - (2*m2/(m1+m2)) * dot(v1-v2, x1-x2)/|x1-x2|^2 * (x1-x2)`
- This is the most complex feature — implement after basics are solid

### 6. Springs & Constraints

Attach elements to anchor points or to each other.

```
Spring {
  elementId: string
  anchor: Vector2 | string  // fixed point or another element ID
  stiffness: number         // spring constant k
  damping: number           // damping coefficient
  restLength: number        // natural length
}
```

Per frame: `force = -stiffness * (distance - restLength) * direction - damping * velocity`

**Use cases:**
- **Rubber band**: element oscillates around its original position
- **Tether**: two elements connected, pull each other
- **Snap-back**: like rewind but animated with overshoot

### 7. Path Following

Move an element along a drawn stroke path.

```
PathFollow {
  elementId: string
  path: Vector2[]           // sampled points from a stroke
  speed: number             // px/s along the path
  loop: boolean             // restart at beginning when done
}
```

Per frame: advance `t` along path by `speed * dt`, interpolate position.

**Use case:** Draw a path, then tell an element to follow it. Could be triggered by drawing a stroke that starts on an element.

### 8. Orbit

Circular motion around a point or another element.

```
Orbit {
  elementId: string
  center: Vector2 | string  // fixed point or another element ID
  radius: number
  angularSpeed: number      // radians/s
}
```

Per frame: `position = center + radius * (cos(angle), sin(angle))`, where `angle += angularSpeed * dt`.

This is a special case of path following (circular path), but simpler to implement directly.

### 9. Non-Motion Transforms

These don't move the element but change its visual properties over time.

**a) Opacity/fade:**
- `targetOpacity: number`, `fadeSpeed: number`
- Requires adding an `opacity` field to elements (rendered via canvas `globalAlpha`)

**b) Color animation:**
- Cycle hue, pulse brightness, or lerp between two colors
- Operates on stroke color / fill color fields

**c) Visibility toggle:**
- `visible: boolean` on body — engine can hide/show on a timer
- Blinking effect: toggle at a frequency

**d) Stroke width animation:**
- Pulse or grow stroke width over time

These require the engine to emit non-positional updates — extending the batch callback beyond just `Vector2` displacements.

## Implementation Priority

| Priority | Feature | Reason |
|----------|---------|--------|
| **P0** | Friction/drag | Without it, elements accelerate forever — essential for usability |
| **P0** | Mass on bodies | Already stubbed (`DEFAULT_MASS`), just needs UI to set it |
| **P1** | Gravity (env forces) | Most intuitive physics interaction |
| **P1** | Rotation (spin + torque) | Natural companion to translation |
| **P1** | Canvas boundaries + bounce | Elements flying offscreen is frustrating |
| **P2** | Scale animation | Fun but less essential |
| **P2** | Springs | Enables interesting connected behaviors |
| **P2** | Path following | Powerful for animation/storytelling |
| **P1** | Discrete state swap | Simplest object transform — enables game resets, type morphing |
| **P2** | Color lerp states | Numeric interpolation, most elements have color |
| **P2** | Bitmap crossfade | High visual impact for image style transitions |
| **P3** | Element-element collision | Complex, high payoff for physics sandbox |
| **P3** | Orbit | Niche but cool |
| **P3** | Non-motion transforms | Requires extending render pipeline |
| **P3** | Path morphing | Point matching is complex, visually striking for shapes |
| **P3** | Timer/cycled states | Enables animation sequences and slideshows |

## 10. Object State Transforms

Sections 1–9 move, rotate, scale, or restyle an element — but the element stays the same *kind* of thing. Object state transforms change **what the element is**: its internal data, its type, or which of several discrete states it occupies. Think of a shape morphing from a circle to a square, or a game board resetting to a new puzzle.

### Concept: State Snapshots

An element can have multiple named **state snapshots** — frozen copies of its internal data at a point in time. The engine can transition between them.

```
StateSnapshot {
  name: string              // e.g. "circle", "square", "solved", "initial"
  elementData: Partial<Element>  // the fields that differ in this state
}

StateMachine {
  elementId: string
  states: StateSnapshot[]
  currentIndex: number
  transition: 'instant' | 'lerp' | 'morph'
  transitionDurationMs: number
}
```

The engine stores a `StateMachine` per element. Advancing the state replaces the element's data with the next snapshot, optionally animating interpolable fields.

### State categories by element type

**Drawing elements** — Stroke, Shape, InkText, CoordinatePlane:

| From | To | What changes |
|------|----|-------------|
| Shape (circle) | Shape (square) | `paths` — morph path geometry between two SVG-style paths |
| Shape (red) | Shape (blue) | `paths[].strokeColor`, `paths[].fillColor` — color lerp |
| Stroke (thin) | Stroke (thick) | `strokes[].brush.size` — interpolate brush size |
| Stroke (original) | Stroke (simplified) | `strokes[].inputs` — reduce point count / smooth |
| InkText (raw) | InkText (reflowed) | `layoutWidth` change triggers line reflow |
| CoordinatePlane | CoordinatePlane | `gridSpacing`, `gridCount`, axis lengths — zoom in/out on data |

**Media elements** — Image, SketchableImage:

| From | To | What changes |
|------|----|-------------|
| SketchableImage (sketch) | SketchableImage (rendered) | `bitmapDataUrl` — crossfade between two bitmaps |
| SketchableImage (style A) | SketchableImage (style B) | Re-generate with different style preset, crossfade |
| Image (original) | Image (cropped) | `displayWidth`, `displayHeight` — animate dimensions |

**Game elements** — TicTacToe, Sudoku, Minesweeper, Nonogram, etc.:

| From | To | What changes |
|------|----|-------------|
| Game (in-progress) | Game (initial) | Reset `gameState` to starting configuration |
| Game (in-progress) | Game (solved) | Fill in solution state, trigger win animation |
| Sudoku (puzzle A) | Sudoku (puzzle B) | Replace `gameState.grid` + `originalGrid` |
| Minesweeper (hidden) | Minesweeper (revealed) | Batch-reveal all cells (game over animation) |
| Jigsaw (scattered) | Jigsaw (assembled) | Animate all `pieces[].currentX/Y` to target positions |

**Text elements** — Glyph:

| From | To | What changes |
|------|----|-------------|
| Glyph (text A) | Glyph (text B) | `text` — typewriter effect or instant swap |
| Glyph (font A) | Glyph (font B) | `fontFamily`, `fontSize`, `fontWeight` |
| Glyph (color A) | Glyph (color B) | `color` — lerp through color space |

**Cross-type morphing:**

| From | To | What changes |
|------|----|-------------|
| Stroke | Shape | Beautify raw ink into recognized shape (already exists as creation) |
| Shape | Glyph | Replace geometric shape with a text label |
| Any element | Any element | Full type swap — engine replaces the element entirely |

### Interpolation strategies

Not all fields can be smoothly interpolated. The engine needs different strategies:

- **Numeric lerp**: `fontSize`, `color` (in HSL space), `opacity`, `displayWidth`, `brush.size`, scale/rotation values. `result = a + (b - a) * t`
- **Path morph**: Shape `paths` — requires matching point counts between source and target paths, then lerping each point. If point counts differ, resample the shorter path.
- **Bitmap crossfade**: SketchableImage/Image — render both bitmaps with complementary `globalAlpha` values: `alpha_old = 1 - t`, `alpha_new = t`.
- **Discrete swap**: `text`, `gameState`, `type`, anything non-numeric. Apply at `t = 0.5` (midpoint) or `t = 1.0` (end). No meaningful interpolation.
- **Positional lerp**: Jigsaw `pieces[].currentX/Y` — lerp each piece to target. This bridges state transforms and spatial transforms.

```
InterpolationStrategy = 'lerp' | 'morphPath' | 'crossfade' | 'discrete'

// Registry of how to interpolate each field
fieldStrategies: Record<string, InterpolationStrategy> = {
  'color': 'lerp',
  'fontSize': 'lerp',
  'paths': 'morphPath',
  'bitmapDataUrl': 'crossfade',
  'text': 'discrete',
  'gameState': 'discrete',
}
```

### Triggering state transitions

State changes can be triggered by:

1. **Spell menu entry** — "Reset game", "Next puzzle", "Simplify shape"
2. **Timer/schedule** — Cycle through states on a loop (slideshow, animation frames)
3. **Physics event** — On collision, boundary hit, or velocity threshold, switch state
4. **Programmatic** — Typed spell command: "morph this circle into a square"

### Engine integration

The state machine runs alongside the physics loop but on its own timeline:

```
PhysicsBody {
  ...existing fields...
  stateMachine?: StateMachine
}
```

Per frame, if a transition is active:
1. Compute `t = elapsed / transitionDurationMs`
2. For each changed field: apply the appropriate interpolation strategy
3. Emit the interpolated element in the batch update
4. At `t >= 1`: snap to target state, mark transition complete

The batch callback generalizes to include state updates:

```
ElementUpdate {
  translate?: Vector2
  rotate?: number
  scale?: number
  stateOverride?: Partial<Element>  // interpolated fields from state transition
}
```

### Rewind interaction

State transitions and rewind interact in two ways:

- **Rewind resets state**: When rewinding, the state machine reverts to its initial snapshot (index 0). This means "rewind time" truly resets everything — position AND object state.
- **State history**: The state machine tracks its history so rewind can step backwards through states, not just jump to the beginning. This enables "step back one state" in addition to full rewind.

```
StateMachine {
  ...
  history: number[]         // stack of previous state indices
}
```

### Implementation priority

| Priority | Feature | Reason |
|----------|---------|--------|
| **P1** | Discrete state swap | Simplest — instant replace, no interpolation needed. Enables game resets. |
| **P1** | Color lerp | Easy win — numeric interpolation on a field most elements have |
| **P2** | Bitmap crossfade | High visual impact for SketchableImage style transitions |
| **P2** | Positional lerp (jigsaw assembly) | Bridges state and physics transforms |
| **P3** | Path morphing | Complex (point matching), but visually striking for shapes |
| **P3** | Timer/cycled states | Enables animation sequences and slideshows |

## Engine Evolution

The `onBatchTranslate` callback will need to generalize as we add rotation/scale/style changes. Future shape:

```
onBatchUpdate: (updates: Map<string, ElementUpdate>) => void

ElementUpdate {
  translate?: Vector2
  rotate?: number           // delta radians
  scale?: number            // delta scale factor
  stateOverride?: Partial<Element>  // interpolated fields from state transition
  // Future: opacity?, color?, etc.
}
```

The `applyTransform.ts` module would grow corresponding pure functions (`rotateElement`, `scaleElement`) alongside `translateElement`, all composable.

## Rewind Evolution

Currently tracks `totalDisplacement` per body. As transforms expand:

```
PhysicsBody {
  ...
  totalDisplacement: Vector2
  totalRotation: number
  totalScaleFactor: number   // multiplicative, starts at 1
}
```

`rewind()` applies all inverses in one batch, then clears bodies.
