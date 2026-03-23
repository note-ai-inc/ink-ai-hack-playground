// Queens palette icon — crown with grid dots
export function QueensIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      {/* Crown shape */}
      <polyline points="2,17 5,7 9.5,13 12,5 14.5,13 19,7 22,17" />
      {/* Crown base bar */}
      <line x1="2" y1="17" x2="22" y2="17" />
      {/* Three jewel dots on crown peaks */}
      <circle cx="5"  cy="7"  r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5"  r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="7"  r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
