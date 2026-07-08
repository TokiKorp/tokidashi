// Store zustand : l'état du jeu, la boucle de tick, et le pont entre l'UI,
// la simulation pure (src/game) et l'AIProvider (src/ai).
//
// Règle d'or (GDD §6.1) : la simulation n'avance que sur du temps ACTIF —
// session déverrouillée et app en vie. Le verrouillage gèle tout.

import { create } from 'zustand';
import { providerById } from '../ai';
import type { ReactionContext } from '../ai';
import { runCliQuery, pickCli, pickRandomQuestion, shortenResponse } from '../ai/cliRunner';
import {
  buyChild as buyChildAction,
  buyCosmetic as buyCosmeticAction,
  buyWeapon as buyWeaponAction,
  collectCrumbs,
  createCompanion,
  equipCosmetic as equipCosmeticAction,
  feed as feedAction,
  play as playAction,
  startLearning,
  startUpgrade,
  tapEgg as tapEggAction,
  upgradeContainer as upgradeContainerAction,
} from '../game/actions';
import { DEFAULT_CONFIG, eventById, foodById, skillById, PRESTIGE_SKILLS, type GameConfig } from '../game/config';
import { generateGenome } from '../game/genome';
import { moodBucket, reactionTier } from '../game/reactions';
import { advanceSim, defendEvent, scheduleNextEvent, effectiveFoodCost, skillModifiers, upgradeCost } from '../game/sim';
import type { GameState, SimEvent, StageCode } from '../game/types';
import { clearSave, loadSave, writeSave } from './persist';

export interface ReturnReport {
  activeSecondsAway: number;
  crumbsDelta: number;
  satietyDelta: number;
  moodDelta: number;
  events: SimEvent[];
}

interface ReportBaseline {
  activeSeconds: number;
  crumbsTotal: number;
  satiety: number;
  mood: number;
  events: SimEvent[];
}

export interface ReactionBubble {
  text: string | null; // null = « … » (génération en cours)
  source: 'ai' | 'scripted' | null;
  seq: number;
}

interface TokidachiStore {
  loaded: boolean;
  game: GameState;
  cfg: GameConfig;
  providerId: string;
  selectedCli: 'random' | 'agy' | 'codex' | 'claude';
  devMode: boolean;
  locked: boolean;
  reaction: ReactionBubble | null;
  notice: string | null;
  report: ReturnReport | null;
  language: 'fr' | 'en';
  notificationsEnabled: boolean;
  notifyThingsDone: boolean;
  notifyNeedsAttention: boolean;
  disableEnemies: boolean;

  // Cloud properties
  backupId: string;
  cloudSyncEnabled: boolean;
  cloudServerUrl: string;

  init(): Promise<void>;
  tick(dtSeconds: number): void;
  adopt(name: string): void;
  tapEgg(): void;
  feed(foodId: string): Promise<void>;
  play(): void;
  collect(): void;
  learn(skillId: string): void;
  upgrade(skillId: string): void;
  defend(): void;
  buyCosmetic(id: string): void;
  toggleCosmetic(id: string): void;
  buyChild(): void;
  buyWeapon(id: string): void;
  upgradeContainer(): void;
  buryAndRestart(name: string): void;
  succeed(childIndex: number, name: string): void;
  depositToPea(amount: number): void;
  prestigeEarly(): void;
  buyPrestigeSkill(skillId: string): void;
  setLocked(locked: boolean): void;
  markAway(): void;
  markBack(): void;
  dismissReport(): void;
  dismissNotice(): void;
  dismissReaction(): void;

  setProvider(providerId: string): void;
  setSelectedCli(cli: 'random' | 'agy' | 'codex' | 'claude'): void;
  unlockDevMode(key: string): void;
  disableDevMode(): void;
  setDisableEnemies(disabled: boolean): void;
  setLanguage(lang: 'fr' | 'en'): void;
  setNotificationsEnabled(enabled: boolean): void;
  setNotifyThingsDone(enabled: boolean): void;
  setNotifyNeedsAttention(enabled: boolean): void;

  addTokensToBag(tokens: number, cliName: string): void;
  ensureTokensAvailable(cost: number): Promise<boolean>;

  // Cloud methods
  setCloudSyncEnabled(enabled: boolean): void;
  setCloudServerUrl(url: string): void;
  regenerateBackupId(): void;
  triggerCloudSync(): Promise<boolean>;
  restoreFromCloud(backupId: string): Promise<boolean>;

  // Panneau dev
  setSimSpeed(x: number): void;
  refillCapacity(): void;
  setUnlimitedTokens(on: boolean): void;
  resetSave(): Promise<void>;
}

function freshGame(cfg: GameConfig): GameState {
  return {
    companion: null,
    wallet: { crumbs: 0 },
    // Mode DEV : TOKEN illimités par défaut (aucun coût réel de toute façon).
    capacity: { budget: cfg.devCapacityBudget, used: 0, unlimited: true, tokenBag: 0 },
    memorial: [],
    bornAtIso: null,
    prestigePoints: 0,
    prestigeSkills: [],
  };
}

