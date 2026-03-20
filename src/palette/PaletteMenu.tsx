// Palette menu overlay component
//
// Displays palette options when a rectangle+X gesture is detected.
// Follows the same pattern as DisambiguationMenu.

import React, { useCallback, useEffect, useRef } from 'react';
import type { PaletteIntent, PaletteAction } from './PaletteIntent';
import type { Offset } from '../types';

export interface PaletteMenuProps {
  intent: PaletteIntent | null;
  onAction: (action: PaletteAction, entryId?: string) => void;
  canvasToScreen: (point: Offset) => Offset;
}

const MENU_OFFSET_Y = -60;

export function PaletteMenu({
  intent,
  onAction,
  canvasToScreen,
}: PaletteMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAction('dismiss');
  }, [onAction]);

  if (!intent || intent.entries.length === 0) {
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
          }}
        >
          Create element...
        </div>

        {/* Entry buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
          }}
        >
          {intent.entries.map((entry, index) => (
            <React.Fragment key={entry.id}>
              {index > 0 && (
                <div style={{ width: '1px', backgroundColor: '#e0e0e0' }} />
              )}
              <button
                onClick={(e) => handleSelectEntry(e, entry.id)}
                style={{
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
            </React.Fragment>
          ))}
          {/* Dismiss button */}
          <div style={{ width: '1px', backgroundColor: '#e0e0e0' }} />
          <button
            onClick={handleDismiss}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 12px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#999',
              gap: '4px',
              transition: 'background-color 0.15s',
              minWidth: '48px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Cancel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span style={{ fontSize: '10px' }}>Cancel</span>
          </button>
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

export default PaletteMenu;
