// Actions déclenchées par le joueur. Pures : elles mutent des clones fournis
// par le store et renvoient un résultat explicite (jamais d'exception pour un
// refus de gameplay — l'UI affiche la raison).

import type { GameConfig } from './config';
import { childCost, cosmeticById, foodById, skillById } from './config';
import { generateGenome } from './genome';
import {
  applyFoodEffects,
  crumbCap,
  effectiveFoodCost,
  hatch,
  maxLevelOf,
  skillModifiers,
  upgradeCost,
} from './sim';
import type {
  CapacityGauge,
  CompanionState,
  FoodDef,
  SimEvent,
  WalletState,
} from './types';

export type ActionResult =
  | { ok: true; events: SimEvent[] }
  | { ok: false; reason: string };

export function createCompanion(
  name: string,
  rng: () => number = Math.random,
): CompanionState {
  return {
    name: name.trim() || 'Toki',
    genome: generateGenome(rng),
    tokensEaten: 0,
    stage: 'egg',
    xp: 0,
    satiety: 80,
    vitality: 100,
    mood: 70,
    eggTaps: 0,
    activeSeconds: 0,
    zeroVitalitySeconds: 0,
    sick: false,
    dead: false,
    skills: [],
    pendingCrumbs: 0,
    foodHeat: {},
    cosmetics: { owned: [], equipped: [] },
    children: [],
    containerLevel: 0,
    activeEvent: null,
    nextEventAtActive: 15 * 60 + rng() * 15 * 60, // premier événement entre 15 et 30 min
    lastPlayAtActive: -Infinity,
  };
}

export function tapEgg(c: CompanionState, cfg: GameConfig): ActionResult {
  if (c.stage !== 'egg') return { ok: false, reason: "Ce n'est plus un œuf." };
  c.eggTaps += 1;
  const events: SimEvent[] = [];
  if (c.eggTaps >= cfg.eggTapsToHatch) hatch(c, events);
  return { ok: true, events };
}

/**
 * Nourrir : vérifie l'état et le paiement, applique les effets.
 * Le paiement TOKEN passe par la jauge de capacité (GDD §5.3) ; les Miettes
 * par le portefeuille. La réaction (GDD §6.6) est déclenchée par le store
 * après coup — elle est du domaine de l'AIProvider, pas de l'économie.
 */
export function feed(
  c: CompanionState,
  wallet: WalletState,
  capacity: CapacityGauge,
  food: FoodDef,
  cfg: GameConfig,
): ActionResult {
  if (c.stage === 'egg') return { ok: false, reason: 'Un œuf ne mange pas.' };
  if (c.dead) return { ok: false, reason: 'Il est trop tard…' };

  const cost = effectiveFoodCost(food, skillModifiers(c, cfg), c.foodHeat[food.id] ?? 0);
  if (food.currency === 'crumbs') {
    if (wallet.crumbs < cost) {
      return { ok: false, reason: 'Pas assez de Miettes.' };
    }
    wallet.crumbs -= cost;
  } else {
    if (!capacity.unlimited && capacity.budget - capacity.used < cost) {
      return { ok: false, reason: 'Capacité TOKEN épuisée pour cette période.' };
    }
    capacity.used += cost;
    // Les TOKEN mangés font grossir le Compagnon (croissance sans plafond).
    c.tokensEaten += cost;
  }

  // Anti-spam : l'achat chauffe le prix de CET aliment (redescend avec le temps).
  c.foodHeat[food.id] = (c.foodHeat[food.id] ?? 0) + 1;

  applyFoodEffects(c, cfg, food.id);
  c.xp += cfg.xpPerFeed;
  return { ok: true, events: [] };
}

export function play(c: CompanionState, cfg: GameConfig): ActionResult {
  if (c.stage === 'egg') return { ok: false, reason: "L'œuf préfère être tapoté." };
  if (c.dead) return { ok: false, reason: 'Il est trop tard…' };
  const mods = skillModifiers(c, cfg);
  const cooldown = cfg.playCooldownSeconds * mods.playCooldown;
  const elapsed = c.activeSeconds - c.lastPlayAtActive;
  if (elapsed < cooldown) {
    const wait = Math.ceil((cooldown - elapsed) / 60);
    return { ok: false, reason: `Il est fatigué — réessaie dans ${wait} min.` };
  }
  c.lastPlayAtActive = c.activeSeconds;
  c.mood = Math.min(100, c.mood + cfg.playMoodGain + mods.playMoodBonus);
  c.xp += cfg.xpPerPlay;
  return { ok: true, events: [] };
}

