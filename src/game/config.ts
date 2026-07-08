// Économie data-driven (GDD §11) : toutes les courbes, coûts et seuils vivent ici.
// L'équilibrage se fait dans ce fichier sans toucher à la simulation.

import type {
  ContainerDef,
  CosmeticDef,
  EventDef,
  FoodDef,
  SkillCategory,
  SkillDef,
  StageCode,
  StageDef,
} from './types';

export interface GameConfig {
  stages: Record<StageCode, StageDef>;
  stageOrder: StageCode[];
  foods: FoodDef[];
  skills: SkillDef[];
  cosmetics: CosmeticDef[];
  events: EventDef[];

  /** Nombre de tapotements pour faire éclore l'œuf. */
  eggTapsToHatch: number;
  /** Éclosion automatique après ce temps actif (secondes), même sans tapoter. */
  eggHatchSeconds: number;

  hungryThreshold: number;
  vitalityRegenSatietyThreshold: number;
  vitalityLossPerHour: number;
  vitalityRegenPerHour: number;
  sickThreshold: number;
  recoverThreshold: number;
  deathAfterZeroVitalitySeconds: number;

  moodDecayPerHour: number;
  hungryMoodPenaltyPerHour: number;
  grumpyThreshold: number;
  happyThreshold: number;

  moodMultiplier: (mood: number) => number;
  crumbCapHours: number;

  xpPerActiveHour: number;
  xpPerFeed: number;
  xpPerPlay: number;

  playMoodGain: number;
  playCooldownSeconds: number;

  autoFeedThreshold: number;

  /** Niveaux de compétences. */
  skillUpgradeCostGrowth: number;
  skillLevelEffectStep: number;
  defaultMaxSkillLevel: number;

  /** Événements aléatoires (menaces + aubaines). */
  eventMinIntervalSeconds: number;
  eventMaxIntervalSeconds: number;
  /** Plancher absolu entre deux événements, même pot débordant. */
  eventIntervalFloorSeconds: number;
  /**
   * L'appât du butin : l'intervalle est divisé par (1 + pot/diviseur).
   * Plus les Miettes s'entassent, plus les pillards rappliquent.
   */
  crumbLureDivisor: number;
  eventWindowSeconds: number;
  /** Part du pot volée par le corbeau (avant Défense). */
  thiefStealRatio: number;
  /** Part du portefeuille pillée par les fourmis. */
  antStealRatio: number;
  /** Satiété picorée par le pigeon. */
  pigeonSatietyBite: number;

  /** Adoption d'enfants : prix de base (doublé à chaque petit), max, bonus. */
  childBaseCost: number;
  maxChildren: number;
  childProductionPerHour: number;
  /** Chaque petit creuse l'appétit du foyer (Satiété/h en plus). */
  childMetabolismPerHour: number;
  /** Chaque petit grignote aussi les Miettes (pot d'abord, puis portefeuille). */
  childCrumbEatPerHour: number;
  /** Études simultanées de base — chaque petit en offre une de plus. */
  baseStudySlots: number;

  /** Chaîne des contenants à Miettes (multiplie le plafond du pot). */
  containers: ContainerDef[];

  /**
   * Tourelle anti-OVNI : coût en TOKEN (achat de niveau), croissance géométrique,
   * chance d'interception par niveau, et coût en Miettes (munitions) par tir.
   */
  turret: {
    maxLevel: number;
    baseCost: number;
    costGrowth: number;
    chancePerLevel: number;
    ammoCostPerShot: number;
    ammoCostPerLevel: number;
  };

  /**
   * Vieillesse (Papy) : la Vitalité se dégrade indépendamment de la Satiété,
   * de plus en plus vite avec l'âge passé au stade (accélération quadratique).
   */
  grandpa: {
    baseDecayPerHour: number;
    decayAccelPerHourSq: number;
    maxDecayPerHour: number;
    nurseHealPerLevelPerHour: number;
    /** Délai de grâce à Vitalité 0 avant la mort — plus court qu'aux autres stades. */
    deathAfterZeroVitalitySeconds: number;
  };

  /** Clicker : cliquer sur le Compagnon rapporte des Miettes directement au portefeuille. */
  click: {
    baseCrumbsPerClick: number;
    critMultiplier: number;
    critChanceCap: number;
  };

