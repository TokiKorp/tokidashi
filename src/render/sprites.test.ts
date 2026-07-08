// Invariants du sprite procédural : quelle que soit la combinaison du génome,
// la créature doit être bien formée (pas de pixel flottant, visage dans le
// corps, grille complète).

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../game/config';
import type { Genome, VisibleState } from '../game/types';
import { ENEMY_SPRITES } from './enemies';
import { buildSpriteGrid, COSMETIC_PATCHES, GRID, grandpaPalette, palette } from './sprites';

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
      for (const stage of ['blob', 'kid', 'teen', 'adult', 'grandpa'] as const) {
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
      const grid = buildSpriteGrid('neutral', 'kid', g);
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

  it("les sprites d'ennemis sont des grilles 12×12 bien formées", () => {
    for (const [id, def] of Object.entries(ENEMY_SPRITES)) {
      expect(def.frames.length, id).toBe(2);
      for (const frame of def.frames) {
        expect(frame.length, id).toBe(12);
        for (const row of frame) expect(row.length, `${id} ligne`).toBe(12);
      }
    }
  });

  it('deux génomes différents donnent des grilles différentes', () => {
    const a = buildSpriteGrid('neutral', 'blob', genome({ shape: 0, spots: false, earStyle: 0 }));
    const b = buildSpriteGrid('neutral', 'blob', genome({ shape: 2, spots: false, earStyle: 2 }));
    expect(a.join('\n')).not.toBe(b.join('\n'));
  });
});

describe('cosmétiques', () => {
  it('COSMETIC_PATCHES couvre exactement les cosmétiques de la config', () => {
    const configIds = DEFAULT_CONFIG.cosmetics.map((c) => c.id).sort();
    const patchIds = Object.keys(COSMETIC_PATCHES).sort();
    expect(patchIds).toEqual(configIds);
  });

  it('chaque cosmétique produit une grille 20×20 bien formée sur plusieurs génomes/stades', () => {
    const genomes = [
      genome({ shape: 0, hue: 10, earStyle: 0, spots: false }),
      genome({ shape: 1, hue: 160, earStyle: 1, spots: true, seed: 99 }),
      genome({ shape: 2, hue: 260, earStyle: 2, spots: false, seed: 7 }),
    ];
    const stages = ['blob', 'kid', 'teen', 'adult', 'grandpa'] as const;
    for (const g of genomes) {
      for (const stage of stages) {
        for (const id of Object.keys(COSMETIC_PATCHES)) {
          const grid = buildSpriteGrid('neutral', stage, g, 0, [id]);
          expect(grid.length, `${id}/${stage}`).toBe(GRID);
          for (const row of grid) expect(row.length, `${id}/${stage}`).toBe(GRID);
        }
      }
    }
  });

  it('tout caractère émis par un patch cosmétique existe dans la palette (normale et papy)', () => {
    const anchors = { eyeY: 8, elx: 5, erx: 12, mouthY: 11, topRow: 3 };
    const g = genome({});
    const validNormal = new Set(Object.keys(palette(g)));
    const validGrandpa = new Set(Object.keys(grandpaPalette(g)));
    for (const [id, fn] of Object.entries(COSMETIC_PATCHES)) {
      for (const [, , char] of fn(anchors)) {
        expect(validNormal.has(char), `${id} → '${char}' absent de palette()`).toBe(true);
        expect(validGrandpa.has(char), `${id} → '${char}' absent de grandpaPalette()`).toBe(true);
      }
    }
  });
});
