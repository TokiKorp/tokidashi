// Cœur de simulation — pur et déterministe : advanceSim(état, dt) → événements.
// Ne tourne QUE sur du temps actif (session déverrouillée, app en vie) ; le gel
// au verrouillage (GDD §6.1) est garanti par l'appelant qui n'envoie pas de dt.
//
// Ordre de dégradation (GDD §4.1) : Faim → Humeur → Vitalité → Maladie → Mort.
// Chaque palier laisse une fenêtre d'action et émet un événement lisible.

import type { GameConfig } from './config';
import { foodById, nextStage, skillById } from './config';
import type {
  CompanionState,
  FoodDef,
  SimEvent,
  VisibleState,
  WalletState,
} from './types';

const HOUR = 3600;

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

/** Effets cumulés des compétences acquises (Efficacité, Conversion, Sociale). */
export interface SkillModifiers {
  metabolism: number;
  foodCost: number;
  tokenSatiety: number;
  playCooldown: number;
  playMoodBonus: number;
}

/** Amplification d'effet selon le niveau : 1 / 1,5 / 2 / 2,5… (+50 %/niveau). */
export function levelScale(cfg: GameConfig, level: number): number {
  return 1 + cfg.skillLevelEffectStep * (Math.max(1, level) - 1);
}

/** Coût de l'amélioration vers `targetLevel` (le niveau 1 = coût de base). */
export function upgradeCost(cfg: GameConfig, baseCost: number, targetLevel: number): number {
  return Math.ceil(baseCost * Math.pow(cfg.skillUpgradeCostGrowth, targetLevel - 1));
}

export function maxLevelOf(cfg: GameConfig, skillId: string): number {
  return skillById(cfg, skillId)?.maxLevel ?? cfg.defaultMaxSkillLevel;
}

/** Une réduction (mult < 1) amplifiée par niveau, bornée à −80 %. */
function scaledReduction(mult: number, k: number): number {
  return 1 - Math.min(0.8, (1 - mult) * k);
}

export function skillModifiers(c: CompanionState, cfg: GameConfig): SkillModifiers {
  const m: SkillModifiers = {
    metabolism: 1,
    foodCost: 1,
    tokenSatiety: 1,
    playCooldown: 1,
    playMoodBonus: 0,
  };
  for (const sp of c.skills) {
    if (sp.state !== 'owned') continue;
    const def = skillById(cfg, sp.skillId);
    if (!def) continue;
    const k = levelScale(cfg, sp.level);
    if (def.metabolismMultiplier) m.metabolism *= scaledReduction(def.metabolismMultiplier, k);
    if (def.foodCostMultiplier) m.foodCost *= scaledReduction(def.foodCostMultiplier, k);
    if (def.tokenSatietyMultiplier) m.tokenSatiety *= 1 + (def.tokenSatietyMultiplier - 1) * k;
    if (def.playCooldownMultiplier) m.playCooldown *= scaledReduction(def.playCooldownMultiplier, k);
    if (def.playMoodBonus) m.playMoodBonus += def.playMoodBonus * k;
  }
  return m;
}

/** Demi-vie de la chauffe des prix, en secondes actives. */
export const FOOD_HEAT_HALF_LIFE = 300;
/** Majoration de prix par point de chauffe (+60 % par achat récent). */
export const FOOD_HEAT_SURGE = 0.6;

/**
 * Coût effectif d'un aliment : remises de compétences × chauffe anti-spam.
 * Spammer un aliment fait grimper son prix ; il redescend avec le temps actif.
 */
export function effectiveFoodCost(
  food: FoodDef,
  mods: SkillModifiers,
  heat = 0,
): number {
  const base = food.currency === 'crumbs' ? food.cost * mods.foodCost : food.cost;
  return Math.ceil(base * (1 + FOOD_HEAT_SURGE * heat));
}

/**
 * Avance la simulation de `dtSeconds` de temps actif. Mute `c` et `wallet`
 * (l'appelant clone avant). Le dt est découpé en pas de 60 s max pour que les
 * franchissements de seuils restent précis même après un long passage en fond.
 */
export function advanceSim(
  c: CompanionState,
  wallet: WalletState,
  dtSeconds: number,
  cfg: GameConfig,
): SimEvent[] {
  const events: SimEvent[] = [];
  let remaining = dtSeconds * cfg.simSpeed;
  while (remaining > 0 && !c.dead) {
    const step = Math.min(remaining, 60);
    remaining -= step;
    stepSim(c, wallet, step, cfg, events);
  }
  return events;
}