  devCapacityBudget: number;
  /** Rythme de croisière du jeu (×1.25 par défaut) — simSpeed reste le multiplicateur DEV. */
  baseTimeScale: number;
  simSpeed: number;
  /** Source d'aléa injectable (tests). */
  rng?: () => number;
  disableEnemies?: boolean;
}

// ————————————————————————————————————————————————————————————————
// L'ARBRE DES 100 COMPÉTENCES — six branches, chaînes à prérequis.
// Chaque rangée : [id, label, effets spécifiques]. Coût, durée d'étude,
// stade requis et prérequis sont dérivés du rang dans la branche.
// ————————————————————————————————————————————————————————————————

type Row = [id: string, label: string, effects: Partial<SkillDef>, description?: string];

interface ChainOpts {
  category: SkillCategory;
  /** Coût de base (rang 0) et croissance par rang. */
  baseCost: number;
  costGrowth: number;
  currency?: 'crumbs' | 'token';
  /** Un rang sur N coûte des TOKEN (les paliers précoces, GDD §6.2). */
  tokenEvery?: number;
  /** Stade requis par tranche de rangs. */
  stageAt?: (rank: number) => StageCode;
  /** Description auto si absente. */
  describe?: (effects: Partial<SkillDef>) => string;
}

function defaultStageAt(rank: number): StageCode {
  if (rank < 2) return 'blob';
  if (rank < 8) return 'kid';
  if (rank < 13) return 'teen';
  if (rank < 18) return 'adult';
  return 'grandpa';
}

function chain(rows: Row[], opts: ChainOpts): SkillDef[] {
  return rows.map(([id, label, effects, description], rank) => {
    const currency =
      opts.currency ?? (opts.tokenEvery && rank % opts.tokenEvery === 0 ? 'token' : 'crumbs');
    const cost = Math.round(
      (currency === 'token' ? opts.baseCost * 40 : opts.baseCost) *
        Math.pow(opts.costGrowth, rank),
    );
    return {
      id,
      label,
      description: description ?? opts.describe?.(effects) ?? '',
      category: opts.category,
      costCurrency: currency,
      cost,
      trainSeconds: Math.min(120, 8 + rank * 6) * 60,
      minStage: (opts.stageAt ?? defaultStageAt)(rank),
      requires: rank === 0 ? undefined : [rows[rank - 1][0]],
      ...effects,
    };
  });
}

// — Production (24) : la grande chaîne du pain, de la miette à la singularité.
const PRODUCTION: SkillDef[] = chain(
  [
    ['crumb-forage', 'Ramasse-miettes', { crumbsPerHour: 50 }],
    ['bakery', 'Boulangerie', { crumbsPerHour: 80 }],
    ['ppc', 'PPC : Pause Pain au Choc', { crumbsPerHour: 120 }, 'Une pause réglementaire toutes les heures, encadrée par la convention collective de la gourmandise. +120 Miettes/h.'],
    ['croissanterie', 'Croissanterie', { crumbsPerHour: 170 }],
    ['baguette-dealer', 'Dealer de baguettes', { crumbsPerHour: 230 }],
    ['crouton-mine', 'Mine de croûtons', { crumbsPerHour: 300 }],
    ['chapelure-factory', 'Usine à chapelure', { crumbsPerHour: 380 }],
    ['brioche-lab', 'Laboratoire brioché', { crumbsPerHour: 480 }],
    ['gluten-startup', 'Start-up du gluten', { crumbsPerHour: 600 }],
    ['pain-perdu', 'Recyclage de pain perdu', { crumbsPerHour: 750 }],
    ['crumb-hedge-fund', 'Fonds spéculatif de miettes', { crumbsPerHour: 950 }],
    ['syndicat-boulangers', 'Syndicat des boulangers', { crumbsPerHour: 1200 }],
    ['four-solaire', 'Four solaire', { crumbsPerHour: 1500 }],
    ['levain-eternel', 'Levain éternel', { crumbsPerHour: 1900 }],
    ['crumb-monopoly', 'Monopole de la miette', { crumbsPerHour: 2400 }],
    ['grand-moulin', 'Grand Moulin de Toki', { crumbsPerHour: 3000 }],
    ['miette-3d', 'Imprimante à miettes 3D', { crumbsPerHour: 3800 }],
    ['brioche-chain', 'Brioche-chain', { crumbsPerHour: 4800 }, 'La blockchain, mais avec de la brioche. Personne ne comprend, tout le monde investit. +4 800 Miettes/h.'],
    ['crumb-empire', 'Empire des miettes', { crumbsPerHour: 6000 }],
    ['pain-quantique', 'Pain quantique', { crumbsPerHour: 7500 }],
    ['multiverse-bakery', 'Boulangerie multiverselle', { crumbsPerHour: 9500 }],
    ['crumb-singularity', 'Singularité miettique', { crumbsPerHour: 12000 }],
    ['big-crunch', 'Big Crunch', { crumbsPerHour: 15000 }],
    ['genese-panaire', 'Genèse panaire', { crumbsPerHour: 20000 }, 'Au commencement était la Miette. +20 000 Miettes/h.'],
  ],
  {
    category: 'production',
    baseCost: 120,
    costGrowth: 1.55,
    tokenEvery: 6,
    stageAt: (r) => (r < 6 ? 'kid' : r < 12 ? 'teen' : r < 18 ? 'adult' : 'grandpa'),
    describe: (e) => `Produit +${e.crumbsPerHour} Miettes par heure active.`,
  },
);

