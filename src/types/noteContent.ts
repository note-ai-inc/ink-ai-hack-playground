// NoteContent container

import type { Element } from './elements';

/** Per-element physics properties stored alongside the note. */
export interface StoredPhysicsProperties {
  mass?: number;
  pinned?: boolean;
  collidable?: boolean;
}

export interface NoteElements {
  elements: Element[];
  /** Physics properties keyed by element ID. Only non-default values are stored. */
  physicsProperties?: Record<string, StoredPhysicsProperties>;
  version?: number;
  metadata?: NoteMetadata;
}

export interface NoteMetadata {
  createdAt?: number; // Unix timestamp in milliseconds
  modifiedAt?: number;
  title?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}

// Serialization helpers
export function serializeNoteElements(noteElements: NoteElements): string {
  return JSON.stringify(noteElements, null, 2);
}

export function deserializeNoteElements(json: string): NoteElements {
  const parsed = JSON.parse(json);

  // Validate basic structure
  if (!parsed.elements || !Array.isArray(parsed.elements)) {
    throw new Error('Invalid NoteElements: missing elements array');
  }

  // Validate each element has required fields
  for (const element of parsed.elements) {
    if (!element.type || !element.id) {
      throw new Error('Invalid element: missing type or id');
    }
  }

  return parsed as NoteElements;
}

// Create empty note
export function createEmptyNote(): NoteElements {
  return {
    elements: [],
    version: 1,
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    },
  };
}

// Update note metadata
export function touchNote(note: NoteElements): NoteElements {
  return {
    ...note,
    metadata: {
      ...note.metadata,
      modifiedAt: Date.now(),
    },
  };
}
