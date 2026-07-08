import type { OutpostGame, TreeRarity } from './types';

export interface TreeTierDef {
  tier: 1 | 2 | 3 | 4 | 5;
  growSeconds: number;
  restSeconds: number;
  wood: number;
  tierUpAt: number | null;
}

export const TREE_TIERS: TreeTierDef[] = [
  { tier: 1, growSeconds: 30 * 60, restSeconds: 20 * 60, wood: 2, tierUpAt: 3 },
  { tier: 2, growSeconds: 60 * 60, restSeconds: 45 * 60, wood: 5, tierUpAt: 8 },
  { tier: 3, growSeconds: 120 * 60, restSeconds: 90 * 60, wood: 12, tierUpAt: 16 },
  { tier: 4, growSeconds: 240 * 60, restSeconds: 180 * 60, wood: 26, tierUpAt: 28 },
  { tier: 5, growSeconds: 480 * 60, restSeconds: 360 * 60, wood: 55, tierUpAt: null },
];

export function treeTierDef(tier: number): TreeTierDef {
  return TREE_TIERS[Math.min(tier, TREE_TIERS.length) - 1];
}

export const RARITY_ORDER: TreeRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_BASE_WEIGHTS: Record<TreeRarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

export const RARITY_WOOD_MULT: Record<TreeRarity, number> = {
  common: 1,
  uncommon: 1.25,
  rare: 1.6,
  epic: 2.2,
  legendary: 3,
};

export const RARITY_TRAIT_COUNT: Record<TreeRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export function rarityWeights(luck: number): Record<TreeRarity, number> {
  if (luck <= 0) return { ...RARITY_BASE_WEIGHTS };
  const shiftTargets: TreeRarity[] = ['uncommon', 'rare', 'epic', 'legendary'];
  const totalOther = shiftTargets.reduce((sum, r) => sum + RARITY_BASE_WEIGHTS[r], 0);
  const shift = Math.min(RARITY_BASE_WEIGHTS.common * 0.9, RARITY_BASE_WEIGHTS.common * luck);
  const weights: Record<TreeRarity, number> = { ...RARITY_BASE_WEIGHTS, common: RARITY_BASE_WEIGHTS.common - shift };
  for (const r of shiftTargets) {
    weights[r] = RARITY_BASE_WEIGHTS[r] + (shift * RARITY_BASE_WEIGHTS[r]) / totalOther;
  }
  return weights;
}

export interface TreeTraitDef {
  id: string;
  label: string;
  description: string;
  woodMult?: number;
  restMult?: number;
  growthMult?: number;
  doubleHarvestChance?: number;
  crumbsPerHarvestPerTier?: number;
  harvestCountMultiplier?: number;
}

export const TREE_TRAITS: TreeTraitDef[] = [
  { id: 'bois-de-fer', label: 'Bois-de-fer', description: '+50 % de bois par récolte.', woodMult: 1.5 },
  { id: 'sempervirent', label: 'Sempervirent', description: 'Repos −40 %.', restMult: 0.6 },
  { id: 'tronc-jumeau', label: 'Tronc-jumeau', description: '20 % de chance de double récolte.', doubleHarvestChance: 0.2 },
  { id: 'croissance-vive', label: 'Croissance vive', description: 'Pousse −30 %.', growthMult: 0.7 },
  { id: 'ecorce-doree', label: 'Écorce dorée', description: '+10 Miettes ×tier par récolte.', crumbsPerHarvestPerTier: 10 },
  { id: 'seve-riche', label: 'Sève riche', description: 'Les récoltes comptent double pour le passage de tier.', harvestCountMultiplier: 2 },
];

export function traitById(id: string): TreeTraitDef | undefined {
  return TREE_TRAITS.find((t) => t.id === id);
}

export const BASE_GARDEN_PLOTS = 3;
export const MAX_GARDEN_PLOTS = 5;
export const SAPLING_COST = 250;

