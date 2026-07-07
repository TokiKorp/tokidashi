// Types du domaine — voir docs/GDD.md §2 (glossaire) et §11 (modèle de données).
// Toutes les durées sont exprimées en secondes de TEMPS ACTIF (session déverrouillée,
// app en vie) — jamais en temps calendaire (GDD §6.1).

export type StageCode = 'egg' | 'blob' | 'kid' | 'teen' | 'adult' | 'grandpa';

export type VisibleState =
  | 'egg'
  | 'happy'
  | 'neutral'
  | 'hungry'
  | 'grumpy'
  | 'sick'
  | 'working'
  | 'dead';

export type Currency = 'token' | 'crumbs';

export interface FoodDef {
  id: string;
  label: string;
  emoji: string;
  currency: Currency;
  cost: number;
  satiety: number;
  mood?: number;
  vitality?: number;
}

export interface StageDef {
  code: StageCode;
  label: string;
  /** Points de Satiété consommés par heure active (GDD §4.3 : croissant avec l'âge). */
  metabolismPerHour: number;
  /** XP cumulée requise pour passer au stade suivant. null = stade final du MVP. */
  xpToNext: number | null;
  skillSlots: number;
}

export type SkillCategory =
  | 'production'
  | 'automation'
  | 'efficiency'
  | 'conversion'
  | 'social'
  | 'defense';

export interface SkillDef {
  id: string;
  label: string;
  description: string;
  category: SkillCategory;
  costCurrency: Currency;
  cost: number;
  /** Durée d'étude en secondes actives avant que la compétence soit acquise. */
  trainSeconds: number;
  minStage: StageCode;
  /** Arbre : compétences à posséder avant de pouvoir apprendre celle-ci. */
  requires?: string[];
  /** Niveau maximum (défaut : cfg.defaultMaxSkillLevel). 1 = non améliorable. */
  maxLevel?: number;
  /** Production : Miettes générées par heure active. */
  crumbsPerHour?: number;
  /** Efficacité : multiplie le métabolisme (0.75 = −25 % de faim). */
  metabolismMultiplier?: number;
  /** Efficacité : multiplie le coût en Miettes des aliments. */
  foodCostMultiplier?: number;
  /** Conversion : multiplie la satiété rendue par les repas payés en TOKEN. */
  tokenSatietyMultiplier?: number;
  /** Sociale : multiplie le cooldown du jeu. */
  playCooldownMultiplier?: number;
  /** Sociale : bonus d'humeur ajouté quand on joue. */
  playMoodBonus?: number;
  /** Sociale : multiplie l'XP passive. */
  xpMultiplier?: number;
  /** Défense : multiplie les pertes des événements (0,85 = −15 %). */
  theftLossMultiplier?: number;
  /** Défense : chance (additive, 0-1) de repousser une menace tout seul. */
  autoDefendChance?: number;
  /** Défense : multiplie la fenêtre de réaction aux menaces. */
  eventWindowMultiplier?: number;
  /** Automatisation : ramasse le pot tout seul quand il est presque plein. */
  autoCollect?: boolean;
}

export type SkillState = 'learning' | 'owned';

export interface SkillProgress {
  skillId: string;
  state: SkillState;
  trainedSeconds: number;
  /** Niveau courant (1 dès l'acquisition). L'effet grandit avec le niveau. */
  level: number;
  /** Étudie une amélioration — l'effet du niveau courant reste actif pendant. */
  upgrading: boolean;
}

/**
 * Génome : l'apparence est générée procéduralement à l'adoption — chaque
 * Compagnon est unique (forme, teinte, oreilles, taches). Le seed rend les
 * taches déterministes au rendu.
 */
export interface Genome {
  seed: number;
  /** Teinte HSL du corps (0-360). */
  hue: number;
  /** 0 = rond, 1 = large, 2 = haut. */
  shape: 0 | 1 | 2;
  /** 0 = aucune, 1 = oreilles de chat, 2 = antenne. */
  earStyle: 0 | 1 | 2;
  spots: boolean;
}

export interface CompanionState {
  name: string;
  genome: Genome;
  /** TOKEN mangés sur toute la vie — fait grossir le Compagnon (échelle log jusqu'à 1M). */
  tokensEaten: number;
  stage: StageCode;
  xp: number;
  satiety: number; // 0–100
  vitality: number; // 0–100
  mood: number; // 0–100
  eggTaps: number;
  /** Âge total en secondes actives. */
  activeSeconds: number;
  /** Temps actif consécutif passé à Vitalité 0 (compte à rebours vers la mort). */
  zeroVitalitySeconds: number;
  sick: boolean;
  dead: boolean;
  skills: SkillProgress[];
  /** Miettes produites non ramassées, plafonnées (GDD §7 : stock idle plafonné). */
  pendingCrumbs: number;
  /**
   * « Chauffe » de prix par aliment : monte à chaque achat (anti-spam),
   * redescend avec le temps actif (demi-vie ~5 min).
   */
  foodHeat: Record<string, number>;
  /** Cosmétiques achetés / portés (un seul par emplacement). */
  cosmetics: { owned: string[]; equipped: string[] };
  /** Petits adoptés à la boutique — génome aléatoire, aident à la production. */
  children: Genome[];
  /** Événement en cours (menace à chasser d'un clic avant l'échéance). */
  activeEvent: ActiveEvent | null;
  /** Prochain événement aléatoire, en activeSeconds. */
  nextEventAtActive: number;
  /** Marqueur (en activeSeconds) du dernier jeu — pour le cooldown. */
  lastPlayAtActive: number;
}

export interface WalletState {
  crumbs: number;
}

/** Jauge de capacité du provider, en TOKEN (GDD §5.3). Simulée en mode DEV. */
export interface CapacityGauge {
  budget: number;
  used: number;
  /** Mode DEV : capacité illimitée (aucune vérification de budget). */
  unlimited?: boolean;
}

export interface MemorialEntry {
  name: string;
  stage: StageCode;
  activeSeconds: number;
  bornAtIso: string;
  diedAtIso: string;
}

/** Cosmétique équipable (GDD §6.3) — rendu en pixels sur le sprite. */
export interface CosmeticDef {
  id: string;
  label: string;
  emoji: string;
  slot: 'head' | 'face' | 'neck';
  currency: Currency;
  cost: number;
}

/** Menace ou aubaine aléatoire (GDD §8.2, saveur idle). */
export interface EventDef {
  id: string;
  label: string;
  emoji: string;
  kind: 'threat' | 'boon';
  weight: number;
  /** Menace : description de ce qui est perdu si on ne réagit pas. */
  threatText?: string;
}

export interface ActiveEvent {
  eventId: string;
  startedAtActive: number;
  expiresAtActive: number;
}

export type SimEventType =
  | 'hatched'
  | 'evolved'
  | 'got-hungry'
  | 'got-sick'
  | 'recovered'
  | 'died'
  | 'skill-learned'
  | 'skill-upgraded'
  | 'crumb-cap-reached'
  | 'auto-fed'
  | 'auto-collected'
  | 'event-started'
  | 'event-defended'
  | 'event-lost'
  | 'event-boon';

export interface SimEvent {
  type: SimEventType;
  data?: Record<string, unknown>;
}

export interface GameState {
  companion: CompanionState | null;
  wallet: WalletState;
  capacity: CapacityGauge;
  memorial: MemorialEntry[];
  bornAtIso: string | null;
}
