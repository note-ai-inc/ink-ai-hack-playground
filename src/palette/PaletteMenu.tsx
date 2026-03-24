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

        {/* Grid: category labels + buttons sharing column tracks */}
        {(() => {
          const CATEGORY_LABELS: Record<string, string> = { image: 'Image', content: 'AI', game: 'Games' };
          // Build groups with start/end column indices
          // Grid columns: for each entry, a button col + a 1px separator col (except last in group)
          // Between groups: a 1px separator col
          // Final: a 1px separator + dismiss button
          const groups: { category: string; count: number; startCol: number; endCol: number }[] = [];
          let col = 1;
          for (const entry of intent.entries) {
            const last = groups[groups.length - 1];
            if (last && last.category === entry.category) {
              col++; // 1px separator between same-group buttons
              last.count++;
              col++; // the button
              last.endCol = col;
            } else {
              if (last) {
                col++; // 1px group separator
              }
              const startCol = col;
              col++; // the button
              groups.push({ category: entry.category, count: 1, startCol, endCol: col });
            }
          }
          const dismissSepCol = col + 1;
          const dismissCol = col + 2;
          const totalCols = dismissCol;

          // Build column template: auto for buttons, 1px for separators
          // We need to track which columns are separators vs buttons
          const colTypes: ('button' | 'sep' | 'group-sep')[] = [];
          let isFirst = true;
          for (const group of groups) {
            if (!isFirst) colTypes.push('group-sep');
            for (let i = 0; i < group.count; i++) {
              if (i > 0) colTypes.push('sep');
              colTypes.push('button');
            }
            isFirst = false;
          }
          colTypes.push('group-sep'); // before dismiss
          colTypes.push('button'); // dismiss

          const gridTemplateColumns = colTypes.map(t => t === 'button' ? 'auto' : '1px').join(' ');

          // Compute grid column positions for each group label
          let colIdx = 0;
          const groupSpans: { category: string; start: number; end: number }[] = [];
          isFirst = true;
          for (const group of groups) {
            if (!isFirst) colIdx++; // group separator
            const start = colIdx + 1; // CSS grid is 1-based
            for (let i = 0; i < group.count; i++) {
              if (i > 0) colIdx++; // inner separator
              colIdx++; // button
            }
            const end = colIdx + 1;
            groupSpans.push({ category: group.category, start, end });
            isFirst = false;
          }

          // Build entries with their grid column (1-based)
          let entryCol = 0;
          let firstGroup = true;
          let prevCat = '';
          const entryPositions: { colStart: number }[] = [];
          for (const entry of intent.entries) {
            if (entry.category !== prevCat) {
              if (!firstGroup) entryCol++; // group separator
              firstGroup = false;
              prevCat = entry.category;
            } else {
              entryCol++; // inner separator
            }
            entryCol++; // button
            entryPositions.push({ colStart: entryCol });
          }
          const dismissSepColIdx = entryCol + 1;
          const dismissColIdx = entryCol + 2;

          return (
            <div style={{
              display: 'grid',
              gridTemplateColumns,
              gridTemplateRows: 'auto auto',
            }}>
              {/* Row 1: category labels spanning their groups */}
              {groupSpans.map((span, gi) => (
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
                  {CATEGORY_LABELS[span.category] ?? span.category}
                </div>
              ))}

              {/* Row 2: buttons */}
              {intent.entries.map((entry, index) => (
                <button
                  key={entry.id}
                  onClick={(e) => handleSelectEntry(e, entry.id)}
                  style={{
                    gridRow: 2,
                    gridColumn: entryPositions[index].colStart,
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
              {colTypes.map((type, ci) => {
                if (type === 'button') return null;
                return (
                  <div
                    key={`sep-${ci}`}
                    style={{
                      gridRow: 2,
                      gridColumn: ci + 1,
                      backgroundColor: type === 'group-sep' ? '#d0d0d0' : '#e0e0e0',
                    }}
                  />
                );
              })}

              {/* Dismiss button */}
              <button
                onClick={handleDismiss}
                style={{
                  gridRow: '1 / 3',
                  gridColumn: dismissColIdx,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 12px',
                  border: 'none',
                  borderLeft: '1px solid #d0d0d0',
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
          );
        })()}
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
