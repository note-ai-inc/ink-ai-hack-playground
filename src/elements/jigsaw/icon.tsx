export function JigsawIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Puzzle piece shape */}
      <path d="M4 4h6v2a2 2 0 104 0V4h6v6h-2a2 2 0 100 4h2v6H4V4z" />
      {/* Inner divider hint */}
      <line x1="10" y1="14" x2="10" y2="20" strokeDasharray="2 2" />
      <line x1="14" y1="14" x2="14" y2="20" strokeDasharray="2 2" />
    </svg>
  );
}
