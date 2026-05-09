import React from 'react';
import { cn } from '../lib/utils';

/**
 * Cebin Log — özgün işaret: defter çizgileri + köşe katı (kayıt / istihbarat).
 */
export default function CebinLogo({ className, size = 32, withGlow = false }) {
  const gid = React.useId().replace(/:/g, '');
  const gradId = `clg-${gid}`;
  const glowId = `clglow-${gid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(withGlow && 'drop-shadow-[0_4px_14px_rgba(99,102,241,0.45)]', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="6" y1="4" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818cf8" />
          <stop offset="0.45" stopColor="#6366f1" />
          <stop offset="1" stopColor="#c084fc" />
        </linearGradient>
        <linearGradient id={glowId} x1="24" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${gradId})`} />
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${glowId})`} />
      <path
        fill="white"
        fillOpacity={0.92}
        d="M14 15c0-.55.45-1 1-1h14c.55 0 1 .45 1 1v2.25c0 .41-.34.75-.75.75H14.75c-.41 0-.75-.34-.75-.75V15z"
      />
      <path fill="white" fillOpacity={0.85} d="M14 22h16v3H14v-3z" />
      <path fill="white" fillOpacity={0.72} d="M14 28h12v3H14v-3z" />
      <path fill="white" fillOpacity={0.58} d="M14 34h15v3H14v-3z" />
      {/* Üst sağ köşe katı — kağıt hissi */}
      <path fill="white" fillOpacity={0.34} d="M33 4h11a2 2 0 012 2v11L33 4z" />
    </svg>
  );
}