/** Ramasser les Miettes produites (le pot) vers le portefeuille. */
export function collectCrumbs(c: CompanionState, wallet: WalletState): ActionResult {
  if (c.pendingCrumbs <= 0) return { ok: false, reason: 'Rien à ramasser.' };
  wallet.crumbs += c.pendingCrumbs;
  c.pendingCrumbs = 0;
  return { ok: true, events: [] };
}

export function startLearning(
  c: CompanionState,
  wallet: WalletState,
  capacity: CapacityGauge,
  skillId: string,
  cfg: GameConfig,
): ActionResult {
  if (c.dead) return { ok: false, reason: 'Il est trop tard…' };
  const def = skillById(cfg, skillId);
  if (!def) return { ok: false, reason: 'Compétence inconnue.' };
  if (c.skills.some((sp) => sp.skillId === skillId)) {
    return { ok: false, reason: 'Déjà apprise ou en cours.' };
  }
  const stageIndex = cfg.stageOrder.indexOf(c.stage);
  if (stageIndex < cfg.stageOrder.indexOf(def.minStage)) {
    return { ok: false, reason: `Disponible au stade ${cfg.stages[def.minStage].label}.` };
  }
  const missing = (def.requires ?? []).filter(
    (id) => !c.skills.some((sp) => sp.skillId === id && sp.state === 'owned'),
  );
  if (missing.length > 0) {
    const labels = missing.map((id) => skillById(cfg, id)?.label ?? id).join(', ');
    return { ok: false, reason: `Nécessite d'abord : ${labels}.` };
  }
  if (c.skills.length >= cfg.stages[c.stage].skillSlots) {
    return { ok: false, reason: 'Plus de slot de compétence à ce stade.' };
  }
  const busy = studyBusyReason(c, cfg);
  if (busy) return { ok: false, reason: busy };

  if (def.costCurrency === 'crumbs') {
    if (wallet.crumbs < def.cost) return { ok: false, reason: 'Pas assez de Miettes.' };
    wallet.crumbs -= def.cost;
  } else {
    if (!capacity.unlimited && capacity.budget - capacity.used < def.cost) {
      return { ok: false, reason: 'Capacité TOKEN épuisée pour cette période.' };
    }
    capacity.used += def.cost;
  }

  c.skills.push({ skillId, state: 'learning', trainedSeconds: 0, level: 0, upgrading: false });
  return { ok: true, events: [] };
}

/** Études simultanées : une de base + une par petit (ils aident aux devoirs). */
export function maxStudies(c: CompanionState, cfg: GameConfig): number {
  return cfg.baseStudySlots + c.children.length;
}

export function studyingCount(c: CompanionState): number {
  return c.skills.filter((sp) => sp.state === 'learning' || sp.upgrading).length;
}

function studyBusyReason(c: CompanionState, cfg: GameConfig): string | null {
  const max = maxStudies(c, cfg);
  if (studyingCount(c) < max) return null;
  return max === 1
    ? 'Il étudie déjà quelque chose (adopte des petits pour étudier en parallèle).'
    : `Toutes les études sont occupées (${max} en parallèle avec la famille).`;
}

/** Améliorer une compétence acquise : payer le niveau suivant puis ré-étudier. */
export function startUpgrade(
  c: CompanionState,
  wallet: WalletState,
  capacity: CapacityGauge,
  skillId: string,
  cfg: GameConfig,
): ActionResult {
  if (c.dead) return { ok: false, reason: 'Il est trop tard…' };
  const def = skillById(cfg, skillId);
  if (!def) return { ok: false, reason: 'Compétence inconnue.' };
  const sp = c.skills.find((p) => p.skillId === skillId);
  if (!sp || sp.state !== 'owned') return { ok: false, reason: 'Pas encore acquise.' };
  if (sp.level >= maxLevelOf(cfg, skillId)) {
    return { ok: false, reason: 'Déjà au niveau maximum.' };
  }
  const busy = studyBusyReason(c, cfg);
  if (busy) return { ok: false, reason: busy };

  const cost = upgradeCost(cfg, def.cost, sp.level + 1);
  if (def.costCurrency === 'crumbs') {
    if (wallet.crumbs < cost) return { ok: false, reason: 'Pas assez de Miettes.' };
    wallet.crumbs -= cost;
  } else {
    if (!capacity.unlimited && capacity.budget - capacity.used < cost) {
      return { ok: false, reason: 'Capacité TOKEN épuisée pour cette période.' };
    }
    capacity.used += cost;
  }

  sp.upgrading = true;
  sp.trainedSeconds = 0;
  return { ok: true, events: [] };
}

// ————— Boutique (GDD §6.3) —————

