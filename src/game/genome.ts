// Génération procédurale du génome (apparence unique par Compagnon) et
// courbe de croissance liée aux TOKEN mangés.

import type { Genome } from './types';

export function generateGenome(rng: () => number = Math.random): Genome {
  return {
    seed: Math.floor(rng() * 2 ** 31),
    hue: Math.floor(rng() * 360),
    shape: Math.floor(rng() * 3) as Genome['shape'],
    earStyle: Math.floor(rng() * 3) as Genome['earStyle'],
    spots: rng() < 0.6,
  };
}

/** PRNG déterministe (mulberry32) — pour dessiner les taches depuis le seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Palier de référence de l'appétit : 1 000 000 de TOKEN (growth = 1). */
export const TOKENS_EATEN_REF = 1_000_000;

/**
 * Croissance selon les TOKEN mangés, SANS plafond : échelle log calée sur les
 * paliers 100 / 10 000 / 1 000 000 (~0,33 / ~0,67 / 1), puis ça continue —
 * il peut s'engraisser à l'infini (1,33 à 100M, 1,67 à 10G…). Le rendu, lui,
 * sature en douceur pour rester dans la fenêtre.
 */
export function growthFactor(tokensEaten: number): number {
  if (tokensEaten <= 0) return 0;
  return Math.log10(1 + tokensEaten) / Math.log10(1 + TOKENS_EATEN_REF);
}