// — Efficacité / métabolisme (10) : la jauge descend moins vite.
const METABOLISM: SkillDef[] = chain(
  [
    ['lean-stomach', 'Estomac économe', { metabolismMultiplier: 0.9 }],
    ['sieste-pro', 'Sieste professionnelle', { metabolismMultiplier: 0.9 }],
    ['digestion-zen', 'Digestion zen', { metabolismMultiplier: 0.9 }],
    ['mode-eco', 'Mode éco', { metabolismMultiplier: 0.9 }],
    ['hibernation-light', 'Hibernation light', { metabolismMultiplier: 0.9 }],
    ['photosynthese', 'Photosynthèse amateur', { metabolismMultiplier: 0.9 }],
    ['estomac-tardis', 'Estomac TARDIS', { metabolismMultiplier: 0.9 }, "Plus grand à l'intérieur. −10 % de métabolisme."],
    ['regime-moine', 'Régime de moine', { metabolismMultiplier: 0.9 }],
    ['thermos-interne', 'Thermos interne', { metabolismMultiplier: 0.9 }],
    ['entropie-inversee', 'Entropie inversée', { metabolismMultiplier: 0.85 }],
  ],
  {
    category: 'efficiency',
    baseCost: 150,
    costGrowth: 1.7,
    tokenEvery: 5,
    describe: () => 'La Satiété descend moins vite (−10 % de métabolisme).',
  },
);

// — Efficacité / prix de la nourriture (10).
const FRUGALITY: SkillDef[] = chain(
  [
    ['gourmet', 'Fin gourmet', { foodCostMultiplier: 0.9 }],
    ['coupons', 'Chasseur de coupons', { foodCostMultiplier: 0.9 }],
    ['negociateur', 'Négociateur né', { foodCostMultiplier: 0.9 }],
    ['achat-gros', 'Achat en gros', { foodCostMultiplier: 0.9 }],
    ['ami-boulanger', 'Ami du boulanger', { foodCostMultiplier: 0.9 }],
    ['marche-noir', 'Marché noir de la mie', { foodCostMultiplier: 0.9 }],
    ['licence-troc', 'Licence pro de troc', { foodCostMultiplier: 0.9 }],
    ['carte-fidelite', 'Carte fidélité infinie', { foodCostMultiplier: 0.9 }],
    ['lobby-miette', 'Lobby de la miette', { foodCostMultiplier: 0.9 }],
    ['prix-libre', 'Prix libre', { foodCostMultiplier: 0.85 }],
  ],
  {
    category: 'efficiency',
    baseCost: 130,
    costGrowth: 1.7,
    describe: () => 'Les aliments en Miettes coûtent 10 % de moins.',
  },
);