function pay(
  wallet: WalletState,
  capacity: CapacityGauge,
  currency: 'crumbs' | 'token',
  cost: number,
): ActionResult | null {
  if (currency === 'crumbs') {
    if (wallet.crumbs < cost) return { ok: false, reason: 'Pas assez de Miettes.' };
    wallet.crumbs -= cost;
  } else {
    if (!capacity.unlimited && capacity.budget - capacity.used < cost) {
      return { ok: false, reason: 'Capacité TOKEN épuisée pour cette période.' };
    }
    capacity.used += cost;
  }
  return null;
}

export function buyCosmetic(
  c: CompanionState,
  wallet: WalletState,
  capacity: CapacityGauge,
  cosmeticId: string,
  cfg: GameConfig,
): ActionResult {
  if (c.dead) return { ok: false, reason: 'Il est trop tard…' };
  const def = cosmeticById(cfg, cosmeticId);
  if (!def) return { ok: false, reason: 'Article inconnu.' };
  if (c.cosmetics.owned.includes(cosmeticId)) {
    return { ok: false, reason: 'Déjà dans sa garde-robe.' };
  }
  const refused = pay(wallet, capacity, def.currency, def.cost);
  if (refused) return refused;
  c.cosmetics.owned.push(cosmeticId);
  equipCosmetic(c, cosmeticId, cfg); // on le porte tout de suite, c'est plus drôle
  return { ok: true, events: [] };
}

/** Équipe (en remplaçant l'article du même emplacement) ou retire s'il est porté. */
export function equipCosmetic(
  c: CompanionState,
  cosmeticId: string,
  cfg: GameConfig,
): ActionResult {
  const def = cosmeticById(cfg, cosmeticId);
  if (!def) return { ok: false, reason: 'Article inconnu.' };
  if (!c.cosmetics.owned.includes(cosmeticId)) {
    return { ok: false, reason: 'Pas encore acheté.' };
  }
  if (c.cosmetics.equipped.includes(cosmeticId)) {
    c.cosmetics.equipped = c.cosmetics.equipped.filter((id) => id !== cosmeticId);
    return { ok: true, events: [] };
  }
  c.cosmetics.equipped = c.cosmetics.equipped.filter(
    (id) => cosmeticById(cfg, id)?.slot !== def.slot,
  );
  c.cosmetics.equipped.push(cosmeticId);
  return { ok: true, events: [] };
}

/** Adopter un petit : prix doublé à chaque adoption, génome aléatoire. */
export function buyChild(
  c: CompanionState,
  wallet: WalletState,
  capacity: CapacityGauge,
  cfg: GameConfig,
  rng: () => number = Math.random,
): ActionResult {
  if (c.dead) return { ok: false, reason: 'Il est trop tard…' };
  if (c.stage === 'egg' || c.stage === 'blob' || c.stage === 'kid') {
    return { ok: false, reason: 'Trop jeune pour adopter — attends le stade Ado.' };
  }
  if (c.children.length >= cfg.maxChildren) {
    return { ok: false, reason: 'La maison est pleine !' };
  }
  const refused = pay(wallet, capacity, 'crumbs', childCost(cfg, c.children.length));
  if (refused) return refused;
  c.children.push(generateGenome(rng));
  return { ok: true, events: [] };
}

/** Améliorer le contenant à Miettes : Bocal → Poubelle → Piscine → Coffre… */
export function upgradeContainer(
  c: CompanionState,
  wallet: WalletState,
  cfg: GameConfig,
): ActionResult {
  if (c.dead) return { ok: false, reason: 'Il est trop tard…' };
  const next = cfg.containers[c.containerLevel + 1];
  if (!next) return { ok: false, reason: 'Contenant déjà ultime !' };
  if (wallet.crumbs < next.cost) return { ok: false, reason: 'Pas assez de Miettes.' };
  wallet.crumbs -= next.cost;
  c.containerLevel += 1;
  return { ok: true, events: [] };
}

/** Le pot de Miettes est-il plein ? (pour l'UI et le rapport de retour) */
export function crumbJarFull(c: CompanionState, cfg: GameConfig): boolean {
  const cap = crumbCap(c, cfg);
  return cap > 0 && c.pendingCrumbs >= cap;
}

export function foodAffordable(
  c: CompanionState,
  food: FoodDef,
  wallet: WalletState,
  capacity: CapacityGauge,
  cfg: GameConfig,
): boolean {
  const cost = effectiveFoodCost(food, skillModifiers(c, cfg), c.foodHeat[food.id] ?? 0);
  return food.currency === 'crumbs'
    ? wallet.crumbs >= cost
    : capacity.unlimited || capacity.budget - capacity.used >= cost;
}

export { foodById };
