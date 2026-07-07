// Sprites 100 % procéduraux : le corps est généré depuis le Génome (forme en
// superellipse, teinte HSL, taches seedées, oreilles), les visages par état
// (GDD §4.2) sont posés paramétriquement sur la géométrie calculée.
//
// Objectif de design fort inchangé : l'état doit se lire à l'œil nu — les
// états Malade/Mort écrasent la palette du génome pour rester lisibles.

import { mulberry32 } from '../game/genome';
import type { Genome, StageCode, VisibleState } from '../game/types';
import { applyPatches, gridToCanvas, type Grid, type Patch } from './pixel';

export const GRID = 20;

interface BodyShape {
  a: number; // demi-largeur
  b: number; // demi-hauteur
  n: number; // exposant superellipse (rondeur)
}

const SHAPES: Record<Genome['shape'], BodyShape> = {
  0: { a: 6.5, b: 6.0, n: 2.3 }, // rond
  1: { a: 7.5, b: 5.2, n: 2.6 }, // large
  2: { a: 5.8, b: 7.0, n: 2.2 }, // haut
};

const CX = (GRID - 1) / 2; // 9.5

interface FaceAnchors {
  eyeY: number;
  elx: number; // col gauche de l'œil gauche (2 px de large)
  erx: number; // col gauche de l'œil droit
  mouthY: number;
  topRow: number;
}

function palette(g: Genome): Record<string, string> {
  return {
    '.': 'transparent',
    o: `hsl(${g.hue} 30% 28%)`,
    b: `hsl(${g.hue} 55% 75%)`,
    B: `hsl(${g.hue} 60% 88%)`,
    p: `hsl(${(g.hue + 45) % 360} 50% 62%)`,
    k: '#2c2c38',
    w: '#ffffff',
    r: '#ff9aa2',
    d: '#8ecae6',
    g: '#a4c98a',
    e: '#fff3da',
    s: `hsl(${g.hue} 55% 70%)`,
    // Cosmétiques
    A: '#3a3a46',
    Y: '#f4c542',
    C: '#66c7d6',
    M: '#b06fd8',
    R: '#e05263',
  };
}

/** Papy : pelage grisonnant, mais toujours sa teinte (GDD §4.3). */
function grandpaPalette(g: Genome): Record<string, string> {
  return {
    ...palette(g),
    b: `hsl(${g.hue} 18% 80%)`,
    B: `hsl(${g.hue} 15% 90%)`,
    p: `hsl(${(g.hue + 45) % 360} 18% 70%)`,
  };
}

// Malade/Mort : les surcharges de palette (verdâtre / grisé) sont appliquées
// dans buildSprite — prioritaires sur le génome pour rester lisibles.

/**
 * Corps procédural + ancres du visage. `fat` (0→∞, 1 = 1M TOKEN mangés)
 * élargit la superellipse : il s'engraisse sans limite numérique, le dessin
 * saturant en douceur aux bords de la grille.
 */