// — Conversion (12) : chaque TOKEN nourrit davantage.
const CONVERSION: SkillDef[] = chain(
  [
    ['golden-palate', 'Papilles dorées', { tokenSatietyMultiplier: 1.15 }],
    ['token-sommelier', 'Sommelier de tokens', { tokenSatietyMultiplier: 1.15 }],
    ['prompt-gourmet', 'Dégustateur de prompts', { tokenSatietyMultiplier: 1.15 }],
    ['cache-gustatif', 'Cache gustatif', { tokenSatietyMultiplier: 1.15 }, 'Les saveurs déjà vues ne coûtent presque rien. Repas TOKEN +15 %.'],
    ['batch-eater', 'Mangeur par batch', { tokenSatietyMultiplier: 1.15 }],
    ['compression-calorique', 'Compression calorique', { tokenSatietyMultiplier: 1.15 }],
    ['tokenizer-pro', 'Tokenizer professionnel', { tokenSatietyMultiplier: 1.15 }],
    ['embedding-digestif', 'Embedding digestif', { tokenSatietyMultiplier: 1.15 }],
    ['distillation-fine', 'Distillation fine', { tokenSatietyMultiplier: 1.15 }],
    ['quantization-4bit', 'Quantization 4 bits', { tokenSatietyMultiplier: 1.15 }],
    ['contexte-long', 'Contexte long', { tokenSatietyMultiplier: 1.15 }],
    ['mixture-of-miettes', 'Mixture of Miettes', { tokenSatietyMultiplier: 1.2 }],
  ],
  {
    category: 'conversion',
    baseCost: 4,
    costGrowth: 1.6,
    currency: 'token',
    describe: () => 'Les repas payés en TOKEN nourrissent 15 % de plus.',
  },
);

// — Automatisation (8) : il vit sa vie.
const AUTOMATION: SkillDef[] = chain(
  [
    ['auto-feeder', 'Garde-manger', { maxLevel: 1 }, "S'auto-nourrit avec ses Miettes quand la Satiété passe sous 30. L'aboutissement idle."],
    ['majordome', 'Majordome', { maxLevel: 1, autoCollect: true }, 'Ramasse le pot tout seul quand il déborde. Un amour.'],
    ['batch-cooking', 'Batch cooking', { foodCostMultiplier: 0.93 }],
    ['meal-prep', 'Meal prep dominical', { foodCostMultiplier: 0.93 }],
    ['robot-cuiseur', 'Robot cuiseur', { foodCostMultiplier: 0.92 }],
    ['drone-livreur', 'Drone livreur', { crumbsPerHour: 150 }, 'Livre des Miettes fraîches par les airs. +150 Miettes/h.'],
    ['chef-auto', 'Chef étoilé automatique', { tokenSatietyMultiplier: 1.2 }],
    ['pilote-vie', 'Pilote automatique de vie', { metabolismMultiplier: 0.88 }],
    ['nurse', 'Infirmières', { maxLevel: 5, minStage: 'grandpa' }, "Ralentit la perte de Vitalité du Tokidachi papy (+8/h par niveau) — un sursis, pas un remède : l'âge finit toujours par rattraper."],
    ['immortal', 'Toki éternel', { maxLevel: 1, cost: 10_000_000, minStage: 'grandpa' }, 'Rend le Tokidachi éternel. Il ne perd plus de vitalité avec la vieillesse.'],
  ],
  {
    category: 'automation',
    baseCost: 120,
    costGrowth: 2.0,
    stageAt: (r) => (r < 2 ? 'kid' : r < 5 ? 'teen' : 'adult'),
    describe: (e) =>
      e.foodCostMultiplier
        ? 'Cuisine maligne : aliments un peu moins chers.'
        : e.tokenSatietyMultiplier
          ? 'Sublime les repas TOKEN (+20 %).'
          : e.metabolismMultiplier
            ? 'Routine parfaite : −12 % de métabolisme.'
            : '',
  },
);

