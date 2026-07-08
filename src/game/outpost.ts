import type { GameConfig } from './config';
import {
  BASE_COOK_SECONDS,
  BASE_DECORATION_SLOTS,
  BASE_GARDEN_PLOTS,
  CRUMB_FISH_SELL_PRICE,
  FIRE_CAP_SECONDS,
  FISH_SPECIES,
  HARVEST_TIER_UP_THRESHOLDS,
  LINE_BREAK_CHANCE,
  MAX_GARDEN_PLOTS,
  RARITY_ORDER,
  RARITY_TRAIT_COUNT,
  RARITY_WOOD_MULT,
  SAPLING_COST,
  TREE_TRAITS,
  WOOD_SECONDS_PER_UNIT,
  XP_CATCH_PER_TIER,
  XP_COOK_PER_TIER_PER_FISH,
  XP_DECORATION,
  XP_MISS,
  XP_PLANT,
  XP_TIER_UP,
  competenceNodeById,
  decorationById,
  fishSpeciesById,
  rarityWeights,
  traitById,
  treeTierDef,
  type FishSpeciesDef,
} from './outpostConfig';
import type {
  CampState,
  OutpostGame,
  OutpostState,
  SimEvent,
  Tree,
  TreeRarity,
  WalletState,
} from './types';

const HOUR = 3600;

export type OutpostActionResult =
  | { ok: true; events: SimEvent[] }
  | { ok: false; reason: string };

export function freshOutpost(): OutpostState {
  return {
    resources: { wood: 0, rawFish: {}, crumbFish: 0 },
    garden: { plots: Array(MAX_GARDEN_PLOTS).fill(null), nextTreeId: 1 },
    camp: { fuelSeconds: 0, cooking: null, decorations: [] },
    pool: { casts: 0, catches: 0, bestTier: 0 },
    competences: {
      garden: { xp: 0, nodes: [] },
      camp: { xp: 0, nodes: [] },
      pool: { xp: 0, nodes: [] },
    },
  };
}

export const COMPETENCE_MAX_LEVEL = 20;

export function xpToReach(level: number): number {
  if (level <= 1) return 0;
  return Math.round((120 * (Math.pow(1.85, level - 1) - 1)) / 0.85);
}

export function competenceLevel(xp: number): number {
  let level = 1;
  for (let l = 2; l <= COMPETENCE_MAX_LEVEL; l++) {
    if (xp >= xpToReach(l)) level = l;
    else break;
  }
  return level;
}

export function competencePointsAvailable(o: OutpostState, game: OutpostGame): number {
  const state = o.competences[game];
  const level = competenceLevel(state.xp);
  const spent = state.nodes.reduce((sum, id) => sum + (competenceNodeById(id)?.cost ?? 0), 0);
  return level - 1 - spent;
}

export interface GardenModifiers {
  growthTimeMult: number;
  restTimeMult: number;
  extraPlots: number;
  woodMult: number;
  rarityLuck: number;
  doubleHarvestChance: number;
  maxTier: 1 | 2 | 3 | 4 | 5;
}

export interface CampModifiers {
  fuelBurnMult: number;
  cookTimeMult: number;
  batchSize: number;
  extraDecorSlots: number;
  sellMult: number;
  embersCookRatio: number;
  bonusFishPerBatch4: number;
}

export interface PoolModifiers {
  biteDelayMult: number;
  biteWindowMult: number;
  noLineBreakT4Plus: boolean;
  tierLuck: number;
  doubleCatchChance: number;
  maxFishTier: 1 | 2 | 3 | 4 | 5;
  passiveT1PerHour: number;
}

export interface OutpostModifiers {
  garden: GardenModifiers;
  camp: CampModifiers;
  pool: PoolModifiers;
}