function buildBody(
  g: Genome,
  stage: StageCode,
  fat = 0,
): { grid: Grid; face: FaceAnchors } {
  const base = SHAPES[g.shape];
  const a = Math.min(8.6, base.a * (1 + 0.14 * fat));
  const b = Math.min(8.0, base.b * (1 + 0.07 * fat));
  const n = Math.min(4.2, base.n + 0.35 * fat);
  const bottom = GRID - 2;
  const cy = bottom - b;
  const rows: string[][] = Array.from({ length: GRID }, () => Array(GRID).fill('.'));

  for (let y = 0; y < GRID; y++) {
    const dy = Math.abs(y - cy) / b;
    if (dy > 1) continue;
    const halfW = a * Math.pow(1 - Math.pow(dy, n), 1 / n);
    for (let x = 0; x < GRID; x++) {
      const dx = Math.abs(x - CX);
      if (dx > halfW) continue;
      const edge = dx > halfW - 1.2 || halfW < 1.4;
      rows[y][x] = edge ? 'o' : 'b';
    }
  }

  // Ventre clair.
  for (let y = Math.ceil(cy + 1); y <= bottom - 1; y++) {
    const dy = Math.abs(y - cy) / b;
    if (dy > 1) continue;
    const halfW = a * Math.pow(1 - Math.pow(dy, n), 1 / n);
    for (let x = 0; x < GRID; x++) {
      if (rows[y][x] === 'b' && Math.abs(x - CX) < halfW * 0.5) rows[y][x] = 'B';
    }
  }

  const topRow = Math.ceil(cy - b);
  const face: FaceAnchors = {
    eyeY: Math.round(cy - b * 0.3),
    elx: Math.round(CX - a * 0.5),
    erx: Math.round(CX + a * 0.5) - 1,
    mouthY: Math.min(bottom - 2, Math.round(cy - b * 0.3) + 3),
    topRow,
  };

  // Taches seedées (hors zone du visage).
  if (g.spots) {
    const rng = mulberry32(g.seed);
    for (let i = 0; i < 6; i++) {
      const x = 2 + Math.floor(rng() * (GRID - 4));
      const y = topRow + 1 + Math.floor(rng() * (bottom - topRow - 2));
      const inFace =
        y >= face.eyeY - 1 && y <= face.mouthY + 1 && x >= face.elx - 1 && x <= face.erx + 2;
      if (!inFace && rows[y][x] === 'b') rows[y][x] = 'p';
    }
  }

  // Oreilles — ancrées sur la première rangée pleine du corps pour ne jamais
  // flotter. À partir du stade Kid il en a toujours (l'évolution se voit).
  const grown = stage !== 'egg' && stage !== 'blob';
  const ear = grown && g.earStyle === 0 ? 1 : g.earStyle;
  const earRow = topRow + 1;
  if (ear === 1) {
    for (const side of [-1, 1]) {
      const ex = Math.round(CX + side * a * 0.55);
      if (rows[earRow]?.[ex] && rows[earRow][ex] !== '.') {
        rows[earRow - 1][ex] = 'o';
        rows[earRow - 2][ex] = 'o';
        const inner = ex + (side < 0 ? 1 : -1);
        if (rows[earRow - 1][inner] === '.') rows[earRow - 1][inner] = 'o';
      }
    }
  } else if (ear === 2) {
    const ax = Math.round(CX);
    rows[earRow - 1][ax] = 'o';
    rows[earRow - 2][ax] = 'o';
    rows[earRow - 3][ax - 1] = 'p';
    rows[earRow - 3][ax] = 'p';
  }

  // Marqueurs de stade (GDD §4.3 : l'apparence change nettement) :
  // Ado = houppette rebelle · Adulte = cravate · Papy = moustache blanche.
  if (stage === 'teen') {
    const ax = Math.round(CX);
    for (const dx of [-2, 0, 2]) {
      // Chaque épi s'ancre sur une case pleine juste en dessous (earRow est
      // la première rangée garantie pleine du corps).
      if (rows[earRow]?.[ax + dx] && rows[earRow][ax + dx] !== '.') {
        rows[earRow - 1][ax + dx] = 'p';
      }
    }
    if (rows[earRow - 1][ax] === 'p') rows[earRow - 2][ax] = 'p';
  } else if (stage === 'adult') {
    for (const dy of [2, 3]) {
      const y = face.mouthY + dy;
      if (rows[y]?.[Math.round(CX)] && rows[y][Math.round(CX)] !== '.') {
        rows[y][Math.round(CX)] = 'o';
      }
    }
  } else if (stage === 'grandpa') {
    for (let dx = -2; dx <= 2; dx++) {
      const x = Math.round(CX) + dx;
      if (rows[face.mouthY]?.[x] && rows[face.mouthY][x] !== '.') {
        rows[face.mouthY][x] = 'w';
      }
    }
    face.mouthY = Math.min(GRID - 3, face.mouthY + 1); // la bouche sous la moustache
  }

  return { grid: rows.map((r) => r.join('')), face };
}

// ——— Visages paramétriques ———

