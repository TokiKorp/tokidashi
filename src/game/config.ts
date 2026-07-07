// Économie data-driven (GDD §11) : toutes les courbes, coûts et seuils vivent ici.
// L'équilibrage se fait dans ce fichier sans toucher à la simulation.

import type { FoodDef, SkillDef, StageCode, StageDef } from './types';

export interface GameConfig {
  stages: Record<StageCode, StageDef>;
  stageOrder: StageCode[];
  foods: FoodDef[];
  skills: SkillDef[];

  /** Nombre de tapotements pour faire éclore l'œuf. */
  eggTapsToHatch: number;
  /** Éclosion automatique après ce temps actif (secondes), même sans tapoter. */
  eggHatchSeconds: number;

  /** Seuil de Satiété sous lequel le Compagnon est « Affamé » (état visible + malus humeur). */
  hungryThreshold: number;
  /** Seuil de Satiété au-dessus duquel la Vitalité régénère. */
  vitalityRegenSatietyThreshold: number;
  /** Perte de Vitalité par heure active quand Satiété = 0. */
  vitalityLossPerHour: number;
  /** Régénération de Vitalité par heure active quand bien nourri. */
  vitalityRegenPerHour: number;
  /** Vitalité sous laquelle le Compagnon tombe Malade (réversible, GDD §4.1). */
  sickThreshold: number;
  /** Vitalité à partir de laquelle il guérit. */
  recoverThreshold: number;
  /** Temps actif (secondes) passé à Vitalité 0 avant la mort. */
  deathAfterZeroVitalitySeconds: number;

  /** Ennui : baisse d'Humeur par heure active. */
  moodDecayPerHour: number;
  /** Malus d'Humeur supplémentaire par heure quand Affamé. */
  hungryMoodPenaltyPerHour: number;
  /** Humeur sous laquelle le Compagnon est « Grognon ». */
  grumpyThreshold: number;
  /** Humeur au-dessus de laquelle il est « Heureux ». */
  happyThreshold: number;

  /** Multiplicateur de production selon l'Humeur (GDD §4.1 : ×0,5 à ×1,3). */
  moodMultiplier: (mood: number) => number;
  /** Plafond du stock de Miettes en attente, en heures de production (GDD §7). */
  crumbCapHours: number;

  /** XP passive par heure active (le simple fait de vivre ensemble). */
  xpPerActiveHour: number;
  xpPerFeed: number;
  xpPerPlay: number;

  /** Gain d'Humeur quand on joue, et cooldown en secondes actives. */
  playMoodGain: number;
  playCooldownSeconds: number;

  /** Auto-nourrissage : seuil de Satiété déclencheur (compétence Automatisation). */
  autoFeedThreshold: number;

  /** Niveaux de compétences : multiplicateur de coût par niveau supplémentaire. */
  skillUpgradeCostGrowth: number;
  /** Gain d'effet par niveau au-delà du 1er (0,5 = +50 %/niveau). */
  skillLevelEffectStep: number;
  /** Niveau max par défaut (surchargé par SkillDef.maxLevel). */
  defaultMaxSkillLevel: number;

  /** Budget simulé du provider en mode DEV, en TOKEN. */
  devCapacityBudget: number;

  /** Accélérateur de simulation (panneau dev) — 1 en jeu normal. */
  simSpeed: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  stages: {
    egg: {
      code: 'egg',
      label: 'Œuf',
      metabolismPerHour: 0, // GDD §4.3 : métabolisme nul
      xpToNext: null, // l'éclosion est gérée par taps/temps, pas par XP
      skillSlots: 0,
    },
    blob: {
      code: 'blob',
      label: 'Blob',
      metabolismPerHour: 60, // une jauge pleine dure ~1 h 40 d'écran actif
      xpToNext: 120, // évolution en ~2-3 h de vie active soignée
      skillSlots: 1, // pas encore de travail (GDD §4.3), mais les bases s'apprennent
    },
    child: {
      code: 'child',
      label: 'Enfant',
      metabolismPerHour: 90, // ~1 h 07 par jauge — l'autosuffisance devient urgente
      xpToNext: null, // Ado/Adulte = V2
      skillSlots: 4,
    },
  },
  stageOrder: ['egg', 'blob', 'child'],

  // GDD §5.2 — placeholders assumés, à équilibrer sur tableur.
  foods: [
    { id: 'stale-crumb', label: 'Miette rassie', emoji: '🍞', currency: 'crumbs', cost: 5, satiety: 10 },
    { id: 'kibble', label: 'Croquette', emoji: '🍪', currency: 'crumbs', cost: 15, satiety: 30 },
    { id: 'full-meal', label: 'Repas complet', emoji: '🍱', currency: 'crumbs', cost: 40, satiety: 70, mood: 5 },
    { id: 'premium-feast', label: 'Festin premium', emoji: '🍰', currency: 'token', cost: 10_000, satiety: 100, mood: 20, vitality: 15 },
    { id: 'emergency-ration', label: "Ration d'urgence", emoji: '🥫', currency: 'token', cost: 100, satiety: 50 },
  ],