export const WOOD_SECONDS_PER_UNIT = 90;
export const FIRE_CAP_SECONDS = 7200;
export const BASE_COOK_SECONDS = 120;
export const BASE_COOK_BATCH = 1;
export const MAX_COOK_BATCH = 4;
export const BASE_DECORATION_SLOTS = 3;
export const CRUMB_FISH_SELL_PRICE = 40;

export interface DecorationDef {
  id: string;
  label: string;
  description: string;
  cost: number;
  fireBurnMult?: number;
  cookTimeMult?: number;
  sellMult?: number;
}

export const DECORATIONS: DecorationDef[] = [
  { id: 'banc-rondins', label: 'Banc en rondins', description: 'Un banc rustique pour veiller le feu.', cost: 500 },
  { id: 'guirlande-lucioles', label: 'Guirlande de lucioles', description: 'Ça scintille joliment le soir.', cost: 1200 },
  { id: 'totem-chouette', label: 'Totem-chouette', description: 'Elle surveille la Mare depuis son perchoir.', cost: 2500 },
  { id: 'pare-vent', label: 'Pare-vent', description: 'Le feu consomme 10 % de bois en moins.', cost: 4000, fireBurnMult: 0.9 },
  { id: 'grille-fonte', label: 'Grille en fonte', description: 'Cuisson 15 % plus rapide.', cost: 8000, cookTimeMult: 0.85 },
  { id: 'fumoir', label: 'Fumoir', description: 'Le Poisson-miette se vend 10 % plus cher.', cost: 20000, sellMult: 1.1 },
  { id: 'brasero-runique', label: 'Brasero runique', description: 'Une relique qui réchauffe le camp.', cost: 50000 },
];

export function decorationById(id: string): DecorationDef | undefined {
  return DECORATIONS.find((d) => d.id === id);
}

export interface FishSpeciesDef {
  id: string;
  label: string;
  tier: 1 | 2 | 3 | 4 | 5;
  crumbFishYield: number;
  weight: number;
}

export const FISH_SPECIES: FishSpeciesDef[] = [
  { id: 'ablette', label: 'Ablette', tier: 1, crumbFishYield: 1, weight: 50 },
  { id: 'goujon', label: 'Goujon', tier: 1, crumbFishYield: 2, weight: 30 },
  { id: 'perche', label: 'Perche', tier: 2, crumbFishYield: 3, weight: 22 },
  { id: 'truite', label: 'Truite', tier: 2, crumbFishYield: 4, weight: 14 },
  { id: 'brochet', label: 'Brochet', tier: 3, crumbFishYield: 6, weight: 8 },
  { id: 'carpe-lune', label: 'Carpe-lune', tier: 3, crumbFishYield: 8, weight: 5 },
  { id: 'silure', label: 'Silure', tier: 4, crumbFishYield: 14, weight: 2.5 },
  { id: 'esturgeon', label: 'Esturgeon', tier: 4, crumbFishYield: 18, weight: 1.5 },
  { id: 'poisson-soleil', label: 'Poisson-soleil', tier: 5, crumbFishYield: 40, weight: 0.5 },
];

export function fishSpeciesById(id: string): FishSpeciesDef | undefined {
  return FISH_SPECIES.find((s) => s.id === id);
}

export const CAST_WAIT_MIN_SECONDS = 3;
export const CAST_WAIT_MAX_SECONDS = 10;
export const BITE_WINDOW_SECONDS = 1.2;
export const LINE_BREAK_CHANCE = 0.3;

