// Built-in movement direction entries for the spell menu.

import type { SpellEntry } from './SpellEntry';
import { MOVE_FORCE as MOVE_SPEED } from '../transform/TransformOperation';

function ArrowUp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export const movementEntries: SpellEntry[] = [
  { id: 'move-up', label: 'Up', Icon: ArrowUp, category: 'movement',
    velocity: { x: 0, y: -MOVE_SPEED } },
  { id: 'move-down', label: 'Down', Icon: ArrowDown, category: 'movement',
    velocity: { x: 0, y: MOVE_SPEED } },
  { id: 'move-left', label: 'Left', Icon: ArrowLeft, category: 'movement',
    velocity: { x: -MOVE_SPEED, y: 0 } },
  { id: 'move-right', label: 'Right', Icon: ArrowRight, category: 'movement',
    velocity: { x: MOVE_SPEED, y: 0 } },
];