/** Rattrape les sauvegardes d'anciennes versions (génome, stades, boutique…). */
function migrateGame(game: GameState, cfg: GameConfig): GameState {
  const c = game.companion;
  if (c) {
    c.genome ??= generateGenome();
    c.tokensEaten ??= 0;
    c.foodHeat ??= {};
    c.cosmetics ??= { owned: [], equipped: [] };
    c.children ??= [];
    c.containerLevel ??= 0;
    c.weapons ??= [];
    c.activeEvent ??= null;
    // Ancien nom de stade (avant les 5 niveaux d'évolution).
    if ((c.stage as string) === 'child') c.stage = 'kid' as StageCode;
    if (c.nextEventAtActive === undefined) scheduleNextEvent(c, cfg);
    for (const sp of c.skills) {
      sp.level ??= sp.state === 'owned' ? 1 : 0;
      sp.upgrading ??= false;
    }
  }
  if (game.capacity.budget < cfg.devCapacityBudget) {
    game.capacity.budget = cfg.devCapacityBudget;
    game.capacity.used = 0;
  }
  game.capacity.unlimited ??= true;
  game.capacity.tokenBag ??= 0;
  game.prestigePoints ??= 0;
  game.prestigeSkills ??= [];
  return game;
}

/** Toast lisible pour les événements marquants du tick. */
function eventNotice(cfg: GameConfig, events: SimEvent[]): string | null {
  for (const e of events) {
    const def = e.data?.eventId ? eventById(cfg, String(e.data.eventId)) : undefined;
    switch (e.type) {
      case 'event-started':
        return `${def?.emoji ?? '⚠️'} ${def?.label ?? 'Menace'} — ${def?.threatText ?? 'clique dessus !'}`;
      case 'event-defended':
        return e.data?.auto
          ? `🛡️ Menace repoussée toute seule (${def?.label ?? '?'}) !`
          : `🎉 ${def?.label ?? 'Menace'} chassé !`;
      case 'event-lost':
        return def?.id === 'ufo-abduction'
          ? '🛸 Un OVNI a enlevé un petit… La famille est sous le choc.'
          : `😿 ${def?.label ?? 'Un pillard'} a frappé : −${e.data?.lost ?? '?'}`;
      case 'event-boon':
        return def?.id === 'crumb-rain'
          ? `🌧️ Pluie de miettes : +${e.data?.gain} !`
          : `🦋 ${def?.label ?? 'Un ami'} passe dire bonjour (+humeur)`;
      case 'auto-collected':
        return '🫙 Le Majordome a ramassé le pot.';
      default:
        break;
    }
  }
  return null;
}

let baseline: ReportBaseline | null = null;
let reactionSeq = 0;
let sinceSave = 0;

function snapshotBaseline(game: GameState): ReportBaseline | null {
  const c = game.companion;
  if (!c || c.dead || c.stage === 'egg') return null;
  return {
    activeSeconds: c.activeSeconds,
    crumbsTotal: game.wallet.crumbs + c.pendingCrumbs,
    satiety: c.satiety,
    mood: c.mood,
    events: [],
  };
}

