import React from 'react';
import { cn } from '../lib/utils';

/** Büyük harfli marka adı — üst sarmalayıcı sürekli hue döndürür (canlı renk). */
export default function CebinBrandTitle({ variant = 'sidebar', className }) {
  return (
    <span className={cn('inline-block animate-brand-spectrum', className)}>
      <span
        className={cn(
          'font-black uppercase bg-gradient-to-r from-indigo-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent',
          variant === 'sidebar' && 'text-[17px] tracking-[0.14em]',
          variant === 'login' && 'text-4xl sm:text-5xl tracking-[0.2em]'
        )}
      >
        CEBIN LOG
      </span>
    </span>
  );
}
