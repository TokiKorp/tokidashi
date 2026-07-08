// Cœur de simulation — pur et déterministe : advanceSim(état, dt) → événements.
// Ne tourne QUE sur du temps actif (session déverrouillée, app en vie) ; le gel
// au verrouillage (GDD §6.1) est garanti par l'appelant qui n'envoie pas de dt.
//
// Ordre de dégradation (GDD §4.1) : Faim → Humeur → Vitalité → Maladie → Mort.
// Chaque palier laisse une fenêtre d'action et émet un événement lisible.

import type { GameConfig } from './config';
import { foodById, nextStage, skillById, eventById } from './config';
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

/** Effets cumulés des compétences acquises, toutes branches confondues. */
export interface SkillModifiers {
  metabolism: number;
  foodCost: number;
  tokenSatiety: number;
  playCooldown: number;
  playMoodBonus: number;
  xp: number;
  theftLoss: number;
  autoDefend: number;
  eventWindow: number;
  autoCollect: boolean;
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
    xp: 1,
    theftLoss: 1,
    autoDefend: 0,
    eventWindow: 1,
    autoCollect: false,
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
    if (def.xpMultiplier) m.xp *= 1 + (def.xpMultiplier - 1) * k;
    if (def.theftLossMultiplier) m.theftLoss *= scaledReduction(def.theftLossMultiplier, k);
    if (def.autoDefendChance) m.autoDefend += def.autoDefendChance * k;
    if (def.eventWindowMultiplier) m.eventWindow *= 1 + (def.eventWindowMultiplier - 1) * k;
    if (def.autoCollect) m.autoCollect = true;
  }
  // Planchers : 100 compétences cumulables → on borne les produits de réductions.
  m.metabolism = Math.max(0.2, m.metabolism);
  m.foodCost = Math.max(0.25, m.foodCost);
  m.playCooldown = Math.max(0.15, m.playCooldown);
  m.theftLoss = Math.max(0.1, m.theftLoss);
  m.autoDefend = Math.min(0.9, m.autoDefend);
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
  //    Chaque petit adopté creuse l'appétit du foyer : il faut plus les nourrir.
  const householdMetabolism =
    (stage.metabolismPerHour + c.children.length * cfg.childMetabolismPerHour) *
    mods.metabolism;
  c.satiety = clamp(c.satiety - (householdMetabolism / HOUR) * s);
  if (!wasHungry && c.satiety < cfg.hungryThreshold) {
    events.push({ type: 'got-hungry' });
  }

  // 2. Humeur — ennui de fond, aggravé par la faim.
  let moodLoss = cfg.moodDecayPerHour;
  if (c.satiety < cfg.hungryThreshold) moodLoss += cfg.hungryMoodPenaltyPerHour;
  c.mood = clamp(c.mood - (moodLoss / HOUR) * s);

  // 3. Vitalité — ne baisse que Satiété à zéro ; régénère si bien nourri.
  if (c.stage === 'grandpa') {
    const isImmortal = ownsSkillId(c, 'immortal');
    if (isImmortal) {
      c.vitality = 100;
    } else {
      if (c.grandpaEnteredAt === undefined) {
        c.grandpaEnteredAt = c.activeSeconds;
      }
      const grandpaAge = c.activeSeconds - c.grandpaEnteredAt;
      const ageInHours = grandpaAge / 3600;
      const decayRate = 10 + ageInHours * 1.5; // Dégrade de plus en plus vite
      
      const nurseLevel = c.skills.find((sp) => sp.skillId === 'nurse' && sp.state === 'owned')?.level ?? 0;
      const nurseHeal = nurseLevel * 8; // Soin passif
      
      const netRate = nurseHeal - decayRate;
      c.vitality = clamp(c.vitality + (netRate / HOUR) * s);
    }
  } else {
    if (c.satiety <= 0) {
      c.vitality = clamp(c.vitality - (cfg.vitalityLossPerHour / HOUR) * s);
    } else if (c.satiety >= cfg.vitalityRegenSatietyThreshold) {
      c.vitality = clamp(c.vitality + (cfg.vitalityRegenPerHour / HOUR) * s);
    }
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
    
    // Sagesse des ancêtres (prestige) : vitesse +25%
    const fastStudy = wallet.prestigeSkills?.includes('fast-study') ? 1.25 : 1.0;
    sp.trainedSeconds += s * fastStudy;
    
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

  // — Production : compétences (niveaux compris) + petits, modulée par
  //   l'Humeur, dans un stock plafonné (GDD §7). Même source de vérité que
  //   le débit affiché et le plafond (productionPerHour).
  const cap = crumbCap(c, cfg);
  const rate = productionPerHour(c, cfg) * cfg.moodMultiplier(c.mood);
  if (rate > 0) {
    const before = c.pendingCrumbs;
    c.pendingCrumbs = Math.min(cap, c.pendingCrumbs + (rate / HOUR) * s);
    c.totalCrumbsGenerated = (c.totalCrumbsGenerated || 0) + (c.pendingCrumbs - before);
    if (before < cap && c.pendingCrumbs >= cap) {
      events.push({ type: 'crumb-cap-reached' });
    }
  }

  // PEA passive interest (5% yield per active hour)
  if (wallet.pea && wallet.pea > 0) {
    const yieldRate = 0.05; // 5% per hour
    const earned = (wallet.pea * yieldRate / HOUR) * s;
    wallet.crumbs += earned;
    c.totalCrumbsGenerated = (c.totalCrumbsGenerated || 0) + earned;
  }

  // Graveyard passive crumb generation
  if (wallet.prestigeSkills?.includes('graveyard') && wallet.memorial && wallet.memorial.length > 0) {
    const graveyardRate = wallet.memorial.reduce(
      (sum, m) => sum + Math.max(5, Math.floor(m.activeSeconds / 3600) * 0.5),
      0
    );
    const earned = (graveyardRate / HOUR) * s;
    wallet.crumbs += earned;
    c.totalCrumbsGenerated = (c.totalCrumbsGenerated || 0) + earned;
  }

  // — Les petits grignotent les Miettes : le pot d'abord, puis le portefeuille.
  if (c.children.length > 0) {
    let bite = (c.children.length * cfg.childCrumbEatPerHour * s) / HOUR;
    const fromPot = Math.min(bite, c.pendingCrumbs);
    c.pendingCrumbs -= fromPot;
    bite -= fromPot;
    if (bite > 0) wallet.crumbs = Math.max(0, wallet.crumbs - bite);
  }

  // — Auto-ramassage (Majordome) : vide le pot quand il déborde.
  if (mods.autoCollect && cap > 0 && c.pendingCrumbs >= cap * 0.9) {
    wallet.crumbs += c.pendingCrumbs;
    c.pendingCrumbs = 0;
    events.push({ type: 'auto-collected' });
  }

  // — Auto-nourrissage (Garde-manger) : il se sert dans ses propres Miettes,
  //   y compris celles non ramassées — il vit sa vie.
  if (c.satiety < cfg.autoFeedThreshold && ownsSkillId(c, 'auto-feeder')) {
    autoFeed(c, wallet, cfg, events);
  }

  // — Événements aléatoires : menaces à chasser d'un clic, aubaines gratuites.
  stepEvents(c, wallet, cfg, events, mods);

  // — XP passive (boostée par la branche Sociale) + évolution par seuil.
  c.xp += (cfg.xpPerActiveHour / HOUR) * s * mods.xp;
  const threshold = cfg.stages[c.stage].xpToNext;
  if (threshold !== null && c.xp >= threshold) {
    const next = nextStage(cfg, c.stage);
    if (next) {
      c.stage = next;
      events.push({ type: 'evolved', data: { stage: next } });
    }
  }
}

