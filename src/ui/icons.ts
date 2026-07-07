// Icônes pixel art des actions (12×12, même pipeline que les sprites).
// L'arbre de compétences est un arbre à nœuds lumineux — les talents brillent.

import type { Grid } from '../render/pixel';

export const ICON_PALETTE: Record<string, string> = {
  '.': 'transparent',
  o: '#3f4a5a', // contour
  R: '#e07a5f', // bol
  C: '#8ecae6', // vapeur
  G: '#6fc7a8', // feuillage / balle
  w: '#ffffff',
  Y: '#f4c542', // nœuds de talent / détails or
  T: '#8a6d3b', // tronc
  M: '#b06fd8', // sac
};

/** Bol fumant — Nourrir. */
export const ICON_FEED: Grid = [
  '............',
  '....C...C...',
  '...C...C....',
  '....C...C...',
  '............',
  '.oooooooooo.',
  '.oRRRRRRRRo.',
  '.oRwRRRRRRo.',
  '..oRRRRRRo..',
  '...oooooo...',
  '............',
  '............',
];

/** Balle rebondissante — Jouer. */
export const ICON_PLAY: Grid = [
  '............',
  '...oooooo...',
  '..oGGGGGGo..',
  '.oGGwGGwGGo.',
  '.oGwGGGGwGo.',
  '.oGwGGGGwGo.',
  '.oGGwGGwGGo.',
  '..oGGGGGGo..',
  '...oooooo...',
  '............',
  '............',
  '............',
];

/** Arbre à nœuds lumineux — l'arbre de compétences. */
export const ICON_TREE: Grid = [
  '....oooo....',
  '...oGGGGo...',
  '..oGYGGYGo..',
  '.oGGGGGGGGo.',
  '.oGYGGGGYGo.',
  '..oGGGYGGo..',
  '...oGGGGo...',
  '....oToo....',
  '.....TT.....',
  '.....TT.....',
  '....oTTo....',
  '............',
];

/** Sac de courses — Boutique. */
export const ICON_SHOP: Grid = [
  '............',
  '...oo..oo...',
  '..o..oo..o..',
  '..o......o..',
  '.oMMMMMMMMo.',
  '.oMwMMMMMMo.',
  '.oMMMMMMMMo.',
  '.oMMMYMMMMo.',
  '.oMMMMMMMMo.',
  '..oooooooo..',
  '............',
  '............',
];