// — Sociale (16) : bonheur, XP et papouilles.
const SOCIAL: SkillDef[] = chain(
  [
    ['hug-expert', 'Câlin expert', { playCooldownMultiplier: 0.9, playMoodBonus: 2 }],
    ['chatouilleur', 'Chatouilleur pro', { playMoodBonus: 3 }],
    ['standup', 'Stand-up de miettes', { playMoodBonus: 3 }],
    ['jonglage', 'Jonglage de croûtons', { playCooldownMultiplier: 0.9 }],
    ['petanque', 'Pétanque master', { playMoodBonus: 4 }],
    ['yoga-rire', 'Yoga du rire', { playCooldownMultiplier: 0.9 }],
    ['dj-blob', 'DJ Blob', { playMoodBonus: 4 }],
    ['conteur', 'Conteur hypnotique', { xpMultiplier: 1.1 }],
    ['mascotte', 'Mascotte officielle', { xpMultiplier: 1.1 }],
    ['influenceur', 'Influenceur mignon', { xpMultiplier: 1.1 }],
    ['papouilles-quantiques', 'Papouilles quantiques', { playCooldownMultiplier: 0.85 }],
    ['comite-fetes', 'Comité des fêtes', { playMoodBonus: 5 }],
    ['karaoke', 'Star de karaoké', { playMoodBonus: 5 }],
    ['philosophe', 'Philosophe zen', { xpMultiplier: 1.15 }],
    ['retraite-heureuse', 'Retraite heureuse', { playCooldownMultiplier: 0.85 }],
    ['doyen-adore', 'Doyen adoré', { xpMultiplier: 1.2, playMoodBonus: 5 }],
  ],
  {
    category: 'social',
    baseCost: 90,
    costGrowth: 1.65,
    describe: (e) =>
      [
        e.playMoodBonus ? `Jouer rend +${e.playMoodBonus} d'humeur en plus.` : '',
        e.playCooldownMultiplier ? 'Jouer se recharge plus vite.' : '',
        e.xpMultiplier ? 'Il grandit plus vite (+XP passive).' : '',
      ]
        .filter(Boolean)
        .join(' '),
  },
);

// — Défense (20) : contre les corbeaux, fourmis et autres pillards.
const DEFENSE: SkillDef[] = chain(
  [
    ['epouvantail', 'Épouvantail', { theftLossMultiplier: 0.85 }],
    ['mini-fronde', 'Mini-fronde', { theftLossMultiplier: 0.85 }],
    ['moustache-dissuasive', 'Moustache dissuasive', { theftLossMultiplier: 0.85 }],
    ['cri-primal', 'Cri primal', { theftLossMultiplier: 0.85 }],
    ['barbeles-de-mie', 'Barbelés de mie', { theftLossMultiplier: 0.85 }],
    ['bouclier-crouton', 'Bouclier croûton', { theftLossMultiplier: 0.85 }],
    ['karate-kid', 'Karaté Kid', { theftLossMultiplier: 0.8 }],
    ['alarme-miettes', 'Alarme à miettes', { eventWindowMultiplier: 1.2 }],
    ['douves-de-lait', 'Douves de lait', { theftLossMultiplier: 0.8 }],
    ['golem-de-pain', 'Golem de pain', { theftLossMultiplier: 0.8 }],
    ['garde-du-corps', 'Garde du corps', { autoDefendChance: 0.1 }],
    ['ninja-de-nuit', 'Ninja de nuit', { autoDefendChance: 0.1 }],
    ['sentinelle-pixel', 'Sentinelle pixel', { autoDefendChance: 0.1 }],
    ['tourelle-baguette', 'Tourelle à baguettes', { autoDefendChance: 0.15 }],
    ['assurance-risques', 'Assurance tous risques', { theftLossMultiplier: 0.75 }],
    ['reflexes-felins', 'Réflexes félins', { eventWindowMultiplier: 1.25 }],
    ['sixieme-sens', 'Sixième sens', { eventWindowMultiplier: 1.25 }],
    ['radar-corbeaux', 'Radar à corbeaux', { eventWindowMultiplier: 1.25 }],
    ['bunker-brioche', 'Bunker briochée', { theftLossMultiplier: 0.7 }],
    ['pacte-corbeaux', 'Pacte avec les corbeaux', { autoDefendChance: 0.2 }, 'Ils sont de la famille maintenant. +20 % de chances de repousser une menace tout seul.'],
  ],
  {
    category: 'defense',
    baseCost: 100,
    costGrowth: 1.6,
    tokenEvery: 7,
    describe: (e) =>
      e.theftLossMultiplier
        ? 'Les pillards emportent moins de butin.'
        : e.autoDefendChance
          ? 'Chance de repousser une menace tout seul.'
          : "La fenêtre pour réagir aux menaces s'allonge.",
  },
);