function eyesOpen(f: FaceAnchors): Patch[] {
  return [
    [f.eyeY, f.elx, 'k'], [f.eyeY, f.elx + 1, 'w'], [f.eyeY + 1, f.elx, 'k'], [f.eyeY + 1, f.elx + 1, 'k'],
    [f.eyeY, f.erx, 'k'], [f.eyeY, f.erx + 1, 'w'], [f.eyeY + 1, f.erx, 'k'], [f.eyeY + 1, f.erx + 1, 'k'],
  ];
}

function eyesClosed(f: FaceAnchors): Patch[] {
  return [
    [f.eyeY + 1, f.elx, 'k'], [f.eyeY + 1, f.elx + 1, 'k'],
    [f.eyeY + 1, f.erx, 'k'], [f.eyeY + 1, f.erx + 1, 'k'],
  ];
}

function eyesCross(f: FaceAnchors): Patch[] {
  const out: Patch[] = [];
  for (const ex of [f.elx, f.erx]) {
    out.push(
      [f.eyeY - 1, ex - 1, 'k'], [f.eyeY, ex, 'k'], [f.eyeY + 1, ex + 1, 'k'],
      [f.eyeY + 1, ex - 1, 'k'], [f.eyeY - 1, ex + 1, 'k'],
    );
  }
  return out;
}

function cheeks(f: FaceAnchors, char = 'r'): Patch[] {
  return [
    [f.eyeY + 2, f.elx - 2, char],
    [f.eyeY + 2, f.erx + 3, char],
  ];
}

function mouthSmile(f: FaceAnchors): Patch[] {
  const m = Math.round(CX);
  return [[f.mouthY, m - 2, 'k'], [f.mouthY + 1, m - 1, 'k'], [f.mouthY + 1, m, 'k'], [f.mouthY, m + 1, 'k']];
}

function mouthFlat(f: FaceAnchors): Patch[] {
  const m = Math.round(CX);
  return [[f.mouthY, m - 1, 'k'], [f.mouthY, m, 'k']];
}

function mouthFrown(f: FaceAnchors): Patch[] {
  const m = Math.round(CX);
  return [[f.mouthY + 1, m - 2, 'k'], [f.mouthY, m - 1, 'k'], [f.mouthY, m, 'k'], [f.mouthY + 1, m + 1, 'k']];
}

function mouthOpen(f: FaceAnchors): Patch[] {
  const m = Math.round(CX);
  return [[f.mouthY, m - 1, 'k'], [f.mouthY, m, 'k'], [f.mouthY + 1, m - 1, 'k'], [f.mouthY + 1, m, 'k']];
}

function facePatches(state: Exclude<VisibleState, 'egg'>, f: FaceAnchors): Patch[] {
  switch (state) {
    case 'happy':
      return [...eyesOpen(f), ...cheeks(f), ...mouthSmile(f)];
    case 'neutral':
      return [...eyesOpen(f), ...cheeks(f), ...mouthFlat(f)];
    case 'hungry':
      return [...eyesClosed(f), ...mouthOpen(f), [f.eyeY - 1, f.erx + 3, 'd'], [f.eyeY, f.erx + 3, 'd']];
    case 'grumpy':
      return [
        [f.eyeY - 1, f.elx, 'k'], [f.eyeY, f.elx + 1, 'k'],
        [f.eyeY - 1, f.erx + 1, 'k'], [f.eyeY, f.erx, 'k'],
        ...eyesClosed(f),
        ...mouthFrown(f),
      ];
    case 'sick':
      return [...eyesCross(f), ...cheeks(f, 'g'), ...mouthFrown(f)];
    case 'working': {
      const glasses: Patch[] = [];
      for (const ex of [f.elx, f.erx]) {
        glasses.push(
          [f.eyeY - 1, ex - 1, 'k'], [f.eyeY - 1, ex, 'k'], [f.eyeY - 1, ex + 1, 'k'], [f.eyeY - 1, ex + 2, 'k'],
          [f.eyeY, ex - 1, 'k'], [f.eyeY + 1, ex - 1, 'k'],
        );
      }
      glasses.push([f.eyeY, Math.round(CX) - 1, 'k'], [f.eyeY, Math.round(CX), 'k']);
      return [...eyesOpen(f), ...glasses, ...mouthFlat(f)];
    }
    case 'dead':
      return [...eyesCross(f), ...mouthFlat(f)];
  }
}

