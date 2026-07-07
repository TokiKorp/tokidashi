// Store zustand : l'état du jeu, la boucle de tick, et le pont entre l'UI,
// la simulation pure (src/game) et l'AIProvider (src/ai).
//
// Règle d'or (GDD §6.1) : la simulation n'avance que sur du temps ACTIF —
// session déverrouillée et app en vie. Le verrouillage gèle tout.

import { create } from 'zustand';
import { providerById } from '../ai';
import type { ReactionContext } from '../ai';
import {
  buyChild as buyChildAction,
  buyCosmetic as buyCosmeticAction,
  collectCrumbs,
  createCompanion,
  equipCosmetic as equipCosmeticAction,
  feed as feedAction,
  play as playAction,
  startLearning,
  startUpgrade,
  tapEgg as tapEggAction,
} from '../game/actions';
import { DEFAULT_CONFIG, eventById, foodById, type GameConfig } from '../game/config';
import { generateGenome } from '../game/genome';
import { moodBucket, reactionTier } from '../game/reactions';
import { advanceSim, defendEvent, scheduleNextEvent } from '../game/sim';
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
  locked: boolean;
  reaction: ReactionBubble | null;
  notice: string | null;
  report: ReturnReport | null;

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
  buryAndRestart(name: string): void;
  setLocked(locked: boolean): void;
  markAway(): void;
  markBack(): void;
  dismissReport(): void;
  dismissNotice(): void;
  dismissReaction(): void;

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
    capacity: { budget: cfg.devCapacityBudget, used: 0, unlimited: true },
    memorial: [],
    bornAtIso: null,
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
        return `😿 ${def?.label ?? 'Un pillard'} a frappé : −${e.data?.lost ?? '?'}`;
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
  locked: false,
  reaction: null,
  notice: null,
  report: null,

  async init() {
    const save = await loadSave();
    if (save) {
      set({
        game: migrateGame(save.game, get().cfg),
        providerId: save.providerId,
        loaded: true,
      });
    } else {
      set({ loaded: true });
    }
  },

  tick(dtSeconds) {
    const { game, locked, cfg } = get();
    const c = game.companion;
    if (locked || !c || c.dead) return;

    const next = structuredClone(game);
    const events = advanceSim(next.companion!, next.wallet, dtSeconds, cfg);
    baseline?.events.push(...events);
    const notice = eventNotice(cfg, events);
    set(notice ? { game: next, notice } : { game: next });

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

    const satietyBefore = c.satiety;
    const next = structuredClone(game);
    const res = feedAction(next.companion!, next.wallet, next.capacity, food, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
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
      cost: food.cost,
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

  learn(skillId) {
    const { game, cfg } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = startLearning(next.companion!, next.wallet, next.capacity, skillId, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
    }
    set({ game: next });
    void writeSave(makeSave(get()));
  },

  upgrade(skillId) {
    const { game, cfg } = get();
    if (!game.companion) return;
    const next = structuredClone(game);
    const res = startUpgrade(next.companion!, next.wallet, next.capacity, skillId, cfg);
    if (!res.ok) {
      set({ notice: res.reason });
      return;
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

  buryAndRestart(name) {
    const { game } = get();
    const dead = game.companion;
    if (!dead?.dead) return;
    const next = structuredClone(game);
    // Mémorial (GDD §8.3) : deuil + fierté, sans mécanique. Zéro héritage pour
    // l'instant (sous-décision §13.2 ouverte) — le portefeuille et la capacité
    // restent, seuls le Compagnon et ses compétences sont perdus.
    next.memorial.push({
      name: dead.name,
      stage: dead.stage,
      activeSeconds: dead.activeSeconds,
      bornAtIso: game.bornAtIso ?? new Date().toISOString(),
      diedAtIso: new Date().toISOString(),
    });
    next.companion = createCompanion(name);
    next.bornAtIso = new Date().toISOString();
    set({ game: next, reaction: null, report: null });
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

  setSimSpeed(x) {
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

  async resetSave() {
    baseline = null;
    await clearSave();
    set({ game: freshGame(get().cfg), reaction: null, report: null, notice: null });
  },
}));

function makeSave(s: TokidachiStore) {
  return {
    version: 1 as const,
    game: s.game,
    providerId: s.providerId,
    savedAtIso: new Date().toISOString(),
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
