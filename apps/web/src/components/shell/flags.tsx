import { useId } from 'react';

/**
 * Original small flag drawings from the public national-flag geometry (no emoji, no
 * third-party artwork). Decorative: the adjacent text names the language.
 */
export function CzechFlag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" width="24" height="16" aria-hidden="true" focusable="false">
      <rect width="30" height="20" fill="#d7141a" />
      <rect width="30" height="10" fill="#ffffff" />
      <path d="M0 0 L15 10 L0 20 Z" fill="#11457e" />
    </svg>
  );
}

export function UnitedKingdomFlag({ className }: { className?: string }) {
  const clip = useId();
  const diagonals = `${clip}-diagonals`;
  return (
    <svg className={className} viewBox="0 0 60 30" width="24" height="12" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <rect width="60" height="30" />
        </clipPath>
        <clipPath id={diagonals}>
          <path d="M30 15 H60 V30 Z V30 H0 Z H0 V0 Z V0 H60 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="60" height="30" fill="#012169" />
        <path d="M0 0 L60 30 M60 0 L0 30" stroke="#ffffff" strokeWidth="6" />
        <path d="M0 0 L60 30 M60 0 L0 30" clipPath={`url(#${diagonals})`} stroke="#c8102e" strokeWidth="4" />
        <path d="M30 0 V30 M0 15 H60" stroke="#ffffff" strokeWidth="10" />
        <path d="M30 0 V30 M0 15 H60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  );
}