// ————— Événements aléatoires (GDD §8.2) —————

function rng(cfg: GameConfig): number {
  return (cfg.rng ?? Math.random)();
}

export function scheduleNextEvent(c: CompanionState, cfg: GameConfig): void {
  const span = cfg.eventMaxIntervalSeconds - cfg.eventMinIntervalSeconds;
  const base = cfg.eventMinIntervalSeconds + rng(cfg) * span;
  // L'appât du butin : un pot qui déborde attire les pillards bien plus vite.
  const lure = 1 + c.pendingCrumbs / cfg.crumbLureDivisor;
  // Facteur d'âge : plus il est vieux, plus l'intervalle est court (les ennemis attaquent plus souvent)
  const ageFactor = 1 + c.activeSeconds / 80000;
  c.nextEventAtActive =
    c.activeSeconds + Math.max(cfg.eventIntervalFloorSeconds, base / (lure * ageFactor));
}

function stepEvents(
  c: CompanionState,
  wallet: WalletState,
  cfg: GameConfig,
  events: SimEvent[],
  mods: SkillModifiers,
): void {
  if (c.activeEvent) {
    const activeDef = eventById(cfg, c.activeEvent.eventId);
    if (cfg.disableEnemies && activeDef?.kind === 'threat') {
      c.activeEvent = null;
      scheduleNextEvent(c, cfg);
      return;
    }
    if (c.activeSeconds >= c.activeEvent.expiresAtActive) {
      applyThreatLoss(c, wallet, cfg, c.activeEvent.eventId, events, mods);
      c.activeEvent = null;
      scheduleNextEvent(c, cfg);
    }
    return;
  }
  
  if (cfg.disableEnemies) return;
  if (c.activeSeconds < c.nextEventAtActive) return;

  // Tirage pondéré. L'OVNI ne rôde que s'il y a des petits à enlever, et le
  // corbeau est d'autant plus attiré que le pot déborde.
  const pool = cfg.events.filter((e) => {
    if (cfg.disableEnemies && e.kind === 'threat') return false;
    return !e.requiresChildren || c.children.length > 0;
  });
  if (pool.length === 0) {
    scheduleNextEvent(c, cfg);
    return;
  }
  const weightOf = (e: (typeof pool)[number]): number =>
    e.id === 'crumb-thief' ? e.weight * (1 + c.pendingCrumbs / 200) : e.weight;
  const total = pool.reduce((sum, e) => sum + weightOf(e), 0);
  let roll = rng(cfg) * total;
  const def = pool.find((e) => (roll -= weightOf(e)) <= 0) ?? pool[0];

  if (def.kind === 'boon') {
    applyBoon(c, cfg, def.id, events);
    scheduleNextEvent(c, cfg);
    return;
  }

  // Menace : la Défense peut la repousser toute seule.
  if (rng(cfg) < mods.autoDefend) {
    events.push({ type: 'event-defended', data: { eventId: def.id, auto: true } });
    scheduleNextEvent(c, cfg);
    return;
  }
  const window = cfg.eventWindowSeconds * mods.eventWindow;
  c.activeEvent = {
    eventId: def.id,
    startedAtActive: c.activeSeconds,
    expiresAtActive: c.activeSeconds + window,
  };
  events.push({ type: 'event-started', data: { eventId: def.id } });
}