// ——— Cosmétiques (GDD §6.3) : patches paramétriques par article ———

const COSMETIC_PATCHES: Record<string, (f: FaceAnchors) => Patch[]> = {
  beret: (f) => {
    const out: Patch[] = [];
    for (let x = Math.round(CX) - 3; x <= Math.round(CX) + 2; x++) out.push([f.topRow - 1, x, 'R']);
    out.push([f.topRow - 2, Math.round(CX), 'R']);
    return out;
  },
  'party-hat': (f) => [
    [f.topRow - 1, Math.round(CX) - 1, 'M'], [f.topRow - 1, Math.round(CX), 'M'],
    [f.topRow - 1, Math.round(CX) + 1, 'M'], [f.topRow - 2, Math.round(CX), 'M'],
    [f.topRow - 3, Math.round(CX), 'Y'],
  ],
  'top-hat': (f) => {
    const out: Patch[] = [];
    for (let x = Math.round(CX) - 4; x <= Math.round(CX) + 4; x++) out.push([f.topRow - 1, x, 'A']);
    for (let y = f.topRow - 3; y <= f.topRow - 2; y++) {
      for (let x = Math.round(CX) - 2; x <= Math.round(CX) + 2; x++) out.push([y, x, 'A']);
    }
    return out;
  },
  bandana: (f) => {
    const out: Patch[] = [];
    for (let x = Math.round(CX) - 3; x <= Math.round(CX) + 3; x++) out.push([f.topRow, x, 'C']);
    out.push([f.topRow + 1, Math.round(CX) + 4, 'C']);
    return out;
  },
  crown: (f) => {
    const out: Patch[] = [];
    for (let x = Math.round(CX) - 3; x <= Math.round(CX) + 3; x++) out.push([f.topRow - 1, x, 'Y']);
    for (const dx of [-3, 0, 3]) out.push([f.topRow - 2, Math.round(CX) + dx, 'Y']);
    return out;
  },
  halo: (f) => {
    const out: Patch[] = [];
    for (let x = Math.round(CX) - 2; x <= Math.round(CX) + 2; x++) out.push([f.topRow - 4, x, 'Y']);
    return out;
  },
  sunglasses: (f) => {
    const out: Patch[] = [];
    for (const ex of [f.elx, f.erx]) {
      for (let x = ex - 1; x <= ex + 2; x++) out.push([f.eyeY, x, 'A']);
      out.push([f.eyeY + 1, ex, 'A'], [f.eyeY + 1, ex + 1, 'A']);
    }
    out.push([f.eyeY, Math.round(CX) - 1, 'A'], [f.eyeY, Math.round(CX), 'A']);
    return out;
  },
  monocle: (f) => [
    [f.eyeY - 1, f.erx - 1, 'Y'], [f.eyeY - 1, f.erx + 2, 'Y'],
    [f.eyeY + 2, f.erx - 1, 'Y'], [f.eyeY + 2, f.erx + 2, 'Y'],
    [f.eyeY + 3, f.erx + 3, 'Y'],
  ],
  flower: (f) => [
    [f.topRow, f.elx - 2, 'M'], [f.topRow - 1, f.elx - 3, 'M'],
    [f.topRow - 1, f.elx - 1, 'M'], [f.topRow - 2, f.elx - 2, 'M'],
    [f.topRow - 1, f.elx - 2, 'Y'],
  ],
  bow: (f) => [
    [f.mouthY + 2, Math.round(CX) - 2, 'R'], [f.mouthY + 3, Math.round(CX) - 2, 'R'],
    [f.mouthY + 2, Math.round(CX) + 2, 'R'], [f.mouthY + 3, Math.round(CX) + 2, 'R'],
    [f.mouthY + 2, Math.round(CX), 'A'],
  ],
  scarf: (f) => {
    const out: Patch[] = [];
    for (let x = Math.round(CX) - 4; x <= Math.round(CX) + 4; x++) out.push([f.mouthY + 2, x, 'R']);
    out.push([f.mouthY + 3, Math.round(CX) + 3, 'R'], [f.mouthY + 4, Math.round(CX) + 3, 'R']);
    return out;
  },
  'gold-chain': (f) => {
    const out: Patch[] = [];
    for (let x = Math.round(CX) - 3; x <= Math.round(CX) + 3; x++) out.push([f.mouthY + 2, x, 'Y']);
    out.push([f.mouthY + 3, Math.round(CX), 'Y']);
    return out;
  },
};