export function competenceModifiers(o: OutpostState): OutpostModifiers {
  const mods: OutpostModifiers = {
    garden: {
      growthTimeMult: 1,
      restTimeMult: 1,
      extraPlots: 0,
      woodMult: 1,
      rarityLuck: 0,
      doubleHarvestChance: 0,
      maxTier: 3,
    },
    camp: {
      fuelBurnMult: 1,
      cookTimeMult: 1,
      batchSize: 1,
      extraDecorSlots: 0,
      sellMult: 1,
      embersCookRatio: 0,
      bonusFishPerBatch4: 0,
    },
    pool: {
      biteDelayMult: 1,
      biteWindowMult: 1,
      noLineBreakT4Plus: false,
      tierLuck: 0,
      doubleCatchChance: 0,
      maxFishTier: 3,
      passiveT1PerHour: 0,
    },
  };

  for (const game of ['garden', 'camp', 'pool'] as OutpostGame[]) {
    for (const nodeId of o.competences[game].nodes) {
      const def = competenceNodeById(nodeId);
      if (!def) continue;
      if (def.growthTimeMult) mods.garden.growthTimeMult *= def.growthTimeMult;
      if (def.restTimeMult) mods.garden.restTimeMult *= def.restTimeMult;
      if (def.extraPlots) mods.garden.extraPlots += def.extraPlots;
      if (def.woodMult) mods.garden.woodMult *= def.woodMult;
      if (def.rarityLuck) mods.garden.rarityLuck += def.rarityLuck;
      if (def.doubleHarvestChance) mods.garden.doubleHarvestChance += def.doubleHarvestChance;
      if (def.maxTier) mods.garden.maxTier = Math.max(mods.garden.maxTier, def.maxTier) as 1 | 2 | 3 | 4 | 5;

      if (def.fuelBurnMult) mods.camp.fuelBurnMult *= def.fuelBurnMult;
      if (def.cookTimeMult) mods.camp.cookTimeMult *= def.cookTimeMult;
      if (def.batchSize) mods.camp.batchSize = Math.max(mods.camp.batchSize, def.batchSize);
      if (def.extraDecorSlots) mods.camp.extraDecorSlots += def.extraDecorSlots;
      if (def.sellMult) mods.camp.sellMult *= def.sellMult;
      if (def.embersCookRatio) mods.camp.embersCookRatio = Math.max(mods.camp.embersCookRatio, def.embersCookRatio);
      if (def.bonusFishPerBatch4) mods.camp.bonusFishPerBatch4 += def.bonusFishPerBatch4;

      if (def.biteDelayMult) mods.pool.biteDelayMult *= def.biteDelayMult;
      if (def.biteWindowMult) mods.pool.biteWindowMult *= def.biteWindowMult;
      if (def.noLineBreakT4Plus) mods.pool.noLineBreakT4Plus = true;
      if (def.tierLuck) mods.pool.tierLuck += def.tierLuck;
      if (def.doubleCatchChance) mods.pool.doubleCatchChance += def.doubleCatchChance;
      if (def.unlockFishTier) mods.pool.maxFishTier = Math.max(mods.pool.maxFishTier, def.unlockFishTier) as 1 | 2 | 3 | 4 | 5;
      if (def.passiveT1PerHour) mods.pool.passiveT1PerHour += def.passiveT1PerHour;
    }
  }

  for (const decoId of o.camp.decorations) {
    const def = decorationById(decoId);
    if (!def) continue;
    if (def.fireBurnMult) mods.camp.fuelBurnMult *= def.fireBurnMult;
    if (def.cookTimeMult) mods.camp.cookTimeMult *= def.cookTimeMult;
    if (def.sellMult) mods.camp.sellMult *= def.sellMult;
  }

  mods.garden.growthTimeMult = Math.max(0.3, mods.garden.growthTimeMult);
  mods.garden.restTimeMult = Math.max(0.3, mods.garden.restTimeMult);
  mods.garden.rarityLuck = Math.min(1, mods.garden.rarityLuck);
  mods.garden.doubleHarvestChance = Math.min(0.6, mods.garden.doubleHarvestChance);

  mods.camp.fuelBurnMult = Math.max(0.4, mods.camp.fuelBurnMult);
  mods.camp.cookTimeMult = Math.max(0.3, mods.camp.cookTimeMult);
  mods.camp.batchSize = Math.min(4, mods.camp.batchSize);

  mods.pool.biteDelayMult = Math.max(0.2, mods.pool.biteDelayMult);
  mods.pool.biteWindowMult = Math.min(4, mods.pool.biteWindowMult);
  mods.pool.doubleCatchChance = Math.min(0.35, mods.pool.doubleCatchChance);
  mods.pool.tierLuck = Math.min(1, mods.pool.tierLuck);

  return mods;
}

export function availableGardenPlots(mods: OutpostModifiers): number {
  return Math.min(MAX_GARDEN_PLOTS, BASE_GARDEN_PLOTS + mods.garden.extraPlots);
}

