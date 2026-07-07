/** Formats d'affichage — temps actif, monnaies. */

export function formatActiveDuration(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}

export function formatCrumbs(n: number): string {
  return String(Math.floor(n));
}

/** 100 → « 100 », 9 500 → « 9,5k », 1 000 000 → « 1M ». `null` = illimité. */
export function formatTokens(n: number | null): string {
  if (n === null) return '∞';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1).replace('.', ',')}M`;
  }
  if (n >= 1_000) {
    const k = Math.round(n / 100) / 10;
    return `${k % 1 === 0 ? k : k.toFixed(1).replace('.', ',')}k`;
  }
  return String(Math.max(0, Math.floor(n)));
}

export function signed(n: number): string {
  const v = Math.round(n);
  return v >= 0 ? `+${v}` : `${v}`;
}
