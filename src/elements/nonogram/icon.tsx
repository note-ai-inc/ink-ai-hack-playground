export function NonogramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Grid outline */}
      <rect x="4" y="4" width="16" height="16" rx="1" />
      {/* Grid lines */}
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <line x1="8" y1="4" x2="8" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="16" y1="4" x2="16" y2="20" />
      {/* Some filled cells */}
      <rect x="8" y="4" width="4" height="4" fill="currentColor" />
      <rect x="4" y="8" width="4" height="4" fill="currentColor" />
      <rect x="8" y="8" width="4" height="4" fill="currentColor" />
      <rect x="12" y="12" width="4" height="4" fill="currentColor" />
      <rect x="16" y="16" width="4" height="4" fill="currentColor" />
    </svg>
  );
}