export const useTokidachi = create<TokidachiStore>((set, get) => ({
  loaded: false,
  game: freshGame(DEFAULT_CONFIG),
  cfg: DEFAULT_CONFIG,
  providerId: 'dev',
  selectedCli: 'random',
  devMode: false,
  locked: false,
  reaction: null,
  notice: null,
  report: null,
  language: 'fr',
  notificationsEnabled: true,
  notifyThingsDone: true,
  notifyNeedsAttention: true,
  disableEnemies: false,

  backupId: '',
  cloudSyncEnabled: false,
  cloudServerUrl: 'https://tokidachi.bb-bbb.com',

  async init() {
    const save = await loadSave();
    const defaultBackupId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
      
    if (save) {
      const devMode = save.devMode ?? false;
      const disableEnemies = save.disableEnemies ?? false;
      const cfg = devMode ? { ...get().cfg } : { ...get().cfg, simSpeed: 1 };
      cfg.disableEnemies = disableEnemies;
      const backupId = save.backupId ?? defaultBackupId;
      set({
        game: migrateGame(save.game, get().cfg),
        providerId: save.providerId,
        selectedCli: save.selectedCli ?? 'random',
        devMode,
        cfg,
        disableEnemies,
        backupId,
        cloudSyncEnabled: save.cloudSyncEnabled ?? false,
        cloudServerUrl: save.cloudServerUrl ?? 'https://tokidachi.bb-bbb.com',
        language: save.language ?? 'fr',
        notificationsEnabled: save.notificationsEnabled ?? true,
        notifyThingsDone: save.notifyThingsDone ?? true,
        notifyNeedsAttention: save.notifyNeedsAttention ?? true,
        loaded: true,
      });
      if (!save.backupId) {
        void writeSave(makeSave(get()));
      }
    } else {
      set({
        backupId: defaultBackupId,
        loaded: true,
      });
    }
  },

  tick(dtSeconds) {
    const { game, locked, cfg } = get();
    const c = game.companion;
    if (locked) return;

    if (!c || c.dead) {
      const next = structuredClone(game);
      const s = dtSeconds * cfg.simSpeed;
      let crumbsEarned = 0;
      const HOUR = 3600;
      
      if (next.wallet.pea && next.wallet.pea > 0) {
        crumbsEarned += (next.wallet.pea * 0.05 / HOUR) * s;
      }
      
      if (next.prestigeSkills?.includes('graveyard') && next.memorial && next.memorial.length > 0) {
        const graveyardRate = next.memorial.reduce(
          (sum, m) => sum + Math.max(5, Math.floor(m.activeSeconds / 3600) * 0.5),
          0
        );
        crumbsEarned += (graveyardRate / HOUR) * s;
      }
      
      if (crumbsEarned > 0) {
        next.wallet.crumbs += crumbsEarned;
        set({ game: next });
        
        sinceSave += dtSeconds;
        if (sinceSave >= 30) {
          sinceSave = 0;
          void writeSave(makeSave(get()));
        }
      }
      return;
    }

    const next = structuredClone(game);
    next.wallet.memorial = next.memorial;
    next.wallet.prestigeSkills = next.prestigeSkills;
    const events = advanceSim(next.companion!, next.wallet, dtSeconds, cfg);
    baseline?.events.push(...events);
    const notice = eventNotice(cfg, events);
    set(notice ? { game: next, notice } : { game: next });

    if (events.length > 0 && get().notificationsEnabled) {
      const lang = get().language;
      const companionName = next.companion?.name || 'Tokidachi';
      for (const event of events) {
        const isThingsDone = ['hatched', 'evolved', 'skill-learned', 'skill-upgraded', 'recovered', 'auto-collected', 'event-defended', 'event-boon'].includes(event.type);
        const isNeedsAttention = ['got-hungry', 'got-sick', 'died', 'crumb-cap-reached', 'event-started', 'event-lost'].includes(event.type);

        if ((isThingsDone && get().notifyThingsDone) || (isNeedsAttention && get().notifyNeedsAttention)) {
          let title = '';
          let body = '';
          if (lang === 'fr') {
            switch (event.type) {
              case 'hatched':
                title = '🐣 Éclosion !';
                body = `${companionName} a éclos ! Viens faire sa connaissance.`;
                break;
              case 'evolved':
                const stageLabel = cfg.stages[event.data?.stage as StageCode]?.label || String(event.data?.stage);
                title = '🎉 Évolution !';
                body = `${companionName} a évolué en ${stageLabel} !`;
                break;
              case 'skill-learned':
                const skillLabel = skillById(cfg, String(event.data?.skillId))?.label || String(event.data?.skillId);
                title = '📖 Compétence apprise !';
                body = `${companionName} maîtrise désormais « ${skillLabel} ».`;
                break;
              case 'skill-upgraded':
                const upSkillLabel = skillById(cfg, String(event.data?.skillId))?.label || String(event.data?.skillId);
                title = '⭐ Compétence améliorée !';
                body = `${companionName} a amélioré « ${upSkillLabel} » au niveau ${event.data?.level}.`;
                break;
              case 'recovered':
                title = '💪 En pleine forme !';
                body = `${companionName} s'est rétabli et n'est plus malade.`;
                break;
              case 'auto-collected':
                title = '🫙 Majordome actif';
                body = 'Le Majordome a ramassé le pot de miettes.';
                break;
              case 'event-defended':
                const defEventLabel = eventById(cfg, String(event.data?.eventId))?.label || 'Une menace';
                title = '🛡️ Menace repoussée !';
                body = `${defEventLabel} a été repoussé avec succès.`;
                break;
              case 'event-boon':
                const boonEventLabel = eventById(cfg, String(event.data?.eventId))?.label || 'Un ami';
                title = '🦋 Visite amicale !';
                body = `${boonEventLabel} est de passage.`;
                break;
              case 'got-hungry':
                title = '🍽️ J\'ai faim !';
                body = `${companionName} a faim et a besoin d'être nourri.`;
                break;
              case 'got-sick':
                title = '😿 Malade...';
                body = `${companionName} ne se sent pas bien et est tombé malade !`;
                break;
              case 'died':
                title = '🪦 Triste nouvelle...';
                body = `${companionName} s'est éteint...`;
                break;
              case 'crumb-cap-reached':
                title = '🍞 Pot de miettes plein !';
                body = 'Le contenant de miettes est plein, pense à le vider.';
                break;
              case 'event-started':
                const threatLabel = eventById(cfg, String(event.data?.eventId))?.label || 'Menace';
                title = '⚠️ Alerte menace !';
                body = `Un ${threatLabel} est arrivé ! Chasse-le vite !`;
                break;
              case 'event-lost':
                const lostLabel = eventById(cfg, String(event.data?.eventId))?.label || 'Pillard';
                title = '😿 Dégâts subis';
                body = `Le ${lostLabel} a causé des dégâts avant de partir.`;
                break;
            }
          } else {
            switch (event.type) {
              case 'hatched':
                title = '🐣 Hatched!';
                body = `${companionName} has hatched! Come say hello.`;
                break;
              case 'evolved':
                const stageLabel = cfg.stages[event.data?.stage as StageCode]?.label || String(event.data?.stage);
                title = '🎉 Evolved!';
                body = `${companionName} has evolved into a ${stageLabel}!`;
                break;
              case 'skill-learned':
                const skillLabel = skillById(cfg, String(event.data?.skillId))?.label || String(event.data?.skillId);
                title = '📖 Skill learned!';
                body = `${companionName} has learned "${skillLabel}".`;
                break;
              case 'skill-upgraded':
                const upSkillLabel = skillById(cfg, String(event.data?.skillId))?.label || String(event.data?.skillId);
                title = '⭐ Skill upgraded!';
                body = `${companionName} has upgraded "${upSkillLabel}" to level ${event.data?.level}.`;
                break;
              case 'recovered':
                title = '💪 Fully recovered!';
                body = `${companionName} has fully recovered and is no longer sick.`;
                break;
              case 'auto-collected':
                title = '🫙 Butler active';
                body = 'The Butler has collected the crumb jar.';
                break;
              case 'event-defended':
                const defEventLabel = eventById(cfg, String(event.data?.eventId))?.label || 'A threat';
                title = '🛡️ Threat repelled!';
                body = `${defEventLabel} was successfully repelled.`;
                break;
              case 'event-boon':
                const boonEventLabel = eventById(cfg, String(event.data?.eventId))?.label || 'A friend';
                title = '🦋 Friendly visitor!';
                body = `${boonEventLabel} paid a visit.`;
                break;
              case 'got-hungry':
                title = '🍽️ Hungry!';
                body = `${companionName} is hungry and needs food.`;
                break;
              case 'got-sick':
                title = '😿 Sick...';
                body = `${companionName} fell sick! Take care of them.`;
                break;
              case 'died':
                title = '🪦 Sad news...';
                body = `${companionName} has passed away.`;
                break;
              case 'crumb-cap-reached':
                title = '🍞 Crumb jar full!';
                body = 'The crumb jar is full, don\'t forget to collect them.';
                break;
              case 'event-started':
                const threatLabel = eventById(cfg, String(event.data?.eventId))?.label || 'Threat';
                title = '⚠️ Threat alert!';
                body = `A ${threatLabel} is here! Shoo it away!`;
                break;
              case 'event-lost':
                const lostLabel = eventById(cfg, String(event.data?.eventId))?.label || 'Raider';
                title = '😿 Damage taken';
                body = `The ${lostLabel} caused damage before leaving.`;
                break;
            }
          }
          if (title && body) {
            void triggerNotification(title, body);
          }
        }
      }
    }

    if (events.some((e) => e.type === 'died')) {
      baseline = null;
      void writeSave(makeSave(get()));
      return;
    }

    sinceSave += dtSeconds;
    if (sinceSave >= 30) {
      sinceSave = 0;
      void writeSave(makeSave(get()));
    }
  },

  adopt(name) {
    const { game } = get();
    const next = structuredClone(game);
    next.companion = createCompanion(name);
    next.bornAtIso = new Date().toISOString();
    if (next.prestigeSkills?.includes('starter-crumbs')) {
      next.wallet.crumbs = (next.wallet.crumbs || 0) + 500;
    }
    set({ game: next });
    void writeSave(makeSave(get()));
  },

  tapEgg() {
    const { game, cfg } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = tapEggAction(next.companion!, cfg);
    if (res.ok) set({ game: next });
  },

  async feed(foodId) {
    const { game, cfg, providerId } = get();
    const c = game.companion;
    const food = foodById(cfg, foodId);
    if (!c || !food) return;

    const mods = skillModifiers(c, cfg);
    const cost = effectiveFoodCost(food, mods, c.foodHeat[food.id] ?? 0);

    if (food.currency === 'token' && providerId === 'cli') {
      const ok = await get().ensureTokensAvailable(cost);
      if (!ok) return;
    }

    const satietyBefore = c.satiety;
    const next = structuredClone(get().game); // Use updated game state after potential refilling
    const res = feedAction(next.companion!, next.wallet, next.capacity, food, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }

    if (food.currency === 'token' && providerId === 'cli') {
      next.capacity.tokenBag = Math.max(0, (next.capacity.tokenBag ?? 0) - cost);
    }

    const seq = ++reactionSeq;
    set({ game: next, reaction: { text: null, source: null, seq } });
    void writeSave(makeSave(get()));

    // Réaction au nourrissage (GDD §6.6) — via le provider branché.
    const fed = next.companion!;
    const ctx: ReactionContext = {
      stage: fed.stage,
      mood: fed.mood,
      moodBucket: moodBucket(fed.mood),
      vitality: fed.vitality,
      satietyBefore,
      foodLabel: food.label,
      satietyRestored: food.satiety,
      tier: reactionTier(food.satiety),
      currency: food.currency,
      cost,
      companionName: fed.name,
    };
    const reaction = await providerById(providerId).generateReaction(ctx);
    // N'affiche que si aucune réaction plus récente n'a été demandée entre-temps.
    if (get().reaction?.seq === seq) {
      set({ reaction: { text: reaction.text, source: reaction.source, seq } });
    }
  },

  play() {
    const { game, cfg } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = playAction(next.companion!, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }
    set({ game: next });
  },

  collect() {
    const { game } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = collectCrumbs(next.companion!, next.wallet);
    if (!res.ok) return;
    set({ game: next });
    void writeSave(makeSave(get()));
  },

  async learn(skillId) {
    const { game, cfg, providerId } = get();
    if (!game.companion) return;
    const def = skillById(cfg, skillId);
    if (!def) return;

    const cost = def.cost;
    if (def.costCurrency === 'token' && providerId === 'cli') {
      const ok = await get().ensureTokensAvailable(cost);
      if (!ok) return;
    }

    const next = structuredClone(get().game);
    const res = startLearning(next.companion!, next.wallet, next.capacity, skillId, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }

    if (def.costCurrency === 'token' && providerId === 'cli') {
      next.capacity.tokenBag = Math.max(0, (next.capacity.tokenBag ?? 0) - cost);
    }

    set({ game: next });
    void writeSave(makeSave(get()));
  },

  async upgrade(skillId) {
    const { game, cfg, providerId } = get();
    if (!game.companion) return;
    const def = skillById(cfg, skillId);
    if (!def) return;
    const sp = game.companion.skills.find((p) => p.skillId === skillId);
    if (!sp) return;

    const cost = upgradeCost(cfg, def.cost, sp.level + 1);
    if (def.costCurrency === 'token' && providerId === 'cli') {
      const ok = await get().ensureTokensAvailable(cost);
      if (!ok) return;
    }

    const next = structuredClone(get().game);
    const res = startUpgrade(next.companion!, next.wallet, next.capacity, skillId, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }

    if (def.costCurrency === 'token' && providerId === 'cli') {
      next.capacity.tokenBag = Math.max(0, (next.capacity.tokenBag ?? 0) - cost);
    }

    set({ game: next });
    void writeSave(makeSave(get()));
  },

  defend() {
    const { game, cfg } = get();
    if (!game.companion?.activeEvent) return;
    const next = structuredClone(game);
    const events = defendEvent(next.companion!, cfg);
    baseline?.events.push(...events);
    const notice = eventNotice(cfg, events);
    set(notice ? { game: next, notice } : { game: next });
    void writeSave(makeSave(get()));
  },

  buyCosmetic(id) {
    const { game, cfg } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = buyCosmeticAction(next.companion!, next.wallet, next.capacity, id, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }
    set({ game: next });
    void writeSave(makeSave(get()));
  },

  toggleCosmetic(id) {
    const { game, cfg } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = equipCosmeticAction(next.companion!, id, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }
    set({ game: next });
    void writeSave(makeSave(get()));
  },

  buyChild() {
    const { game, cfg } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = buyChildAction(next.companion!, next.wallet, next.capacity, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }
    set({ game: next, notice: '🥚 Un petit rejoint la famille !' });
    void writeSave(makeSave(get()));
  },

  buyWeapon(id) {
    const { game, cfg } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = buyWeaponAction(next.companion!, next.wallet, next.capacity, id, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }
    const label = cfg.weapons.find((w) => w.id === id)?.label ?? id;
    set({ game: next, notice: `🛡️ ${label} installé — les OVNIs vont déguster !` });
    void writeSave(makeSave(get()));
  },

  upgradeContainer() {
    const { game, cfg } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = upgradeContainerAction(next.companion!, next.wallet, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }
    const label = cfg.containers[next.companion!.containerLevel].label;
    set({ game: next, notice: `📦 Nouveau contenant : ${label} !` });
    void writeSave(makeSave(get()));
  },

  buryAndRestart(name) {
    const { game } = get();
    const dead = game.companion;
    if (!dead?.dead) return;
    const next = structuredClone(game);
    
    // Memorial
    next.memorial.push({
      name: dead.name,
      stage: dead.stage,
      activeSeconds: dead.activeSeconds,
      bornAtIso: game.bornAtIso ?? new Date().toISOString(),
      diedAtIso: new Date().toISOString(),
    });

    // Calculate prestige points: 0.5 per active hour + 1 per 2000 crumbs generated
    const days = dead.activeSeconds / 86400;
    const crumbsGen = dead.totalCrumbsGenerated || 0;
    const prestigeGained = Math.floor(days * 10 + crumbsGen / 2000);
    next.prestigePoints = (next.prestigePoints || 0) + prestigeGained;

    // Apply estate tax of 80% on crumbs if no vault (container Level 3)
    if (dead.containerLevel < 3) {
      next.wallet.crumbs = Math.round(next.wallet.crumbs * 0.2);
    }

    // Apply estate tax of 80% on PEA unless Paradis Fiscal (tax-shield) is owned
    const hasTaxShield = game.prestigeSkills?.includes('tax-shield');
    if (next.wallet.pea && !hasTaxShield) {
      next.wallet.pea = Math.round(next.wallet.pea * 0.2);
    }

    // New companion starting at egg
    const newComp = createCompanion(name);
    next.companion = newComp;
    next.bornAtIso = new Date().toISOString();

    // Starter crumbs prestige bonus (+500 crumbs)
    if (next.prestigeSkills?.includes('starter-crumbs')) {
      next.wallet.crumbs = (next.wallet.crumbs || 0) + 500;
    }

    set({
      game: next,
      reaction: null,
      report: null,
      notice: `🪦 Nouveau cycle commencé ! +${prestigeGained} Points de Prestige.`
    });
    void writeSave(makeSave(get()));
  },

  setLocked(locked) {
    const wasLocked = get().locked;
    if (locked && !wasLocked) {
      get().markAway();
      void writeSave(makeSave(get()));
    }
    set({ locked });
    if (!locked && wasLocked) get().markBack();
  },

  // Rapport de retour (GDD §7) : baseline posée quand le joueur s'absente
  // (blur/verrouillage), comparaison quand il revient.
  markAway() {
    if (!baseline) baseline = snapshotBaseline(get().game);
  },

  markBack() {
    const b = baseline;
    baseline = null;
    const { game } = get();
    const c = game.companion;
    if (!b || !c || c.stage === 'egg') return;
    const awaySeconds = c.activeSeconds - b.activeSeconds;
    const grave = b.events.some((e) =>
      ['died', 'evolved', 'skill-learned', 'got-sick', 'crumb-cap-reached'].includes(e.type),
    );
    if (awaySeconds < 120 && !grave) return; // rien d'intéressant à raconter
    set({
      report: {
        activeSecondsAway: awaySeconds,
        crumbsDelta: game.wallet.crumbs + c.pendingCrumbs - b.crumbsTotal,
        satietyDelta: c.satiety - b.satiety,
        moodDelta: c.mood - b.mood,
        events: b.events,
      },
    });
  },

  dismissReport: () => set({ report: null }),
  dismissNotice: () => set({ notice: null }),
  dismissReaction: () => set({ reaction: null }),

  setProvider(providerId) {
    set({ providerId });
    void writeSave(makeSave(get()));
  },

  setSelectedCli(selectedCli) {
    set({ selectedCli });
    void writeSave(makeSave(get()));
  },

  setLanguage(language) {
    set({ language });
    void writeSave(makeSave(get()));
  },

  setNotificationsEnabled(notificationsEnabled) {
    set({ notificationsEnabled });
    void writeSave(makeSave(get()));
  },

  setNotifyThingsDone(notifyThingsDone) {
    set({ notifyThingsDone });
    void writeSave(makeSave(get()));
  },

  setNotifyNeedsAttention(notifyNeedsAttention) {
    set({ notifyNeedsAttention });
    void writeSave(makeSave(get()));
  },

  unlockDevMode(key) {
    if (key.trim() === 'CLAUDIUSMAXIMUS') {
      set({ devMode: true, notice: "Mode Dev activé !" });
    } else {
      set({ notice: "Clé secrète incorrecte !" });
    }
    void writeSave(makeSave(get()));
  },

  disableDevMode() {
    const nextCfg = { ...get().cfg, simSpeed: 1 };
    const nextGame = structuredClone(get().game);
    nextGame.capacity.unlimited = false;
    set({
      devMode: false,
      cfg: nextCfg,
      game: nextGame,
      notice: "Mode Dev désactivé !",
    });
    void writeSave(makeSave(get()));
  },

  addTokensToBag(tokens, cliName) {
    const next = structuredClone(get().game);
    next.capacity.tokenBag = (next.capacity.tokenBag ?? 0) + tokens;
    set({
      game: next,
      notice: `Obtenu +${tokens.toLocaleString()} TOKEN via ${cliName.toUpperCase()} ! Envoyé dans le sac.`
    });
    void writeSave(makeSave(get()));
  },

  async ensureTokensAvailable(cost) {
    const { game, providerId } = get();
    if (providerId !== 'cli') return true;

    let bag = game.capacity.tokenBag ?? 0;
    if (bag >= cost) return true;

    while (bag < cost) {
      const needed = cost - bag;
      const selectedCli = get().selectedCli;
      const cli = selectedCli === 'random' ? pickCli() : selectedCli;
      const question = pickRandomQuestion();
      const language = get().language;
      const promptSuffix = language === 'fr'
        ? '(Réponds en français en 1 seule phrase très courte de maximum 12 mots)'
        : '(Please answer in English in 1 very short sentence of max 12 words)';
      const prompt = `${question} ${promptSuffix}`;
      
      const seq = ++reactionSeq;
      set({ 
        reaction: { 
          text: `[${cli.toUpperCase()}] Remplissage du sac... (Besoin de ${needed.toLocaleString()} de plus)`,
          source: 'ai',
          seq
        } 
      });
      
      const result = await runCliQuery(cli, prompt);
      if (result.success && result.tokens_consumed > 0) {
        const added = result.tokens_consumed;
        const shortened = shortenResponse(result.response);
        bag += added;
        
        const next = structuredClone(get().game);
        next.capacity.tokenBag = bag;
        set({
          game: next,
          reaction: {
            text: `[${result.cli_used.toUpperCase()}] ${shortened} (+${added.toLocaleString()} tokens)`,
            source: 'ai',
            seq
          }
        });
        void writeSave(makeSave(get()));
        
        if (bag < cost) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } else {
        const fallback = 10000;
        bag += fallback;
        const next = structuredClone(get().game);
        next.capacity.tokenBag = bag;
        set({
          game: next,
          notice: `L'appel CLI a échoué (${result.error || 'erreur'}). Ajout d'urgence de +${fallback.toLocaleString()} TOKEN.`,
          reaction: {
            text: "Oups, le terminal a bogué...",
            source: 'scripted',
            seq
          }
        });
        void writeSave(makeSave(get()));
        break;
      }
    }
    
    return true;
  },

  setSimSpeed(x) {
    if (!get().devMode && x !== 1) {
      set({ notice: "Activez le mode Dev pour modifier la vitesse !" });
      return;
    }
    set({ cfg: { ...get().cfg, simSpeed: x } });
  },

  refillCapacity() {
    const next = structuredClone(get().game);
    next.capacity.used = 0;
    set({ game: next });
  },

  setUnlimitedTokens(on) {
    const next = structuredClone(get().game);
    next.capacity.unlimited = on;
    set({ game: next });
    void writeSave(makeSave(get()));
  },

  setCloudSyncEnabled(enabled) {
    set({ cloudSyncEnabled: enabled });
    void writeSave(makeSave(get()));
  },

  setCloudServerUrl(url) {
    set({ cloudServerUrl: url });
    void writeSave(makeSave(get()));
  },

  regenerateBackupId() {
    const backupId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
    set({ backupId });
    void writeSave(makeSave(get()));
  },

  async triggerCloudSync() {
    const { backupId, cloudServerUrl } = get();
    if (!backupId || !cloudServerUrl) return false;
    
    try {
      const url = `${cloudServerUrl.replace(/\/$/, '')}/api/sync`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupId,
          saveData: makeSave(get()),
          submitToLeaderboard: true,
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('Tokidachi: Sync error', err);
      return false;
    }
  },

  async restoreFromCloud(targetBackupId) {
    const { cloudServerUrl } = get();
    if (!targetBackupId || !cloudServerUrl) return false;
    
    try {
      const url = `${cloudServerUrl.replace(/\/$/, '')}/api/restore/${targetBackupId}`;
      const res = await fetch(url);
      if (!res.ok) return false;
      
      const data = await res.json();
      if (data && data.saveData) {
        const saveData = data.saveData;
        const devMode = saveData.devMode ?? false;
        const cfg = devMode ? get().cfg : { ...get().cfg, simSpeed: 1 };
        
        // Reset baseline
        baseline = null;
        
        set({
          game: migrateGame(saveData.game, get().cfg),
          providerId: saveData.providerId,
          selectedCli: saveData.selectedCli ?? 'random',
          devMode,
          cfg,
          backupId: targetBackupId,
          cloudSyncEnabled: saveData.cloudSyncEnabled ?? true,
          cloudServerUrl: saveData.cloudServerUrl ?? cloudServerUrl,
          language: saveData.language ?? 'fr',
          reaction: null,
          report: null,
          notice: "Sauvegarde restaurée !",
        });
        
        void writeSave(makeSave(get()));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Tokidachi: Restore error', err);
      return false;
    }
  },

  succeed(childIndex, newName) {
    const { game } = get();
    const dead = game.companion;
    if (!dead?.dead) return;
    const childGenome = dead.children[childIndex];
    const next = structuredClone(game);
    
    // Memorial
    next.memorial.push({
      name: dead.name,
      stage: dead.stage,
      activeSeconds: dead.activeSeconds,
      bornAtIso: game.bornAtIso ?? new Date().toISOString(),
      diedAtIso: new Date().toISOString(),
    });

    // Calculate prestige points: 0.5 per active hour + 1 per 2000 crumbs generated
    const days = dead.activeSeconds / 86400;
    const crumbsGen = dead.totalCrumbsGenerated || 0;
    const prestigeGained = Math.floor(days * 10 + crumbsGen / 2000);
    next.prestigePoints = (next.prestigePoints || 0) + prestigeGained;

    // Apply estate tax of 80% on crumbs if no vault (container Level 3)
    if (dead.containerLevel < 3) {
      next.wallet.crumbs = Math.round(next.wallet.crumbs * 0.2);
    }

    // Apply estate tax of 80% on PEA unless Paradis Fiscal (tax-shield) is owned
    const hasTaxShield = game.prestigeSkills?.includes('tax-shield');
    if (next.wallet.pea && !hasTaxShield) {
      next.wallet.pea = Math.round(next.wallet.pea * 0.2);
    }

    // New companion directly in BLOB
    const newComp = createCompanion(newName);
    newComp.genome = childGenome;
    newComp.stage = 'blob'; // Succession starts directly in BLOB!
    newComp.satiety = 80;
    newComp.vitality = 100;
    newComp.mood = 70;
    
    // Inherit owned skills
    newComp.skills = dead.skills.filter((sp) => sp.state === 'owned').map((sp) => ({
      ...sp,
      trainedSeconds: 0,
      upgrading: false,
    }));
    
    // Filter out the selected child
    newComp.children = dead.children.filter((_, idx) => idx !== childIndex);

    next.companion = newComp;
    next.bornAtIso = new Date().toISOString();

    // Starter crumbs prestige bonus (+500 crumbs)
    if (next.prestigeSkills?.includes('starter-crumbs')) {
      next.wallet.crumbs = (next.wallet.crumbs || 0) + 500;
    }

    set({
      game: next,
      reaction: null,
      report: null,
      notice: `✨ Successeur désigné avec succès ! +${prestigeGained} Points de Prestige.`,
    });
    void writeSave(makeSave(get()));
  },

  depositToPea(amount) {
    const { game } = get();
    if (game.wallet.crumbs < amount) return;
    const next = structuredClone(game);
    next.wallet.crumbs -= amount;
    next.wallet.pea = (next.wallet.pea || 0) + amount;
    set({ game: next, notice: `💼 Déposé 🍞 ${amount.toLocaleString()} dans le PEA !` });
    void writeSave(makeSave(get()));
  },

  prestigeEarly() {
    const { game } = get();
    const c = game.companion;
    if (!c) return;
    const next = structuredClone(game);
    
    // Add memorial entry
    next.memorial.push({
      name: c.name,
      stage: c.stage,
      activeSeconds: c.activeSeconds,
      bornAtIso: game.bornAtIso ?? new Date().toISOString(),
      diedAtIso: new Date().toISOString(),
    });

    // Calculate prestige points: 0.5 per active hour + 1 per 2000 crumbs generated
    const days = c.activeSeconds / 86400;
    const crumbsGen = c.totalCrumbsGenerated || 0;
    const prestigeGained = Math.floor(days * 10 + crumbsGen / 2000);
    next.prestigePoints = (next.prestigePoints || 0) + prestigeGained;

    // Apply estate tax of 80% on crumbs if no vault (container Level 3)
    if (c.containerLevel < 3) {
      next.wallet.crumbs = Math.round(next.wallet.crumbs * 0.2);
    }

    // Apply estate tax of 80% on PEA unless Paradis Fiscal (tax-shield) is owned
    const hasTaxShield = game.prestigeSkills?.includes('tax-shield');
    if (next.wallet.pea && !hasTaxShield) {
      next.wallet.pea = Math.round(next.wallet.pea * 0.2);
    }

    // New companion starting at egg
    const newComp = createCompanion(c.name);
    next.companion = newComp;
    next.bornAtIso = new Date().toISOString();

    // Starter crumbs prestige bonus (+500 crumbs)
    if (next.prestigeSkills?.includes('starter-crumbs')) {
      next.wallet.crumbs = (next.wallet.crumbs || 0) + 500;
    }

    set({
      game: next,
      reaction: null,
      report: null,
      notice: `✨ Prestige précoce effectué ! +${prestigeGained} Points de Prestige.`
    });
    void writeSave(makeSave(get()));
  },

  buyPrestigeSkill(skillId) {
    const { game } = get();
    const skill = PRESTIGE_SKILLS.find(s => s.id === skillId);
    if (!skill) return;
    const currentPoints = game.prestigePoints || 0;
    if (currentPoints < skill.cost) {
      set({ notice: "Pas assez de Points de Prestige !" });
      return;
    }
    const owned = game.prestigeSkills || [];
    if (owned.includes(skillId)) return;
    
    const next = structuredClone(game);
    next.prestigePoints = currentPoints - skill.cost;
    next.prestigeSkills = [...owned, skillId];
    
    set({ game: next, notice: `✨ Acheté : ${skill.label} !` });
    void writeSave(makeSave(get()));
  },

  setDisableEnemies(disabled) {
    const nextCfg = { ...get().cfg, disableEnemies: disabled };
    set({ disableEnemies: disabled, cfg: nextCfg });
    void writeSave(makeSave(get()));
  },

  async resetSave() {
    baseline = null;
    await clearSave();
    set({ game: freshGame(get().cfg), reaction: null, report: null, notice: null });
  },
}));

async function triggerNotification(title: string, body: string) {
  const { isTauri } = await import('./persist');
  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === 'granted';
      }
      if (granted) {
        sendNotification({ title, body });
      }
    } catch (err) {
      console.error('Failed to dispatch Tauri notification', err);
    }
  } else if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, { body });
      }
    }
  }
}