function applyBoon(
  c: CompanionState,
  cfg: GameConfig,
  eventId: string,
  events: SimEvent[],
): void {
  if (eventId === 'crumb-rain') {
    const cap = crumbCap(c, cfg);
    const gain = Math.round(20 + rng(cfg) * 60);
    c.pendingCrumbs = cap > 0 ? Math.min(cap, c.pendingCrumbs + gain) : c.pendingCrumbs + gain;
    events.push({ type: 'event-boon', data: { eventId, gain } });
  } else {
    // butterfly (et défaut) : un ami de passage remonte le moral.
    c.mood = clamp(c.mood + 15);
    events.push({ type: 'event-boon', data: { eventId } });
  }
}

/** La menace n'a pas été chassée à temps : les pillards se servent. */
function applyThreatLoss(
  c: CompanionState,
  wallet: WalletState,
  cfg: GameConfig,
  eventId: string,
  events: SimEvent[],
  mods: SkillModifiers,
): void {
  let lost = 0;
  if (eventId === 'crumb-thief') {
    lost = Math.floor(c.pendingCrumbs * cfg.thiefStealRatio * mods.theftLoss);
    c.pendingCrumbs = Math.max(0, c.pendingCrumbs - lost);
  } else if (eventId === 'ant-invasion') {
    lost = Math.floor(wallet.crumbs * cfg.antStealRatio * mods.theftLoss);
    wallet.crumbs -= lost;
  } else if (eventId === 'greedy-pigeon') {
    lost = Math.round(cfg.pigeonSatietyBite * mods.theftLoss);
    c.satiety = clamp(c.satiety - lost);
  } else if (eventId === 'ufo-abduction') {
    // L'OVNI enlève le dernier petit adopté. Traumatisant.
    if (c.children.length > 0) {
      c.children.pop();
      lost = 1;
      c.mood = clamp(c.mood - 10); // en plus du −5 commun
    }
  }
  c.mood = clamp(c.mood - 5);
  events.push({ type: 'event-lost', data: { eventId, lost } });
}

/** Le joueur (ou l'auto-défense) chasse la menace : petit bonus de fierté. */
export function defendEvent(c: CompanionState, cfg: GameConfig): SimEvent[] {
  if (!c.activeEvent) return [];
  const eventId = c.activeEvent.eventId;
  c.activeEvent = null;
  scheduleNextEvent(c, cfg);
  c.mood = clamp(c.mood + 5);
  c.xp += 15;
  return [{ type: 'event-defended', data: { eventId } }];
}

export function hatch(c: CompanionState, events: SimEvent[]): void {
  if (c.stage !== 'egg') return;
  c.stage = 'blob';
  events.push({ type: 'hatched' });
}

function ownsSkillId(c: CompanionState, skillId: string): boolean {
  return c.skills.some((sp) => sp.state === 'owned' && sp.skillId === skillId);
}

function productionPerHour(c: CompanionState, cfg: GameConfig): number {
  let perHour = 0;
  for (const sp of c.skills) {
    if (sp.state !== 'owned') continue;
    const base = skillById(cfg, sp.skillId)?.crumbsPerHour ?? 0;
    perHour += base * levelScale(cfg, sp.level);
  }
  // Les petits adoptés donnent un coup de patte (boutique, Adoption).
  perHour += c.children.length * cfg.childProductionPerHour;
  return perHour;
}

/** Contenant courant (borné à la chaîne définie en config). */
export function containerOf(c: CompanionState, cfg: GameConfig) {
  return cfg.containers[Math.min(c.containerLevel, cfg.containers.length - 1)];
}

export function crumbCap(c: CompanionState, cfg: GameConfig): number {
  return productionPerHour(c, cfg) * cfg.crumbCapHours * containerOf(c, cfg).capMultiplier;
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
  if (food.vitality) {
    if (c.stage === 'grandpa') {
      if (foodId === 'health-kit') {
        c.vitality = clamp(c.vitality + food.vitality);
      }
    } else {
      c.vitality = clamp(c.vitality + food.vitality);
    }
  }
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