function stepSim(
  c: CompanionState,
  wallet: WalletState,
  s: number,
  cfg: GameConfig,
  events: SimEvent[],
): void {
  c.activeSeconds += s;

  // — Œuf : métabolisme nul, seule l'éclosion par temps s'applique.
  if (c.stage === 'egg') {
    if (c.activeSeconds >= cfg.eggHatchSeconds) hatch(c, events);
    return;
  }

  const stage = cfg.stages[c.stage];
  const mods = skillModifiers(c, cfg);
  const wasHungry = c.satiety < cfg.hungryThreshold;

  // 1. Faim — le métabolisme draine la Satiété (réductible par Efficacité).
  c.satiety = clamp(c.satiety - ((stage.metabolismPerHour * mods.metabolism) / HOUR) * s);
  if (!wasHungry && c.satiety < cfg.hungryThreshold) {
    events.push({ type: 'got-hungry' });
  }

  // 2. Humeur — ennui de fond, aggravé par la faim.
  let moodLoss = cfg.moodDecayPerHour;
  if (c.satiety < cfg.hungryThreshold) moodLoss += cfg.hungryMoodPenaltyPerHour;
  c.mood = clamp(c.mood - (moodLoss / HOUR) * s);

  // 3. Vitalité — ne baisse que Satiété à zéro ; régénère si bien nourri.
  if (c.satiety <= 0) {
    c.vitality = clamp(c.vitality - (cfg.vitalityLossPerHour / HOUR) * s);
  } else if (c.satiety >= cfg.vitalityRegenSatietyThreshold) {
    c.vitality = clamp(c.vitality + (cfg.vitalityRegenPerHour / HOUR) * s);
  }

  // 4. Maladie — état visible et réversible avant la mort.
  if (!c.sick && c.vitality < cfg.sickThreshold) {
    c.sick = true;
    events.push({ type: 'got-sick' });
  } else if (c.sick && c.vitality >= cfg.recoverThreshold) {
    c.sick = false;
    events.push({ type: 'recovered' });
  }

  // 5. Mort — seulement après un temps prolongé à Vitalité 0 (permadeath, GDD §8.3).
  if (c.vitality <= 0) {
    c.zeroVitalitySeconds += s;
    if (c.zeroVitalitySeconds >= cfg.deathAfterZeroVitalitySeconds) {
      c.dead = true;
      events.push({ type: 'died' });
      return;
    }
  } else {
    c.zeroVitalitySeconds = 0;
  }

  // — Chauffe des prix : décroissance exponentielle sur le temps actif.
  for (const [foodId, heat] of Object.entries(c.foodHeat)) {
    const next = heat * Math.pow(0.5, s / FOOD_HEAT_HALF_LIFE);
    if (next < 0.02) delete c.foodHeat[foodId];
    else c.foodHeat[foodId] = next;
  }

  // — Apprentissage / amélioration : une seule étude à la fois, en temps actif.
  //   Pendant une amélioration, l'effet du niveau courant reste actif.
  for (const sp of c.skills) {
    if (sp.state !== 'learning' && !sp.upgrading) continue;
    const def = skillById(cfg, sp.skillId);
    if (!def) continue;
    sp.trainedSeconds += s;
    if (sp.trainedSeconds >= def.trainSeconds) {
      sp.trainedSeconds = 0;
      if (sp.state === 'learning') {
        sp.state = 'owned';
        sp.level = 1;
        events.push({ type: 'skill-learned', data: { skillId: sp.skillId } });
      } else {
        sp.upgrading = false;
        sp.level += 1;
        events.push({ type: 'skill-upgraded', data: { skillId: sp.skillId, level: sp.level } });
      }
    }
  }

  // — Production : les compétences acquises génèrent des Miettes, modulées par
  //   l'Humeur et le niveau, dans un stock plafonné (GDD §7).
  const cap = crumbCap(c, cfg);
  for (const sp of c.skills) {
    if (sp.state !== 'owned') continue;
    const def = skillById(cfg, sp.skillId);
    if (!def?.crumbsPerHour) continue;
    const rate = def.crumbsPerHour * levelScale(cfg, sp.level) * cfg.moodMultiplier(c.mood);
    const before = c.pendingCrumbs;
    c.pendingCrumbs = Math.min(cap, c.pendingCrumbs + (rate / HOUR) * s);
    if (before < cap && c.pendingCrumbs >= cap) {
      events.push({ type: 'crumb-cap-reached' });
    }
  }

  // — Auto-nourrissage (compétence Automatisation) : il se sert dans ses
  //   propres Miettes, y compris celles non ramassées — il vit sa vie.
  if (c.satiety < cfg.autoFeedThreshold && ownsSkill(c, cfg, 'automation')) {
    autoFeed(c, wallet, cfg, events);
  }

  // — XP passive + évolution par seuil (GDD §4.3).
  c.xp += (cfg.xpPerActiveHour / HOUR) * s;
  const threshold = cfg.stages[c.stage].xpToNext;
  if (threshold !== null && c.xp >= threshold) {
    const next = nextStage(cfg, c.stage);
    if (next) {
      c.stage = next;
      events.push({ type: 'evolved', data: { stage: next } });
    }
  }
}

