// Sprites pixel art des ennemis (événements-menaces) : 2 frames chacun,
// animés dans la scène Pixi et cliquables pour les chasser.

import type { Grid } from './pixel';

export const ENEMY_PALETTE: Record<string, string> = {
  '.': 'transparent',
  K: '#2b2b33', // plumage corbeau
  G: '#9aa2ad', // pigeon gris
  D: '#7a3b2e', // fourmis
  O: '#e8933a', // becs et pattes
  w: '#ffffff',
  S: '#c8ccd8', // coque de soucoupe
  L: '#9fe8ff', // dôme et rayon tracteur
};

interface EnemySprite {
  frames: [Grid, Grid];
  /** Durée d'une frame (ms). */
  frameMs: number;
}

/** Corbeau chapardeur — vol stationnaire, ailes hautes / basses. */
const CROW: EnemySprite = {
  frameMs: 160,
  frames: [
    [
      '.....K..K...',
      '.....KK.KK..',
      '......KKKK..',
      '..O.wKKKK...',
      '..OKKKKKK...',
      '....KKKKKK..',
      '....KKKKKK..',
      '.....KKKK...',
      '......K.K...',
      '......O.O...',
      '............',
      '............',
    ],
    [
      '............',
      '............',
      '......KKKK..',
      '..O.wKKKK...',
      '..OKKKKKK...',
      '....KKKKKK..',
      '...KKKKKKK..',
      '..KK.KKKK...',
      '.KK...K.K...',
      '......O.O...',
      '............',
      '............',
    ],
  ],
};

/** Invasion de fourmis — la colonne marche, pattes alternées. */
const ANTS: EnemySprite = {
  frameMs: 140,
  frames: [
    [
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '.DD..DD..DD.',
      '.DD..DD..DD.',
      'D..DD..DD..D',
      '............',
    ],
    [
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '.DD..DD..DD.',
      '.DD..DD..DD.',
      '.D.D.D.D.D.D',
      '............',
    ],
  ],
};

/** Pigeon glouton — il picore, tête haute / tête au sol. */
const PIGEON: EnemySprite = {
  frameMs: 320,
  frames: [
    [
      '............',
      '...GG.......',
      '..GwGG......',
      '..OGG.......',
      '...GGGGG....',
      '..GGGGGGG...',
      '..GGGGGGGG..',
      '...GGGGGG...',
      '....GG.GG...',
      '....O...O...',
      '............',
      '............',
    ],
    [
      '............',
      '............',
      '............',
      '............',
      '...GGGGG....',
      '..GGGGGGGG..',
      '.GwGGGGGGG..',
      '.OGG.GGGG...',
      '..G..GG.GG..',
      '....O...O...',
      '............',
      '............',
    ],
  ],
};

/** OVNI kidnappeur — hublots qui clignotent, rayon tracteur intermittent. */
const UFO: EnemySprite = {
  frameMs: 240,
  frames: [
    [
      '............',
      '....LLLL....',
      '...LLLLLL...',
      '..oooooooo..',
      '.oSSSSSSSSo.',
      'oSwSSwSSwSSo',
      '.oSSSSSSSSo.',
      '..oooooooo..',
      '............',
      '............',
      '............',
      '............',
    ],
    [
      '............',
      '....LLLL....',
      '...LLLLLL...',
      '..oooooooo..',
      '.oSSSSSSSSo.',
      'oSSwSSwSSwSo',
      '.oSSSSSSSSo.',
      '..oooooooo..',
      '....LLLL....',
      '....LLLL....',
      '.....LL.....',
      '............',
    ],
  ],
};

export const ENEMY_SPRITES: Record<string, EnemySprite> = {
  'crumb-thief': CROW,
  'ant-invasion': ANTS,
  'greedy-pigeon': PIGEON,
  'ufo-abduction': UFO,
};

/** Trajectoire de l'ennemi dans la scène (px, origine = position de base). */
export function enemyMotion(
  id: string,
  t: number,
): { x: number; y: number } {
  switch (id) {
    case 'crumb-thief': // vol stationnaire au-dessus des tas
      return { x: 200 + Math.sin(t / 400) * 30, y: 78 + Math.sin(t / 230) * 8 };
    case 'ant-invasion': // aller-retour au sol
      return { x: 150 + Math.sin(t / 900) * 70, y: 190 };
    case 'greedy-pigeon': // sautille en picorant
      return { x: 185 + Math.sin(t / 700) * 25, y: 192 - Math.abs(Math.sin(t / 260)) * 6 };
    case 'ufo-abduction': // plane haut, balaie la scène à la recherche d'un petit
      return { x: 132 + Math.sin(t / 550) * 60, y: 62 + Math.sin(t / 320) * 5 };
    default:
      return { x: 200, y: 120 };
  }
}
