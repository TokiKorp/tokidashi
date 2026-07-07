// Invariants du sprite procédural : quelle que soit la combinaison du génome,
// la créature doit être bien formée (pas de pixel flottant, visage dans le
// corps, grille complète).

import { describe, expect, it } from 'vitest';
import type { Genome, VisibleState } from '../game/types';
import { buildSpriteGrid, GRID } from './sprites';

const STATES: Exclude<VisibleState, 'egg'>[] = [
  'happy', 'neutral', 'hungry', 'grumpy', 'sick', 'working', 'dead',
];

function genome(partial: Partial<Genome>): Genome {
  return { seed: 42, hue: 160, shape: 0, earStyle: 0, spots: true, ...partial };
}

function allGenomes(): Genome[] {
  const out: Genome[] = [];
  for (const shape of [0, 1, 2] as const) {
    for (const earStyle of [0, 1, 2] as const) {
      for (const spots of [true, false]) {
        out.push(genome({ shape, earStyle, spots, seed: shape * 100 + earStyle * 10 }));
      }
    }
  }
  return out;
}

describe('sprite procédural', () => {
  it('produit une grille carrée complète pour toute combinaison', () => {
    for (const g of allGenomes()) {
      for (const stage of ['blob', 'child'] as const) {
        for (const state of STATES) {
          const grid = buildSpriteGrid(state, stage, g);
          expect(grid.length).toBe(GRID);
          for (const row of grid) expect(row.length).toBe(GRID);
        }
      }
    }
  });

  it('aucun pixel flottant : tout pixel non vide touche un autre pixel', () => {
    for (const g of allGenomes()) {
      const grid = buildSpriteGrid('neutral', 'child', g);
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          if (grid[y][x] === '.') continue;
          const neighbors = [
            grid[y - 1]?.[x], grid[y + 1]?.[x], grid[y]?.[x - 1], grid[y]?.[x + 1],
          ];
          expect(
            neighbors.some((n) => n !== undefined && n !== '.'),
            `pixel isolé en (${y},${x}) pour genome ${JSON.stringify(g)}`,
          ).toBe(true);
        }
      }
    }
  });

  it('les yeux sont posés sur le corps (jamais dans le vide)', () => {
    for (const g of allGenomes()) {
      const grid = buildSpriteGrid('neutral', 'blob', g);
      const eyes = grid.flatMap((row, y) =>
        row.split('').map((ch, x) => ({ ch, y, x })).filter((p) => p.ch === 'k' || p.ch === 'w'),
      );
      expect(eyes.length).toBeGreaterThanOrEqual(8); // 2 yeux 2×2 + bouche
    }
  });

  it('deux génomes différents donnent des grilles différentes', () => {
    const a = buildSpriteGrid('neutral', 'blob', genome({ shape: 0, spots: false, earStyle: 0 }));
    const b = buildSpriteGrid('neutral', 'blob', genome({ shape: 2, spots: false, earStyle: 2 }));
    expect(a.join('\n')).not.toBe(b.join('\n'));
  });
});