// — Clicker (8) : la voie du doigt. Miettes directes au portefeuille, à la sueur de l'index.
/** Multiplicateur d'un clic critique — même valeur que DEFAULT_CONFIG.click.critMultiplier. */
const CLICK_CRIT_MULTIPLIER = 10;

const CLICKER: SkillDef[] = chain(
  [
    ['doigt-leste', 'Doigt leste', { crumbsPerClick: 1 }],
    ['pince-a-miettes', 'Pince à miettes', { crumbsPerClick: 2 }],
    ['clic-chanceux', 'Clic chanceux', { clickCritChance: 0.05, maxLevel: 3 }],
    ['double-clic', 'Double-clic', { crumbsPerClick: 3 }],
    ['souris-gamer', 'Souris gamer', { clickCritChance: 0.05, maxLevel: 3 }],
    ['macro-douteuse', 'Macro douteuse', { autoClicksPerHour: 400 }, "Un script qui clique à ta place. Le syndicat des doigts proteste. 400 clics/h automatiques."],
    ['doigt-dore', 'Doigt doré', { crumbsPerClick: 5 }],
    ['transcendance-tactile', 'Transcendance tactile', { crumbsPerClick: 8, clickCritChance: 0.05, maxLevel: 3 }],
  ],
  {
    category: 'clicker',
    baseCost: 60,
    costGrowth: 2.1,
    stageAt: (r) => (r < 1 ? 'blob' : r < 3 ? 'kid' : r < 5 ? 'teen' : r < 7 ? 'adult' : 'grandpa'),
    describe: (e) =>
      e.autoClicksPerHour
        ? `Clique tout seul ${e.autoClicksPerHour} fois par heure active.`
        : e.clickCritChance
          ? `Augmente la chance de clic critique (×${CLICK_CRIT_MULTIPLIER} Miettes).`
          : `Chaque clic sur le Compagnon rapporte +${e.crumbsPerClick} Miette${(e.crumbsPerClick ?? 0) > 1 ? 's' : ''}.`,
  },
);

const ALL_SKILLS: SkillDef[] = [
  ...PRODUCTION,
  ...METABOLISM,
  ...FRUGALITY,
  ...CONVERSION,
  ...AUTOMATION,
  ...SOCIAL,
  ...DEFENSE,
  ...CLICKER,
];