export function isTreeMature(tree: Tree, mods: OutpostModifiers): boolean {
  return tree.growthSeconds >= effectiveGrowSeconds(tree, mods);
}

export function effectiveGrowSeconds(tree: Tree, mods: OutpostModifiers): number {
  let mult = mods.garden.growthTimeMult;
  for (const traitId of tree.traits) {
    const t = traitById(traitId);
    if (t?.growthMult) mult *= t.growthMult;
  }
  return treeTierDef(tree.tier).growSeconds * mult;
}

export function effectiveRestSeconds(tree: Tree, mods: OutpostModifiers): number {
  let mult = mods.garden.restTimeMult;
  for (const traitId of tree.traits) {
    const t = traitById(traitId);
    if (t?.restMult) mult *= t.restMult;
  }
  return treeTierDef(tree.tier).restSeconds * mult;
}

export function treeWoodYield(tree: Tree, mods: OutpostModifiers): number {
  let mult = RARITY_WOOD_MULT[tree.rarity] * mods.garden.woodMult;
  for (const traitId of tree.traits) {
    const t = traitById(traitId);
    if (t?.woodMult) mult *= t.woodMult;
  }
  return treeTierDef(tree.tier).wood * mult;
}

function pickWeighted<T>(items: T[], weightOf: (t: T) => number, rng: () => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = rng() * total;
  return items.find((item) => (roll -= weightOf(item)) <= 0) ?? items[items.length - 1];
}

function pickTraits(count: number, rng: () => number): string[] {
  const pool = [...TREE_TRAITS];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return picked;
}

export function rollRarity(luck: number, rng: () => number): TreeRarity {
  const weights = rarityWeights(luck);
  return pickWeighted(RARITY_ORDER, (r) => weights[r], rng);
}

export function plantSapling(
  o: OutpostState,
  wallet: WalletState,
  plotIdx: number,
  rng: () => number = Math.random,
): OutpostActionResult {
  const mods = competenceModifiers(o);
  const available = availableGardenPlots(mods);
  if (plotIdx < 0 || plotIdx >= available) return { ok: false, reason: 'Parcelle non débloquée.' };
  if (o.garden.plots[plotIdx]) return { ok: false, reason: 'Parcelle déjà occupée.' };
  if (wallet.crumbs < SAPLING_COST) return { ok: false, reason: 'Pas assez de Miettes.' };

  wallet.crumbs -= SAPLING_COST;
  const rarity = rollRarity(mods.garden.rarityLuck, rng);
  const traits = pickTraits(RARITY_TRAIT_COUNT[rarity], rng);
  const tree: Tree = {
    id: o.garden.nextTreeId++,
    tier: 1,
    rarity,
    traits,
    seed: Math.floor(rng() * 2 ** 31),
    growthSeconds: 0,
    restSeconds: 0,
    harvests: 0,
  };
  o.garden.plots[plotIdx] = tree;
  o.competences.garden.xp += XP_PLANT;
  return { ok: true, events: [] };
}

export function harvestTree(
  o: OutpostState,
  wallet: WalletState,
  plotIdx: number,
  rng: () => number = Math.random,
): OutpostActionResult {
  const tree = o.garden.plots[plotIdx];
  if (!tree) return { ok: false, reason: 'Rien à récolter ici.' };
  const mods = competenceModifiers(o);
  if (!isTreeMature(tree, mods)) return { ok: false, reason: "Cet arbre n'est pas encore mûr." };
  if (tree.restSeconds > 0) return { ok: false, reason: 'Cet arbre se repose encore.' };

  let wood = treeWoodYield(tree, mods);
  if (tree.traits.includes('tronc-jumeau') && rng() < 0.2) wood *= 2;
  if (rng() < mods.garden.doubleHarvestChance) wood *= 2;
  o.resources.wood += wood;

  if (tree.traits.includes('ecorce-doree')) {
    wallet.crumbs += 10 * tree.tier;
  }

  tree.harvests += tree.traits.includes('seve-riche') ? 2 : 1;
  tree.restSeconds = effectiveRestSeconds(tree, mods);
  o.competences.garden.xp += Math.round(4 * tree.tier * RARITY_WOOD_MULT[tree.rarity]);

  const events: SimEvent[] = [];
  const threshold = HARVEST_TIER_UP_THRESHOLDS[tree.tier - 1];
  if (tree.tier < mods.garden.maxTier && threshold !== undefined && tree.harvests >= threshold) {
    tree.tier = (tree.tier + 1) as Tree['tier'];
    tree.growthSeconds = 0;
    o.competences.garden.xp += XP_TIER_UP;
    events.push({ type: 'tree-tier-up', data: { plotIdx, tier: tree.tier } });
  }

  return { ok: true, events };
}