  // L'arbre MVP (GDD §6.2) : racines apprenables dès le Blob, branches au
  // stade Enfant. 1 slot Blob + 4 slots Enfant pour 7 compétences → il faut
  // choisir sa voie.
  //
  //   Ramasse-miettes ─┬─ Boulangerie
  //                    └─ Garde-manger (auto-nourrissage)
  //   Estomac économe ─── Fin gourmet ─── Papilles dorées
  //   Câlin expert
  skills: [
    {
      id: 'crumb-forage',
      label: 'Ramasse-miettes',
      description: 'Produit 50 Miettes par heure active, même quand tu ne regardes pas.',
      category: 'production',
      costCurrency: 'token',
      cost: 5_000,
      trainSeconds: 10 * 60,
      minStage: 'child',
      crumbsPerHour: 50,
    },
    {
      id: 'bakery',
      label: 'Boulangerie',
      description: 'Un vrai petit commerce : +80 Miettes par heure active.',
      category: 'production',
      costCurrency: 'crumbs',
      cost: 400,
      trainSeconds: 30 * 60,
      minStage: 'child',
      requires: ['crumb-forage'],
      crumbsPerHour: 80,
    },
    {
      id: 'auto-feeder',
      label: 'Garde-manger',
      description: "S'auto-nourrit avec ses Miettes quand la Satiété passe sous 30. L'aboutissement idle.",
      category: 'automation',
      costCurrency: 'crumbs',
      cost: 120,
      trainSeconds: 20 * 60,
      minStage: 'child',
      requires: ['crumb-forage'],
      maxLevel: 1, // binaire par nature : il se nourrit seul, ou pas
    },
    {
      id: 'lean-stomach',
      label: 'Estomac économe',
      description: 'Métabolisme réduit de 25 % — la jauge de Satiété descend moins vite.',
      category: 'efficiency',
      costCurrency: 'token',
      cost: 15_000,
      trainSeconds: 15 * 60,
      minStage: 'blob',
      metabolismMultiplier: 0.75,
    },
    {
      id: 'gourmet',
      label: 'Fin gourmet',
      description: 'Négocie ses repas : les aliments en Miettes coûtent 20 % de moins.',
      category: 'efficiency',
      costCurrency: 'crumbs',
      cost: 150,
      trainSeconds: 15 * 60,
      minStage: 'child',
      requires: ['lean-stomach'],
      foodCostMultiplier: 0.8,
    },
    {
      id: 'golden-palate',
      label: 'Papilles dorées',
      description: 'Chaque repas TOKEN nourrit 50 % de plus — ta capacité va plus loin.',
      category: 'conversion',
      costCurrency: 'token',
      cost: 25_000,
      trainSeconds: 10 * 60,
      minStage: 'child',
      requires: ['gourmet'],
      tokenSatietyMultiplier: 1.5,
    },
    {
      id: 'hug-expert',
      label: 'Câlin expert',
      description: 'Jouer recharge plus fort et deux fois plus souvent.',
      category: 'social',
      costCurrency: 'crumbs',
      cost: 100,
      trainSeconds: 10 * 60,
      minStage: 'blob',
      playCooldownMultiplier: 0.5,
      playMoodBonus: 5,
    },
  ],

  eggTapsToHatch: 5,
  eggHatchSeconds: 3 * 60,

  hungryThreshold: 25,
  vitalityRegenSatietyThreshold: 60,
  vitalityLossPerHour: 40,
  vitalityRegenPerHour: 10,
  sickThreshold: 30,
  recoverThreshold: 50,
  deathAfterZeroVitalitySeconds: 20 * 60,

  moodDecayPerHour: 6,
  hungryMoodPenaltyPerHour: 20,
  grumpyThreshold: 35,
  happyThreshold: 70,

  moodMultiplier: (mood) => (mood < 35 ? 0.5 : mood <= 70 ? 1.0 : 1.3),
  crumbCapHours: 8,

  xpPerActiveHour: 30,
  xpPerFeed: 8,
  xpPerPlay: 15,

  playMoodGain: 20,
  playCooldownSeconds: 3 * 60,

  autoFeedThreshold: 30,

  skillUpgradeCostGrowth: 1.8,
  skillLevelEffectStep: 0.5,
  defaultMaxSkillLevel: 5,

  // Échelle de TOKEN réaliste : 100 (ration) / 10 000 (festin) / 1 000 000 (max).
  devCapacityBudget: 1_000_000,

  simSpeed: 1,
};

export function nextStage(cfg: GameConfig, stage: StageCode): StageCode | null {
  const i = cfg.stageOrder.indexOf(stage);
  return i >= 0 && i + 1 < cfg.stageOrder.length ? cfg.stageOrder[i + 1] : null;
}

export function foodById(cfg: GameConfig, id: string): FoodDef | undefined {
  return cfg.foods.find((f) => f.id === id);
}

export function skillById(cfg: GameConfig, id: string): SkillDef | undefined {
  return cfg.skills.find((s) => s.id === id);
}
