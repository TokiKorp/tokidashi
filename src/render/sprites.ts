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

export function palette(g: Genome): Record<string, string> {
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
    // Cosmétiques — ombres/reflets (paires sombre/clair par teinte de base)
    Z: '#15151c',
    I: '#6e6e82',
    G: '#a8781f',
    H: '#fbe27e',
    D: '#2f8fa0',
    L: '#a8e6ef',
    N: '#7c3f96',
    P: '#dba8f0',
    F: '#a52a3d',
    T: '#ff7a90',
    J: '#3ecf8e',
  };
}

/** Papy : pelage grisonnant, mais toujours sa teinte (GDD §4.3). */
export function grandpaPalette(g: Genome): Record<string, string> {
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

export const COSMETIC_PATCHES: Record<string, (f: FaceAnchors) => Patch[]> = {
  beret: (f) => {
    const cx = Math.round(CX);
    return [
      [f.topRow - 4, cx, 'A'],
      [f.topRow - 3, cx - 3, 'T'], [f.topRow - 3, cx - 2, 'T'], [f.topRow - 3, cx - 1, 'R'],
      [f.topRow - 3, cx, 'R'], [f.topRow - 3, cx + 1, 'R'],
      [f.topRow - 2, cx - 3, 'T'], [f.topRow - 2, cx - 2, 'R'], [f.topRow - 2, cx - 1, 'R'], [f.topRow - 2, cx, 'R'],
      [f.topRow - 2, cx + 1, 'F'], [f.topRow - 2, cx + 2, 'F'], [f.topRow - 2, cx + 3, 'F'],
      [f.topRow - 1, cx + 2, 'F'], [f.topRow - 1, cx + 3, 'F'], [f.topRow - 1, cx + 4, 'F'],
    ];
  },
  'party-hat': (f) => {
    const cx = Math.round(CX);
    return [
      [f.topRow - 1, cx - 3, 'N'], [f.topRow - 1, cx - 2, 'M'], [f.topRow - 1, cx - 1, 'H'],
      [f.topRow - 1, cx, 'M'], [f.topRow - 1, cx + 1, 'H'], [f.topRow - 1, cx + 2, 'M'], [f.topRow - 1, cx + 3, 'N'],
      [f.topRow - 2, cx - 2, 'N'], [f.topRow - 2, cx - 1, 'M'], [f.topRow - 2, cx, 'H'],
      [f.topRow - 2, cx + 1, 'M'], [f.topRow - 2, cx + 2, 'N'],
      [f.topRow - 3, cx - 1, 'M'], [f.topRow - 3, cx, 'H'], [f.topRow - 3, cx + 1, 'M'],
      [f.topRow - 4, cx, 'H'],
      [f.topRow - 5, cx, 'w'],
    ];
  },
  'top-hat': (f) => {
    const cx = Math.round(CX);
    const out: Patch[] = [];
    for (const y of [f.topRow - 4, f.topRow - 3]) {
      out.push([y, cx - 2, 'A'], [y, cx - 1, 'I'], [y, cx, 'A'], [y, cx + 1, 'A'], [y, cx + 2, 'Z']);
    }
    for (let x = cx - 2; x <= cx + 2; x++) out.push([f.topRow - 2, x, 'F']);
    out.push([f.topRow - 1, cx - 4, 'Z']);
    for (let x = cx - 3; x <= cx + 3; x++) out.push([f.topRow - 1, x, 'A']);
    out.push([f.topRow - 1, cx + 4, 'Z']);
    return out;
  },
  bandana: (f) => {
    const cx = Math.round(CX);
    return [
      [f.topRow - 1, cx - 3, 'L'], [f.topRow - 1, cx - 2, 'L'], [f.topRow - 1, cx - 1, 'L'],
      [f.topRow - 1, cx, 'L'], [f.topRow - 1, cx + 1, 'L'], [f.topRow - 1, cx + 2, 'L'], [f.topRow - 1, cx + 3, 'L'],
      [f.topRow, cx - 3, 'C'], [f.topRow, cx - 2, 'w'], [f.topRow, cx - 1, 'C'], [f.topRow, cx, 'C'],
      [f.topRow, cx + 1, 'w'], [f.topRow, cx + 2, 'C'], [f.topRow, cx + 3, 'C'],
      [f.topRow + 1, cx - 2, 'D'], [f.topRow + 1, cx - 1, 'D'], [f.topRow + 1, cx, 'D'],
      [f.topRow + 1, cx + 1, 'D'], [f.topRow + 1, cx + 2, 'D'],
      [f.topRow + 1, cx + 4, 'C'], [f.topRow + 2, cx + 4, 'D'], [f.topRow + 2, cx + 5, 'C'], [f.topRow + 3, cx + 4, 'D'],
    ];
  },
  crown: (f) => {
    const cx = Math.round(CX);
    return [
      [f.topRow - 2, cx - 3, 'H'], [f.topRow - 2, cx, 'H'], [f.topRow - 2, cx + 3, 'H'],
      [f.topRow - 1, cx - 3, 'H'], [f.topRow - 1, cx - 2, 'Y'], [f.topRow - 1, cx - 1, 'R'],
      [f.topRow - 1, cx, 'Y'], [f.topRow - 1, cx + 1, 'C'], [f.topRow - 1, cx + 2, 'Y'], [f.topRow - 1, cx + 3, 'H'],
      [f.topRow, cx - 3, 'G'], [f.topRow, cx - 2, 'G'], [f.topRow, cx - 1, 'G'],
      [f.topRow, cx, 'J'], [f.topRow, cx + 1, 'G'], [f.topRow, cx + 2, 'G'], [f.topRow, cx + 3, 'G'],
    ];
  },
  halo: (f) => {
    const cx = Math.round(CX);
    return [
      [f.topRow - 6, cx, 'w'],
      [f.topRow - 5, cx - 4, 'w'], [f.topRow - 5, cx - 3, 'Y'], [f.topRow - 5, cx - 2, 'H'], [f.topRow - 5, cx - 1, 'Y'],
      [f.topRow - 5, cx, 'H'], [f.topRow - 5, cx + 1, 'Y'], [f.topRow - 5, cx + 2, 'H'], [f.topRow - 5, cx + 3, 'Y'],
      [f.topRow - 5, cx + 4, 'w'],
      [f.topRow - 4, cx - 2, 'G'], [f.topRow - 4, cx - 1, 'Y'], [f.topRow - 4, cx, 'H'],
      [f.topRow - 4, cx + 1, 'Y'], [f.topRow - 4, cx + 2, 'G'],
    ];
  },
  sunglasses: (f) => {
    const cx = Math.round(CX);
    const out: Patch[] = [];
    for (const ex of [f.elx, f.erx]) {
      out.push(
        [f.eyeY - 1, ex - 1, 'Z'], [f.eyeY - 1, ex, 'Z'], [f.eyeY - 1, ex + 1, 'Z'], [f.eyeY - 1, ex + 2, 'Z'],
        [f.eyeY, ex - 1, 'Z'], [f.eyeY, ex, 'A'], [f.eyeY, ex + 1, 'A'], [f.eyeY, ex + 2, 'Z'],
        [f.eyeY + 1, ex - 1, 'Z'], [f.eyeY + 1, ex, 'd'], [f.eyeY + 1, ex + 1, 'd'], [f.eyeY + 1, ex + 2, 'Z'],
      );
    }
    out.push(
      [f.eyeY, cx - 1, 'Z'], [f.eyeY, cx, 'Z'],
      [f.eyeY, f.elx - 2, 'A'], [f.eyeY, f.erx + 3, 'A'],
      [f.eyeY, f.erx + 1, 'w'],
    );
    return out;
  },
  monocle: (f) => [
    [f.eyeY - 1, f.erx - 1, 'Y'], [f.eyeY - 1, f.erx, 'Y'], [f.eyeY - 1, f.erx + 1, 'Y'], [f.eyeY - 1, f.erx + 2, 'Y'],
    [f.eyeY, f.erx - 1, 'Y'], [f.eyeY, f.erx, 'd'], [f.eyeY, f.erx + 1, 'd'], [f.eyeY, f.erx + 2, 'Y'],
    [f.eyeY + 1, f.erx - 1, 'Y'], [f.eyeY + 1, f.erx, 'd'], [f.eyeY + 1, f.erx + 1, 'd'], [f.eyeY + 1, f.erx + 2, 'Y'],
    [f.eyeY + 2, f.erx - 1, 'Y'], [f.eyeY + 2, f.erx, 'Y'], [f.eyeY + 2, f.erx + 1, 'Y'], [f.eyeY + 2, f.erx + 2, 'Y'],
    [f.eyeY + 3, f.erx + 2, 'A'], [f.eyeY + 4, f.erx + 3, 'A'], [f.eyeY + 5, f.erx + 4, 'A'],
  ],
  flower: (f) => [
    [f.topRow - 1, f.elx - 2, 'H'],
    [f.topRow - 2, f.elx - 3, 'G'], [f.topRow - 2, f.elx - 1, 'G'], [f.topRow, f.elx - 3, 'G'], [f.topRow, f.elx - 1, 'G'],
    [f.topRow - 3, f.elx - 2, 'M'], [f.topRow - 4, f.elx - 2, 'P'],
    [f.topRow + 1, f.elx - 2, 'M'], [f.topRow + 2, f.elx - 2, 'P'],
    [f.topRow - 1, f.elx - 4, 'M'], [f.topRow - 1, f.elx - 5, 'P'],
    [f.topRow - 1, f.elx, 'M'], [f.topRow - 1, f.elx + 1, 'P'],
    [f.topRow + 3, f.elx - 2, 'g'], [f.topRow + 4, f.elx - 2, 'g'], [f.topRow + 3, f.elx - 1, 'g'],
  ],
  bow: (f) => {
    const cx = Math.round(CX);
    return [
      [f.mouthY + 2, cx - 3, 'T'], [f.mouthY + 2, cx - 2, 'T'],
      [f.mouthY + 3, cx - 3, 'R'], [f.mouthY + 3, cx - 2, 'R'],
      [f.mouthY + 4, cx - 3, 'F'], [f.mouthY + 4, cx - 2, 'F'],
      [f.mouthY + 2, cx + 2, 'T'], [f.mouthY + 2, cx + 3, 'T'],
      [f.mouthY + 3, cx + 2, 'R'], [f.mouthY + 3, cx + 3, 'R'],
      [f.mouthY + 4, cx + 2, 'F'], [f.mouthY + 4, cx + 3, 'F'],
      [f.mouthY + 3, cx - 1, 'A'], [f.mouthY + 3, cx, 'A'], [f.mouthY + 3, cx + 1, 'A'],
      [f.mouthY + 2, cx, 'w'],
    ];
  },
  scarf: (f) => {
    const cx = Math.round(CX);
    const out: Patch[] = [];
    for (let x = cx - 3; x <= cx + 3; x++) out.push([f.mouthY + 1, x, 'T']);
    for (let x = cx - 4; x <= cx + 4; x++) out.push([f.mouthY + 2, x, (x - cx) % 2 === 0 ? 'R' : 'F']);
    for (let x = cx - 4; x <= cx + 4; x++) out.push([f.mouthY + 3, x, (x - cx) % 2 === 0 ? 'F' : 'R']);
    out.push([f.mouthY + 4, cx + 4, 'R'], [f.mouthY + 5, cx + 3, 'F'], [f.mouthY + 5, cx + 4, 'R']);
    return out;
  },
  'gold-chain': (f) => {
    const cx = Math.round(CX);
    return [
      [f.mouthY + 2, cx - 3, 'H'], [f.mouthY + 2, cx - 2, 'G'], [f.mouthY + 2, cx - 1, 'H'],
      [f.mouthY + 2, cx, 'G'], [f.mouthY + 2, cx + 1, 'H'], [f.mouthY + 2, cx + 2, 'G'], [f.mouthY + 2, cx + 3, 'H'],
      [f.mouthY + 3, cx - 2, 'G'], [f.mouthY + 3, cx - 1, 'H'], [f.mouthY + 3, cx, 'G'],
      [f.mouthY + 3, cx + 1, 'H'], [f.mouthY + 3, cx + 2, 'G'],
      [f.mouthY + 4, cx, 'G'],
      [f.mouthY + 5, cx, 'J'], [f.mouthY + 5, cx + 1, 'w'],
    ];
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