export function stokeFire(o: OutpostState, count: number): OutpostActionResult {
  if (count <= 0) return { ok: false, reason: 'Quantité invalide.' };
  if (o.resources.wood < count) return { ok: false, reason: 'Pas assez de bois.' };
  o.resources.wood -= count;
  o.camp.fuelSeconds = Math.min(FIRE_CAP_SECONDS, o.camp.fuelSeconds + count * WOOD_SECONDS_PER_UNIT);
  return { ok: true, events: [] };
}

export function startCooking(o: OutpostState, speciesId: string, count: number): OutpostActionResult {
  const species = fishSpeciesById(speciesId);
  if (!species) return { ok: false, reason: 'Espèce inconnue.' };
  if (o.camp.cooking) return { ok: false, reason: 'Une fournée est déjà sur le feu.' };
  const mods = competenceModifiers(o);
  if (count < 1 || count > mods.camp.batchSize) return { ok: false, reason: 'Taille de fournée invalide.' };
  const have = o.resources.rawFish[speciesId] ?? 0;
  if (have < count) return { ok: false, reason: 'Pas assez de poisson.' };

  o.resources.rawFish[speciesId] = have - count;
  const cookSeconds = BASE_COOK_SECONDS * mods.camp.cookTimeMult;
  o.camp.cooking = { speciesId, count, remainingSeconds: cookSeconds, totalSeconds: cookSeconds };
  return { ok: true, events: [] };
}

export function sellCrumbFish(o: OutpostState, wallet: WalletState, count: number): OutpostActionResult {
  if (count <= 0 || o.resources.crumbFish < count) return { ok: false, reason: 'Pas assez de Poisson-miette.' };
  const mods = competenceModifiers(o);
  wallet.crumbs += CRUMB_FISH_SELL_PRICE * mods.camp.sellMult * count;
  o.resources.crumbFish -= count;
  return { ok: true, events: [] };
}

export function buyDecoration(o: OutpostState, wallet: WalletState, id: string): OutpostActionResult {
  const def = decorationById(id);
  if (!def) return { ok: false, reason: 'Décoration inconnue.' };
  if (o.camp.decorations.includes(id)) return { ok: false, reason: 'Déjà installée.' };
  const mods = competenceModifiers(o);
  const maxSlots = BASE_DECORATION_SLOTS + mods.camp.extraDecorSlots;
  if (o.camp.decorations.length >= maxSlots) return { ok: false, reason: "Plus d'emplacement de décoration." };
  if (wallet.crumbs < def.cost) return { ok: false, reason: 'Pas assez de Miettes.' };
  wallet.crumbs -= def.cost;
  o.camp.decorations.push(id);
  o.competences.camp.xp += XP_DECORATION;
  return { ok: true, events: [] };
}

export function buyCompetenceNode(o: OutpostState, game: OutpostGame, nodeId: string): OutpostActionResult {
  const def = competenceNodeById(nodeId);
  if (!def || def.game !== game) return { ok: false, reason: 'Nœud inconnu.' };
  if (o.competences[game].nodes.includes(nodeId)) return { ok: false, reason: 'Déjà acquis.' };
  const level = competenceLevel(o.competences[game].xp);
  if (level < def.minLevel) return { ok: false, reason: `Niveau ${def.minLevel} requis.` };
  const missing = (def.requires ?? []).filter((id) => !o.competences[game].nodes.includes(id));
  if (missing.length > 0) return { ok: false, reason: 'Nœud prérequis manquant.' };
  const available = competencePointsAvailable(o, game);
  if (available < def.cost) return { ok: false, reason: 'Pas assez de points de maîtrise.' };
  o.competences[game].nodes.push(nodeId);
  return { ok: true, events: [] };
}

export interface CatchOutcome {
  speciesId: string;
  tier: number;
  yieldFish: number;
  lost: boolean;
  doubled: boolean;
}