function makeSave(s: TokidachiStore) {
  return {
    version: 1 as const,
    game: s.game,
    providerId: s.providerId,
    selectedCli: s.selectedCli,
    devMode: s.devMode,
    disableEnemies: s.disableEnemies,
    notificationsEnabled: s.notificationsEnabled,
    notifyThingsDone: s.notifyThingsDone,
    notifyNeedsAttention: s.notifyNeedsAttention,
    savedAtIso: new Date().toISOString(),
    backupId: s.backupId,
    cloudSyncEnabled: s.cloudSyncEnabled,
    cloudServerUrl: s.cloudServerUrl,
    language: s.language,
  };
}

// ————— Boucle de jeu et bootstrap —————
// dt mesuré sur une horloge monotone (performance.now) : l'horloge système
// modifiable n'influence pas les gains (GDD §10, anti-triche horloge).
//
// ⚠️ HMR : ce module peut être RÉ-EXÉCUTÉ à chaud (vite), ce qui recrée le
// store avec loaded=false. Les gardes vivent donc sur `window`, et l'init est
// relancée à chaque exécution du module — sinon l'app reste bloquée sur « … ».

interface TokidachiGlobals {
  __tokidachiLoopId?: ReturnType<typeof setInterval>;
  __tokidachiStore?: typeof useTokidachi;
}

export function startGameLoop(): void {
  const g = window as unknown as TokidachiGlobals;
  if (g.__tokidachiLoopId !== undefined) clearInterval(g.__tokidachiLoopId);
  let last = performance.now();
  g.__tokidachiLoopId = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    // dt aberrant (mise en veille sans événement de lock) : on ignore au-delà
    // de 5 min d'un coup — prudence contre le temps qui « saute ».
    const store = g.__tokidachiStore ?? useTokidachi;
    if (dt > 0 && dt < 300) store.getState().tick(dt);
  }, 1000);
}

if (typeof window !== 'undefined') {
  // Toujours pointer vers l'instance de store la plus récente (post-HMR),
  // pour que la boucle et les listeners de session ne parlent pas à un mort.
  (window as unknown as TokidachiGlobals).__tokidachiStore = useTokidachi;
  startGameLoop();
  void useTokidachi.getState().init();
}

/** Store courant, même après remplacement à chaud du module. */
export function liveStore(): typeof useTokidachi {
  return (window as unknown as TokidachiGlobals).__tokidachiStore ?? useTokidachi;
}