export const DEFAULT_CONFIG: GameConfig = {
  stages: {
    egg: { code: 'egg', label: 'Œuf', metabolismPerHour: 0, xpToNext: null, skillSlots: 0 },
    blob: { code: 'blob', label: 'Blob', metabolismPerHour: 60, xpToNext: 120, skillSlots: 2 },
    kid: { code: 'kid', label: 'Kid', metabolismPerHour: 90, xpToNext: 400, skillSlots: 6 },
    teen: { code: 'teen', label: 'Ado', metabolismPerHour: 110, xpToNext: 1000, skillSlots: 12 },
    adult: { code: 'adult', label: 'Adulte', metabolismPerHour: 130, xpToNext: 2500, skillSlots: 20 },
    grandpa: {
      code: 'grandpa',
      label: 'Papy',
      metabolismPerHour: 80, // le métabolisme ralentit avec l'âge
      xpToNext: null,
      skillSlots: 30,
    },
  },
  stageOrder: ['egg', 'blob', 'kid', 'teen', 'adult', 'grandpa'],

  foods: [
    { id: 'stale-crumb', label: 'Miette rassie', emoji: '🍞', currency: 'crumbs', cost: 5, satiety: 10 },
    { id: 'kibble', label: 'Croquette', emoji: '🍪', currency: 'crumbs', cost: 15, satiety: 30 },
    { id: 'full-meal', label: 'Repas complet', emoji: '🍱', currency: 'crumbs', cost: 40, satiety: 70, mood: 5 },
    { id: 'premium-feast', label: 'Festin premium', emoji: '🍰', currency: 'token', cost: 10_000, satiety: 100, mood: 20, vitality: 15 },
    { id: 'emergency-ration', label: "Ration d'urgence", emoji: '🥫', currency: 'token', cost: 100, satiety: 50 },
    { id: 'health-kit', label: 'Kit de soin', emoji: '❤️', currency: 'token', cost: 1000, satiety: 0, vitality: 40, mood: 10 },
    { id: 'crumb-fish', label: 'Poisson-miette', emoji: '🐟', currency: 'crumbs', cost: 0, satiety: 80, mood: 25, vitality: 10, resource: 'crumbFish' },
  ],

  skills: ALL_SKILLS,

  // Boutique de cosmétiques (GDD §6.3) — un seul par emplacement.
  cosmetics: [
    { id: 'beret', label: 'Béret', emoji: '🥖', slot: 'head', currency: 'crumbs', cost: 150 },
    { id: 'party-hat', label: 'Chapeau de fête', emoji: '🎉', slot: 'head', currency: 'crumbs', cost: 250 },
    { id: 'top-hat', label: 'Haut-de-forme', emoji: '🎩', slot: 'head', currency: 'crumbs', cost: 600 },
    { id: 'bandana', label: 'Bandana', emoji: '🏴‍☠️', slot: 'head', currency: 'crumbs', cost: 300 },
    { id: 'crown', label: 'Couronne', emoji: '👑', slot: 'head', currency: 'token', cost: 50_000 },
    { id: 'halo', label: 'Auréole', emoji: '😇', slot: 'head', currency: 'token', cost: 20_000 },
    { id: 'sunglasses', label: 'Lunettes de soleil', emoji: '🕶️', slot: 'face', currency: 'crumbs', cost: 350 },
    { id: 'monocle', label: 'Monocle', emoji: '🧐', slot: 'face', currency: 'crumbs', cost: 500 },
    { id: 'flower', label: 'Fleur', emoji: '🌸', slot: 'face', currency: 'crumbs', cost: 120 },
    { id: 'bow', label: 'Nœud papillon', emoji: '🎀', slot: 'neck', currency: 'crumbs', cost: 200 },
    { id: 'scarf', label: 'Écharpe', emoji: '🧣', slot: 'neck', currency: 'crumbs', cost: 280 },
    { id: 'gold-chain', label: 'Chaîne en or', emoji: '⛓️', slot: 'neck', currency: 'token', cost: 30_000 },
  ],

  turret: {
    maxLevel: 5,
    baseCost: 500,
    costGrowth: 1.8,
    chancePerLevel: 0.2,
    ammoCostPerShot: 30,
    ammoCostPerLevel: 15,
  },

  grandpa: {
    baseDecayPerHour: 60,
    decayAccelPerHourSq: 40,
    maxDecayPerHour: 600,
    nurseHealPerLevelPerHour: 8,
    deathAfterZeroVitalitySeconds: 5 * 60,
  },

  click: {
    baseCrumbsPerClick: 1,
    critMultiplier: CLICK_CRIT_MULTIPLIER,
    critChanceCap: 0.35,
  },

  // Événements aléatoires — menaces (cliquer pour défendre) et aubaines.
  events: [
    { id: 'crumb-thief', label: 'Corbeau chapardeur', emoji: '🐦‍⬛', kind: 'threat', weight: 4, threatText: 'Il vise le pot de Miettes !' },
    { id: 'ant-invasion', label: 'Invasion de fourmis', emoji: '🐜', kind: 'threat', weight: 3, threatText: 'Elles grimpent sur le pot de Miettes !' },
    { id: 'greedy-pigeon', label: 'Pigeon glouton', emoji: '🐦', kind: 'threat', weight: 3, threatText: 'Il veut lui voler son goûter !' },
    { id: 'ufo-abduction', label: 'OVNI kidnappeur', emoji: '🛸', kind: 'threat', weight: 3, threatText: 'Il vise un petit !', requiresChildren: true },
    { id: 'crumb-rain', label: 'Pluie de miettes', emoji: '🌧️', kind: 'boon', weight: 2 },
    { id: 'butterfly', label: 'Papillon ami', emoji: '🦋', kind: 'boon', weight: 2 },
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

  eventMinIntervalSeconds: 12 * 60,
  eventMaxIntervalSeconds: 35 * 60,
  eventIntervalFloorSeconds: 90,
  crumbLureDivisor: 150,
  eventWindowSeconds: 25, // 25 actifs ÷ baseTimeScale 1.25 = 20 s réelles — fenêtre réelle inchangée
  thiefStealRatio: 0.4,
  antStealRatio: 0.15,
  pigeonSatietyBite: 25,

  childBaseCost: 500,
  maxChildren: 4,
  childProductionPerHour: 15,
  childMetabolismPerHour: 10,
  childCrumbEatPerHour: 8,
  baseStudySlots: 1,

  // Un pot plus grand = plus de réserve idle… et plus d'appât pour les pillards.
  containers: [
    { label: 'Bocal', emoji: '🫙', capMultiplier: 1, cost: 0 },
    { label: 'Poubelle', emoji: '🗑️', capMultiplier: 2.5, cost: 400 },
    { label: 'Piscine', emoji: '🏊', capMultiplier: 6, cost: 2_500 },
    { label: 'Coffre-fort', emoji: '🔐', capMultiplier: 15, cost: 12_000 },
    { label: 'Silo à grains', emoji: '🌾', capMultiplier: 40, cost: 60_000 },
    { label: 'Dimension de poche', emoji: '👝', capMultiplier: 100, cost: 300_000 },
  ],

  devCapacityBudget: 1_000_000,
  baseTimeScale: 1.25,
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

export function cosmeticById(cfg: GameConfig, id: string): CosmeticDef | undefined {
  return cfg.cosmetics.find((c) => c.id === id);
}

export function eventById(cfg: GameConfig, id: string): EventDef | undefined {
  return cfg.events.find((e) => e.id === id);
}

/** Prix du prochain petit : double à chaque adoption. */
export function childCost(cfg: GameConfig, currentChildren: number): number {
  return cfg.childBaseCost * Math.pow(2, currentChildren);
}

/** Prix en TOKEN pour faire passer la tourelle du niveau `level` à `level + 1`. */
export function turretCost(cfg: GameConfig, level: number): number {
  return Math.round(cfg.turret.baseCost * Math.pow(cfg.turret.costGrowth, level));
}

/** Coût en Miettes (munitions) d'un tir de tourelle au niveau `level`. */
export function turretAmmoCost(cfg: GameConfig, level: number): number {
  return level <= 0 ? 0 : cfg.turret.ammoCostPerShot + cfg.turret.ammoCostPerLevel * (level - 1);
}

export interface PrestigeSkillDef {
  id: string;
  label: string;
  description: string;
  cost: number;
  requires?: string[];
}

export const PRESTIGE_SKILLS: PrestigeSkillDef[] = [
  { id: 'starter-crumbs', label: 'Héritage matériel', description: 'Chaque nouveau Tokidachi commence sa vie avec +500 Miettes.', cost: 5 },
  { id: 'meta-eco', label: 'Métabolisme spirituel', description: 'Réduit la faim de tous les futurs Tokidachis de 15%.', cost: 10 },
  { id: 'fast-study', label: 'Sagesse des ancêtres', description: 'Les compétences s\'étudient 25% plus vite.', cost: 15 },
  { id: 'tax-shield', label: 'Paradis Fiscal', description: 'Le PEA n\'est plus soumis à la taxe étatique de 80% lors de la succession.', cost: 15 },
  { id: 'graveyard', label: 'Cimetière hanté', description: 'Permet au Tokidachi mort de générer passivement des Miettes dans le Mémorial (+0.5/h par heure de vie active atteinte).', cost: 20 },
  { id: 'unlock-garden', label: 'Jardin ancestral', description: 'Débloque le Jardin de l\'Avant-poste : plante des arbres qui produisent du bois.', cost: 25 },
  { id: 'unlock-camp', label: 'Feu de camp', description: 'Débloque le Feu de camp : brûle le bois du Jardin pour cuisiner du Poisson-miette.', cost: 35, requires: ['unlock-garden'] },
  { id: 'unlock-pool', label: 'La Mare', description: 'Débloque la Mare : pêche au clic pour approvisionner le Feu de camp en poisson.', cost: 50, requires: ['unlock-camp'] },
];

export function prestigeSkillBlocked(def: PrestigeSkillDef, owned: string[]): string[] | null {
  const missing = (def.requires ?? []).filter((id) => !owned.includes(id));
  return missing.length > 0 ? missing : null;
}