function cosmeticPatches(f: FaceAnchors, cosmetics: string[]): Patch[] {
  return cosmetics.flatMap((id) => COSMETIC_PATCHES[id]?.(f) ?? []);
}

// ——— Œuf (teinté par le génome : il annonce la couleur de la créature) ———

const EGG_GRID: Grid = [
  '....................',
  '....................',
  '....................',
  '....................',
  '........oooo........',
  '.......oeeeeo.......',
  '......oeeeeeeo......',
  '.....oeeseeeseo.....',
  '.....oeeeeeeeeo.....',
  '....oeeeseeeeeeo....',
  '....oeeeeeeseeeo....',
  '....oeeeeeeeeeeo....',
  '....oeeseeeeseeo....',
  '.....oeeeeeeeeo.....',
  '.....oeeeeeeeeo.....',
  '......oeeeeeeo......',
  '.......oooooo.......',
  '....................',
  '....................',
  '....................',
];

export interface SpriteFrames {
  main: HTMLCanvasElement;
  /** Variante paupières fermées (clignement), si l'état s'y prête. */
  blink: HTMLCanvasElement | null;
}

/** Grille finale (sans canvas) — aussi utilisée par les tests d'invariants. */
export function buildSpriteGrid(
  state: VisibleState,
  stage: StageCode,
  genome: Genome,
  fat = 0,
  cosmetics: string[] = [],
): Grid {
  if (state === 'egg') return EGG_GRID;
  const { grid, face } = buildBody(genome, stage, fat);
  return applyPatches(grid, [...facePatches(state, face), ...cosmeticPatches(face, cosmetics)]);
}

export function buildSprite(
  state: VisibleState,
  stage: StageCode,
  genome: Genome,
  fat = 0,
  cosmetics: string[] = [],
): SpriteFrames {
  if (state === 'egg') {
    const pal = { ...palette(genome), s: `hsl(${genome.hue} 60% 70%)` };
    return { main: gridToCanvas(EGG_GRID, pal), blink: null };
  }

  const { grid, face } = buildBody(genome, stage, fat);
  const basePal = stage === 'grandpa' ? grandpaPalette(genome) : palette(genome);
  const pal =
    state === 'sick'
      ? { ...basePal, b: '#b7d9b0', B: '#d9ecd2', p: '#9cc494' }
      : state === 'dead'
        ? { ...basePal, b: '#c5c9cf', B: '#e2e4e8', p: '#b3b7bd', r: 'transparent' }
        : basePal;

  const wear = cosmeticPatches(face, cosmetics);
  const main = gridToCanvas(applyPatches(grid, [...facePatches(state, face), ...wear]), pal);

  const blinkable = state === 'happy' || state === 'neutral';
  const blink = blinkable
    ? gridToCanvas(
        applyPatches(grid, [
          ...facePatches(state, face).filter(
            ([r, c]) =>
              !(r >= face.eyeY && r <= face.eyeY + 1 &&
                ((c >= face.elx && c <= face.elx + 1) || (c >= face.erx && c <= face.erx + 1))),
          ),
          ...eyesClosed(face),
          ...wear,
        ]),
        pal,
      )
    : null;

  return { main, blink };
}
