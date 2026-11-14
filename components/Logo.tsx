export default function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <span className="logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.1" fill="none" opacity="0.55">
          <path d="M16 4 11 15l5 5 5-5Z" />
          <path d="M11 15 5 19M21 15l6 4M16 20v7" />
        </g>
        <g fill="currentColor">
          <circle cx="16" cy="4" r="2.2" />
          <circle cx="11" cy="15" r="1.4" />
          <circle cx="21" cy="15" r="1.4" />
          <circle cx="5" cy="19" r="1.1" />
          <circle cx="27" cy="19" r="1.1" />
          <circle cx="16" cy="27" r="1.4" />
        </g>
      </svg>
      {wordmark ? <span className="logo-word">Cygnus</span> : null}
    </span>
  );
}