export function resolveCatch(
  mods: OutpostModifiers,
  rng: () => number = Math.random,
): CatchOutcome {
  const pool: FishSpeciesDef[] = FISH_SPECIES.filter((s) => s.tier <= mods.pool.maxFishTier);
  const weightOf = (s: FishSpeciesDef) => (s.tier >= 2 ? s.weight * (1 + mods.pool.tierLuck) : s.weight);
  const species = pickWeighted(pool, weightOf, rng);
  const lost = species.tier >= 4 && !mods.pool.noLineBreakT4Plus && rng() < LINE_BREAK_CHANCE;
  const doubled = !lost && rng() < mods.pool.doubleCatchChance;
  return { speciesId: species.id, tier: species.tier, yieldFish: lost ? 0 : doubled ? 2 : 1, lost, doubled };
}

export function castResolve(
  o: OutpostState,
  hit: boolean,
  rng: () => number = Math.random,
): { ok: true; outcome: CatchOutcome | null; events: SimEvent[] } {
  o.pool.casts += 1;
  if (!hit) {
    o.competences.pool.xp += XP_MISS;
    return { ok: true, outcome: null, events: [] };
  }
  const mods = competenceModifiers(o);
  const outcome = resolveCatch(mods, rng);
  if (outcome.lost) {
    o.competences.pool.xp += XP_MISS;
    return { ok: true, outcome, events: [] };
  }
  o.pool.catches += 1;
  o.pool.bestTier = Math.max(o.pool.bestTier, outcome.tier);
  o.resources.rawFish[outcome.speciesId] = (o.resources.rawFish[outcome.speciesId] ?? 0) + outcome.yieldFish;
  o.competences.pool.xp += XP_CATCH_PER_TIER * outcome.tier;
  return { ok: true, outcome, events: [] };
}

function stepFire(camp: CampState, step: number, mods: CampModifiers): number {
  const startFuel = camp.fuelSeconds;
  const litTime = Math.min(step, startFuel / mods.fuelBurnMult);
  camp.fuelSeconds = Math.max(0, startFuel - step * mods.fuelBurnMult);
  return litTime;
}

function stepOutpost(o: OutpostState, step: number, mods: OutpostModifiers, events: SimEvent[]): void {
  for (let i = 0; i < o.garden.plots.length; i++) {
    const tree = o.garden.plots[i];
    if (!tree) continue;
    const wasMature = isTreeMature(tree, mods);
    if (!wasMature) {
      const cap = effectiveGrowSeconds(tree, mods);
      tree.growthSeconds = Math.min(cap, tree.growthSeconds + step);
      if (tree.growthSeconds >= cap) events.push({ type: 'tree-mature', data: { plotIdx: i } });
    } else if (tree.restSeconds > 0) {
      tree.restSeconds = Math.max(0, tree.restSeconds - step);
    }
  }

  const wasLit = o.camp.fuelSeconds > 0;
  const litTime = stepFire(o.camp, step, mods.camp);
  if (wasLit && o.camp.fuelSeconds <= 0) events.push({ type: 'fire-out' });

  if (o.camp.cooking) {
    const cooking = o.camp.cooking;
    const emberTime = step - litTime;
    const progress = litTime + emberTime * mods.camp.embersCookRatio;
    cooking.remainingSeconds = Math.max(0, cooking.remainingSeconds - progress);
    if (cooking.remainingSeconds <= 0) {
      const species = fishSpeciesById(cooking.speciesId);
      if (species) {
        let output = cooking.count * species.crumbFishYield;
        if (mods.camp.bonusFishPerBatch4 > 0 && cooking.count >= 4) output += mods.camp.bonusFishPerBatch4;
        o.resources.crumbFish += output;
        o.competences.camp.xp += XP_COOK_PER_TIER_PER_FISH * species.tier * cooking.count;
        events.push({ type: 'cook-done', data: { speciesId: cooking.speciesId, count: output } });
      }
      o.camp.cooking = null;
    }
  }

  if (mods.pool.passiveT1PerHour > 0) {
    o.resources.rawFish.ablette = (o.resources.rawFish.ablette ?? 0) + (mods.pool.passiveT1PerHour / HOUR) * step;
  }
}

export function advanceOutpost(o: OutpostState, dtSeconds: number, cfg: GameConfig): SimEvent[] {
  const events: SimEvent[] = [];
  const mods = competenceModifiers(o);
  let remaining = dtSeconds * cfg.simSpeed * cfg.baseTimeScale;
  while (remaining > 0) {
    const step = Math.min(remaining, 60);
    remaining -= step;
    stepOutpost(o, step, mods, events);
  }
  return events;
}