export function hatch(c: CompanionState, events: SimEvent[]): void {
  if (c.stage !== 'egg') return;
  c.stage = 'blob';
  events.push({ type: 'hatched' });
}

function ownsSkill(
  c: CompanionState,
  cfg: GameConfig,
  category: 'production' | 'automation',
): boolean {
  return c.skills.some(
    (sp) => sp.state === 'owned' && skillById(cfg, sp.skillId)?.category === category,
  );
}

function productionPerHour(c: CompanionState, cfg: GameConfig): number {
  let perHour = 0;
  for (const sp of c.skills) {
    if (sp.state !== 'owned') continue;
    const base = skillById(cfg, sp.skillId)?.crumbsPerHour ?? 0;
    perHour += base * levelScale(cfg, sp.level);
  }
  return perHour;
}

export function crumbCap(c: CompanionState, cfg: GameConfig): number {
  return productionPerHour(c, cfg) * cfg.crumbCapHours;
}

/** Débit de production effectif (Miettes/h), Humeur comprise — pour l'UI. */
export function crumbRatePerHour(c: CompanionState, cfg: GameConfig): number {
  return productionPerHour(c, cfg) * cfg.moodMultiplier(c.mood);
}

function autoFeed(
  c: CompanionState,
  wallet: WalletState,
  cfg: GameConfig,
  events: SimEvent[],
): void {
  // Payé en Miettes uniquement — l'auto-nourrissage ne touche JAMAIS aux TOKEN
  // du joueur (GDD §12 : la voie gratuite doit suffire à le garder en vie).
  // Il choisit le meilleur rapport prix effectif / satiété : la chauffe des
  // prix le fait naturellement alterner entre les aliments.
  const mods = skillModifiers(c, cfg);
  const candidates = cfg.foods
    .filter((f) => f.currency === 'crumbs')
    .sort(
      (a, b) =>
        effectiveFoodCost(a, mods, c.foodHeat[a.id] ?? 0) / a.satiety -
        effectiveFoodCost(b, mods, c.foodHeat[b.id] ?? 0) / b.satiety,
    );
  for (const food of candidates) {
    const cost = effectiveFoodCost(food, mods, c.foodHeat[food.id] ?? 0);
    // Il ramasse d'abord son stock en attente si le portefeuille ne suffit pas.
    if (wallet.crumbs < cost && c.pendingCrumbs > 0) {
      wallet.crumbs += c.pendingCrumbs;
      c.pendingCrumbs = 0;
    }
    if (wallet.crumbs >= cost) {
      wallet.crumbs -= cost;
      c.foodHeat[food.id] = (c.foodHeat[food.id] ?? 0) + 1;
      applyFoodEffects(c, cfg, food.id);
      events.push({ type: 'auto-fed', data: { foodId: food.id } });
      return;
    }
  }
}

export function applyFoodEffects(
  c: CompanionState,
  cfg: GameConfig,
  foodId: string,
): void {
  const food = foodById(cfg, foodId);
  if (!food) return;
  // Conversion : les repas TOKEN peuvent nourrir plus (Papilles dorées).
  const mods = skillModifiers(c, cfg);
  const satiety =
    food.currency === 'token' ? food.satiety * mods.tokenSatiety : food.satiety;
  c.satiety = clamp(c.satiety + satiety);
  if (food.mood) c.mood = clamp(c.mood + food.mood);
  if (food.vitality) c.vitality = clamp(c.vitality + food.vitality);
}

/** L'état lisible à l'œil nu (GDD §4.2) — priorité du plus grave au plus doux. */
export function visibleState(c: CompanionState, cfg: GameConfig): VisibleState {
  if (c.stage === 'egg') return 'egg';
  if (c.dead) return 'dead';
  if (c.sick) return 'sick';
  if (c.satiety < cfg.hungryThreshold) return 'hungry';
  if (c.mood < cfg.grumpyThreshold) return 'grumpy';
  if (c.skills.some((sp) => sp.state === 'learning' || sp.upgrading)) return 'working';
  if (c.mood > cfg.happyThreshold) return 'happy';
  return 'neutral';
}