export interface CompetenceNodeDef {
  id: string;
  label: string;
  description: string;
  game: OutpostGame;
  cost: number;
  minLevel: number;
  requires?: string[];
  growthTimeMult?: number;
  restTimeMult?: number;
  extraPlots?: number;
  woodMult?: number;
  rarityLuck?: number;
  doubleHarvestChance?: number;
  maxTier?: 1 | 2 | 3 | 4 | 5;
  fuelBurnMult?: number;
  cookTimeMult?: number;
  batchSize?: number;
  extraDecorSlots?: number;
  sellMult?: number;
  embersCookRatio?: number;
  bonusFishPerBatch4?: number;
  biteDelayMult?: number;
  biteWindowMult?: number;
  noLineBreakT4Plus?: boolean;
  tierLuck?: number;
  doubleCatchChance?: number;
  unlockFishTier?: 4 | 5;
  passiveT1PerHour?: number;
}

export const COMPETENCE_NODES: CompetenceNodeDef[] = [
  { id: 'jardin-croissance-1', label: 'Pousse vive', description: 'Pousse 15 % plus rapide.', game: 'garden', cost: 1, minLevel: 2, growthTimeMult: 0.85 },
  { id: 'jardin-croissance-2', label: 'Pousse ancestrale', description: 'Pousse encore plus rapide (cumulé).', game: 'garden', cost: 2, minLevel: 6, requires: ['jardin-croissance-1'], growthTimeMult: 0.85 },
  { id: 'jardin-repos-1', label: 'Repos léger', description: 'Repos 15 % plus court.', game: 'garden', cost: 1, minLevel: 2, restTimeMult: 0.85 },
  { id: 'jardin-repos-2', label: 'Repos ancestral', description: 'Repos encore plus court (cumulé).', game: 'garden', cost: 2, minLevel: 6, requires: ['jardin-repos-1'], restTimeMult: 0.82 },
  { id: 'jardin-parcelles', label: 'Défrichage', description: '+2 parcelles (4e et 5e).', game: 'garden', cost: 3, minLevel: 8, extraPlots: 2 },
  { id: 'jardin-bois', label: 'Cognée affûtée', description: '+20 % de bois par récolte.', game: 'garden', cost: 2, minLevel: 5, woodMult: 1.2 },
  { id: 'jardin-chance', label: 'Trèfle à quatre feuilles', description: 'Chance de rareté accrue à la plantation.', game: 'garden', cost: 2, minLevel: 7, rarityLuck: 0.35 },
  { id: 'jardin-double-recolte', label: 'Double cognée', description: '15 % de chance de double récolte.', game: 'garden', cost: 2, minLevel: 9, doubleHarvestChance: 0.15 },
  { id: 'jardin-tier4', label: 'Sylve ancienne', description: 'Débloque les arbres de tier 4.', game: 'garden', cost: 2, minLevel: 10, maxTier: 4 },
  { id: 'jardin-tier5', label: 'Sylve primordiale', description: 'Débloque les arbres de tier 5.', game: 'garden', cost: 2, minLevel: 15, requires: ['jardin-tier4'], maxTier: 5 },

  { id: 'camp-feu-eco', label: 'Foyer économe', description: 'Le feu consomme 25 % de bois en moins.', game: 'camp', cost: 3, minLevel: 3, fuelBurnMult: 0.75 },
  { id: 'camp-cuisson-1', label: 'Bonne braise', description: 'Cuisson 20 % plus rapide.', game: 'camp', cost: 1, minLevel: 2, cookTimeMult: 0.83 },
  { id: 'camp-cuisson-2', label: 'Grande braise', description: 'Cuisson encore plus rapide (cumulé).', game: 'camp', cost: 2, minLevel: 6, requires: ['camp-cuisson-1'], cookTimeMult: 0.83 },
  { id: 'camp-fournee-1', label: 'Grande broche', description: 'Fournées de 2 poissons.', game: 'camp', cost: 1, minLevel: 4, batchSize: 2 },
  { id: 'camp-fournee-2', label: 'Broche royale', description: 'Fournées de 4 poissons.', game: 'camp', cost: 2, minLevel: 8, requires: ['camp-fournee-1'], batchSize: 4 },
  { id: 'camp-deco-slots', label: 'Agrandissement', description: '+2 emplacements de décoration.', game: 'camp', cost: 2, minLevel: 5, extraDecorSlots: 2 },
  { id: 'camp-vente-1', label: 'Bon vendeur', description: 'Vente +15 %.', game: 'camp', cost: 1, minLevel: 3, sellMult: 1.15 },
  { id: 'camp-vente-2', label: 'Grand vendeur', description: 'Vente encore meilleure (cumulé).', game: 'camp', cost: 2, minLevel: 7, requires: ['camp-vente-1'], sellMult: 1.13 },
  { id: 'camp-braises', label: 'Braises éternelles', description: 'La cuisson continue à 25 % de vitesse sans feu.', game: 'camp', cost: 3, minLevel: 10, embersCookRatio: 0.25 },
  { id: 'camp-fumage-lent', label: 'Fumage lent', description: '+1 Poisson-miette par fournée de 4.', game: 'camp', cost: 2, minLevel: 12, requires: ['camp-fournee-2'], bonusFishPerBatch4: 1 },

  { id: 'mare-touche', label: 'Instinct du pêcheur', description: 'Attente avant touche −40 %.', game: 'pool', cost: 2, minLevel: 3, biteDelayMult: 0.6 },
  { id: 'mare-fenetre-1', label: 'Poignet sûr', description: 'Fenêtre de ferrage +40 %.', game: 'pool', cost: 1, minLevel: 2, biteWindowMult: 1.4 },
  { id: 'mare-fenetre-2', label: 'Poignet expert', description: 'Fenêtre de ferrage encore plus large (cumulé).', game: 'pool', cost: 2, minLevel: 6, requires: ['mare-fenetre-1'], biteWindowMult: 1.4 },
  { id: 'mare-fil-solide', label: 'Fil solide', description: 'Les poissons de tier 4+ ne cassent plus la ligne.', game: 'pool', cost: 2, minLevel: 8, noLineBreakT4Plus: true },
  { id: 'mare-tierluck', label: 'Œil de lynx', description: 'Chance accrue de prises de tier élevé.', game: 'pool', cost: 2, minLevel: 5, tierLuck: 0.35 },
  { id: 'mare-double-prise-1', label: 'Bonne épuisette', description: '10 % de chance de double prise.', game: 'pool', cost: 1, minLevel: 4, doubleCatchChance: 0.1 },
  { id: 'mare-double-prise-2', label: 'Grande épuisette', description: 'Chance de double prise accrue (cumulé).', game: 'pool', cost: 2, minLevel: 9, requires: ['mare-double-prise-1'], doubleCatchChance: 0.15 },
  { id: 'mare-tier4', label: 'Eaux profondes', description: 'Débloque les poissons de tier 4.', game: 'pool', cost: 2, minLevel: 12, unlockFishTier: 4 },
  { id: 'mare-tier5', label: 'Abysses de la Mare', description: 'Débloque les poissons de tier 5.', game: 'pool', cost: 2, minLevel: 16, requires: ['mare-tier4'], unlockFishTier: 5 },
  { id: 'mare-nasse', label: 'Nasse automatique', description: '+2 Ablettes par heure, sans lancer.', game: 'pool', cost: 3, minLevel: 14, passiveT1PerHour: 2 },
];

export function competenceNodeById(id: string): CompetenceNodeDef | undefined {
  return COMPETENCE_NODES.find((n) => n.id === id);
}

export function competenceNodesForGame(game: OutpostGame): CompetenceNodeDef[] {
  return COMPETENCE_NODES.filter((n) => n.game === game);
}

export const XP_PLANT = 2;
export const XP_TIER_UP = 25;
export const XP_DECORATION = 15;
export const XP_CATCH_PER_TIER = 5;
export const XP_MISS = 1;
export const XP_COOK_PER_TIER_PER_FISH = 3;

export const HARVEST_TIER_UP_THRESHOLDS = [3, 8, 16, 28];
