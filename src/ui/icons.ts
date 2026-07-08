// Icônes pixel art des actions (12×12, même pipeline que les sprites).
// Palette unique, rendues via gridToCanvas → img nearest-neighbor.

import type { Grid } from '../render/pixel';

export const ICON_PALETTE: Record<string, string> = {
  '.': 'transparent',
  o: '#3f4a5a', // contour sombre
  R: '#e07a5f', // rouge / danger
  C: '#8ecae6', // bleu ciel / vapeur
  G: '#6fc7a8', // vert menthe
  w: '#ffffff', // blanc
  Y: '#f4c542', // or / jaune
  T: '#8a6d3b', // marron / tronc
  M: '#b06fd8', // violet
  B: '#fdf3e3', // beige clair
  P: '#ff9aa2', // rose
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

/** Arbre à nœuds lumineux — Compétences. */
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

/** Pièce de monnaie d'or (Token). */
export const ICON_TOKEN: Grid = [
  '............',
  '....oooo....',
  '...oYYYYo...',
  '..oYYwYYYo..',
  '..oYwYYwYo..',
  '..oYYwYYYo..',
  '..oYYYYYYo..',
  '...oYYYYo...',
  '....oooo....',
  '............',
  '............',
  '............',
];

/** Miette de pain. */
export const ICON_CRUMB: Grid = [
  '............',
  '...ooooo....',
  '..oTTTTTo...',
  '.oTTTTTTTo..',
  '.oTYTTTYTo..',
  '.oTTTTTTTo..',
  '.oTTTTTTTo..',
  '..ooooooo...',
  '............',
  '............',
  '............',
  '............',
];

/** Tête de mort (Prestige). */
export const ICON_SKULL: Grid = [
  '....oooo....',
  '..oowwwwoo..',
  '.owwwwwwwwo.',
  '.owwowwowwo.',
  '.owwwwwwwwo.',
  '.owwwwwwwwo.',
  '..owwwwwwo..',
  '...owwwwwo..',
  '....owooo...',
  '....o.o.....',
  '............',
  '............',
];

/** Engrenage (Paramètres / Dev). */
export const ICON_GEAR: Grid = [
  '.....oo.....',
  '....owwo....',
  '..oowwwwoo..',
  '.owwwwwwwwo.',
  '.owwwwwwwwo.',
  '.owwwwwwwwo.',
  '.owwwwwwwwo.',
  '..oowwwwoo..',
  '....owwo....',
  '.....oo.....',
  '............',
  '............',
];

/** Éclair / énergie (PEA / investissement). */
export const ICON_PEA: Grid = [
  '........oo..',
  '.......oYo..',
  '......oYYo..',
  '.....oYYYo..',
  '....oYYYoo..',
  '...oYYYo....',
  '..oYYYo.....',
  '..oYYo......',
  '..oYo.......',
  '..oo........',
  '............',
  '............',
];

/** Flèche vers le haut / amélioration. */
export const ICON_UPGRADE: Grid = [
  '.....oo.....',
  '....oGGo....',
  '...oGGGGo...',
  '..oGGGGGGo..',
  '.oGGooooGGo.',
  '..oGGooGGo..',
  '...oGGoGo...',
  '....oGGo....',
  '....oGGo....',
  '....oGGo....',
  '.....oo.....',
  '............',
];

/** Livre — étude / apprentissage. */
export const ICON_BOOK: Grid = [
  '............',
  '.ooooooooo..',
  '.oTwwwwwTo..',
  '.oTwwwwwTo..',
  '.oTwowwwTo..',
  '.oTwwwwwTo..',
  '.oTwwwwwTo..',
  '.oTwwwwwTo..',
  '.oTwwwwwTo..',
  '.ooooooooo..',
  '............',
  '............',
];

/** Etoile — prestige / bonus. */
export const ICON_STAR: Grid = [
  '.....oo.....',
  '....oYYo....',
  'ooooYYYYoooo',
  '.oYYYYYYYYo.',
  '..oYYYYYYo..',
  '..oYYYYYYo..',
  '.oYYoooYYYo.',
  'oYYo...oYYYo',
  '............',
  '............',
  '............',
  '............',
];

/** Bouclier — défense / coffre-fort. */
export const ICON_SHIELD: Grid = [
  '............',
  '..oooooooo..',
  '.oGGGGGGGGo.',
  '.oGGGGGGGGo.',
  '.oGGGGGGGGo.',
  '.oGGYYYGGGo.',
  '.oGGYGYGGGo.',
  '..oGGYGGGo..',
  '...oGGGGo...',
  '....oooo....',
  '............',
  '............',
];

/** Maison / petits adoptés. */
export const ICON_HOUSE: Grid = [
  '.....oo.....',
  '....oYYo....',
  '...oYYYYo...',
  '..oYYYYYYo..',
  '.ooooooooooo',
  '.owwwwwwwwwo',
  '.owwooowwwwo',
  '.owwooowwwwo',
  '.owwwwwwwwwo',
  '.owwwwwwwwwo',
  '.ooooooooooo',
  '............',
];

/** Avertissement / alerte triangle. */
export const ICON_ALERT: Grid = [
  '.....oo.....',
  '....oRRo....',
  '....oRRo....',
  '...oRRRRo...',
  '...oRRRRo...',
  '..oRRRRRRo..',
  '..oRRwwRRo..',
  '.oRRwwwwRRo.',
  '.oRRwwwwRRo.',
  '.ooooooooooo',
  '............',
  '............',
];
