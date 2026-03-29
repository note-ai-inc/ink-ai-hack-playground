// Spell menu overlay component
//
// Displays entry buttons (no games) plus a text input when an element
// is double-clicked, allowing quick replacement or a typed spell.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpellIntent, SpellAction } from './SpellIntent';
import type { Offset } from '../types';
import { computeSpellGridLayout } from './spellGridLayout';

export interface SpellMenuPhysicsState {
  mass: number;
  pinned: boolean;
  collidable: boolean;
}

export interface SpellMenuProps {
  intent: SpellIntent | null;
  onAction: (action: SpellAction, value?: string) => void;
  canvasToScreen: (point: Offset) => Offset;
  /** Current physics properties for the target element. */
  physicsState?: SpellMenuPhysicsState;
  onSetMass?: (mass: number) => void;
  onTogglePinned?: () => void;
  onToggleCollidable?: () => void;
}

const MENU_OFFSET_Y = -60;

export function SpellMenu({
  intent,
  onAction,
  canvasToScreen,
  physicsState,
  onSetMass,
  onTogglePinned,
  onToggleCollidable,
}: SpellMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [massInput, setMassInput] = useState('');

  // Reset text and sync mass when intent changes
  useEffect(() => {
    if (intent) {
      setText('');
      setMassInput(physicsState?.pinned ? '∞' : String(physicsState?.mass ?? 1));
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!intent) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onAction('dismiss');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onAction('dismiss');
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [intent, onAction]);

  const handleSelectEntry = useCallback((e: React.MouseEvent, entryId: string) => {
    e.stopPropagation();
    onAction('select', entryId);
  }, [onAction]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed) {
      onAction('cast', trimmed);
    }
  }, [text, onAction]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAction('dismiss');
  }, [onAction]);

  const entries = intent?.entries;
  const layout = useMemo(
    () => entries ? computeSpellGridLayout(entries) : null,
    [entries],
  );

  if (!intent || !layout || intent.entries.length === 0) {
    return null;
  }

  const anchorScreen = canvasToScreen(intent.anchorPoint);
  const menuX = anchorScreen.x;
  const menuY = anchorScreen.y + MENU_OFFSET_Y;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        left: menuX,
        top: menuY,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)',
          border: '1px solid #e0e0e0',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '6px 12px',
            fontSize: '11px',
            color: '#666',
            borderBottom: '1px solid #e0e0e0',
            width: '100%',
            textAlign: 'center',
            backgroundColor: '#f8f8f8',
            position: 'relative',
          }}
        >
          Cast spell...
          <button
            onClick={handleDismiss}
            style={{
              position: 'absolute',
              right: '4px',
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#999',
              fontSize: '14px',
              lineHeight: 1,
              padding: '2px 4px',
              borderRadius: '3px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#333'; e.currentTarget.style.backgroundColor = '#e8e8e8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            title="Dismiss"
          >
            &times;
          </button>
        </div>

        {/* Body: entry buttons on left, text input on right */}
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {/* Left column: button grid + physics properties */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Entry buttons grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: layout.gridTemplateColumns,
              gridTemplateRows: 'auto auto',
            }}>
              {/* Row 1: category labels spanning their groups */}
              {layout.groupSpans.map((span, gi) => (
                <div
                  key={span.category}
                  style={{
                    gridRow: 1,
                    gridColumn: `${span.start} / ${span.end}`,
                    fontSize: '9px',
                    color: '#999',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    textAlign: 'center',
                    padding: '3px 4px',
                    lineHeight: 1,
                    borderBottom: '1px solid #e0e0e0',
                    ...(gi > 0 ? { borderLeft: '1px solid #d0d0d0' } : {}),
                  }}
                >
                  {span.label}
                </div>
              ))}

              {/* Row 2: entry buttons */}
              {intent.entries.map((entry, index) => (
                <button
                  key={entry.id}
                  onClick={(e) => handleSelectEntry(e, entry.id)}
                  style={{
                    gridRow: 2,
                    gridColumn: layout.entryColumns[index],
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: '#333',
                    gap: '4px',
                    transition: 'background-color 0.15s',
                    minWidth: '56px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f0f7ff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title={entry.label}
                >
                  <entry.Icon />
                  <span style={{ fontSize: '10px' }}>{entry.label}</span>
                </button>
              ))}

              {/* Separator columns (row 2) */}
              {layout.separators.map((sep) => (
                <div
                  key={`sep-${sep.column}`}
                  style={{
                    gridRow: 2,
                    gridColumn: sep.column,
                    backgroundColor: sep.type === 'group-sep' ? '#d0d0d0' : '#e0e0e0',
                  }}
                />
              ))}
            </div>

            {/* Physics properties row */}
            {physicsState && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderTop: '1px solid #e0e0e0',
                  fontSize: '11px',
                  color: '#666',
                }}
              >
                <span style={{ whiteSpace: 'nowrap' }}>Mass:</span>
                <input
                  type="text"
                  value={massInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMassInput(val);
                    const num = parseFloat(val);
                    if (!isNaN(num) && num > 0 && onSetMass) {
                      onSetMass(num);
                    }
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{
                    width: '48px',
                    padding: '2px 6px',
                    fontSize: '11px',
                    border: '1px solid #d0d0d0',
                    borderRadius: '3px',
                    textAlign: 'center',
                    outline: 'none',
                    backgroundColor: physicsState.pinned ? '#f0f0f0' : 'white',
                    color: physicsState.pinned ? '#999' : '#333',
                  }}
                  disabled={physicsState.pinned}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onTogglePinned) {
                      onTogglePinned();
                      if (!physicsState.pinned) {
                        setMassInput('\u221E');
                      } else {
                        setMassInput(String(physicsState.mass));
                      }
                    }
                  }}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    border: '1px solid',
                    borderColor: physicsState.pinned ? '#007aff' : '#d0d0d0',
                    borderRadius: '3px',
                    background: physicsState.pinned ? '#007aff' : 'none',
                    color: physicsState.pinned ? 'white' : '#666',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                  title={physicsState.pinned ? 'Set mass back to finite' : 'Set mass to infinite (immune to forces)'}
                >
                  {physicsState.pinned ? '\u221E mass' : '\u221E'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onToggleCollidable) onToggleCollidable();
                  }}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    border: '1px solid',
                    borderColor: physicsState.collidable ? '#007aff' : '#d0d0d0',
                    borderRadius: '3px',
                    background: physicsState.collidable ? '#007aff' : 'none',
                    color: physicsState.collidable ? 'white' : '#666',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                  title={physicsState.collidable ? 'Disable collision' : 'Enable collision with other elements'}
                >
                  {physicsState.collidable ? 'Collidable' : 'Collide'}
                </button>
              </div>
            )}
          </div>

          {/* Divider between buttons and text input */}
          <div style={{ width: '1px', backgroundColor: '#d0d0d0' }} />

          {/* Text input section */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              padding: '8px',
              gap: '6px',
              justifyContent: 'center',
            }}
          >
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                // Auto-resize height up to max
                e.target.style.height = 'auto';
                const maxHeight = parseFloat(getComputedStyle(e.target).lineHeight) * 10 + 12; // 10 lines + padding
                e.target.style.height = Math.min(e.target.scrollHeight, maxHeight) + 'px';
                e.target.style.overflowY = e.target.scrollHeight > maxHeight ? 'auto' : 'hidden';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) {
                    onAction('cast', text.trim());
                  }
                }
              }}
              placeholder="Describe the transformation..."
              rows={2}
              style={{
                minWidth: '400px',
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px solid #d0d0d0',
                borderRadius: '4px',
                outline: 'none',
                resize: 'none',
                overflowY: 'hidden',
                fontFamily: 'inherit',
                lineHeight: '1.4',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#0066ff';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d0d0d0';
              }}
            />
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={!text.trim()}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: text.trim() ? '#0066ff' : '#ccc',
                  color: 'white',
                  cursor: text.trim() ? 'pointer' : 'default',
                  transition: 'background-color 0.15s',
                }}
              >
                Cast
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Tooltip arrow */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '-8px',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid white',
          filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.1))',
        }}
      />
    </div>
  );
}

export default SpellMenu;
