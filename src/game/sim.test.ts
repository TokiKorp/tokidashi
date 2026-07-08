// Tests du cœur de simulation : l'ordre de dégradation (GDD §4.1), l'économie
// de la bascule (GDD §5.1) et le nourrissage. Tout est en temps ACTIF simulé.

import { describe, expect, it } from 'vitest';
import {
  buyChild,
  buyCosmetic,
  buyTurret,
  clickPet,
  collectCrumbs,
  createCompanion,
  equipCosmetic,
  feed,
  play,
  startLearning,
  startUpgrade,
  tapEgg,
  upgradeContainer,
} from './actions';
import { DEFAULT_CONFIG, foodById, skillById, turretAmmoCost, type GameConfig } from './config';
import { growthFactor } from './genome';
import {
  advanceSim,
  clickValue,
  crumbCap,
  crumbRatePerHour,
  defendEvent,
  levelScale,
  scheduleNextEvent,
  upgradeCost,
  visibleState,
} from './sim';
import type { CapacityGauge, CompanionState, SimEvent, WalletState } from './types';

// baseTimeScale figé à 1 ici : les tests raisonnent en secondes actives "brutes" ;
// le ×1.25 de rythme de croisière est vérifié isolément (cf. describe dédié plus bas).
const cfg: GameConfig = { ...DEFAULT_CONFIG, baseTimeScale: 1 };
const HOUR = 3600;

function hatchedBlob(): CompanionState {
  const c = createCompanion('Testi');
  for (let i = 0; i < cfg.eggTapsToHatch; i++) tapEgg(c, cfg);
  // Les événements aléatoires sont testés à part — on les neutralise ici
  // pour garder les autres tests déterministes.
  c.nextEventAtActive = Infinity;
  return c;
}

function child(): CompanionState {
  const c = hatchedBlob();
  c.stage = 'kid';
  c.xp = 250;
  return c;
}

function wallet(crumbs = 0): WalletState {
  return { crumbs };
}

function capacity(budget = 1_000_000): CapacityGauge {
  return { budget, used: 0 };
}

describe('œuf', () => {
  it('éclot après le bon nombre de tapotements', () => {
    const c = createCompanion('Testi');
    for (let i = 0; i < cfg.eggTapsToHatch - 1; i++) tapEgg(c, cfg);
    expect(c.stage).toBe('egg');
    tapEgg(c, cfg);
    expect(c.stage).toBe('blob');
  });

  it("éclot tout seul après le temps d'incubation", () => {
    const c = createCompanion('Testi');
    const events = advanceSim(c, wallet(), cfg.eggHatchSeconds + 60, cfg);
    expect(c.stage).toBe('blob');
    expect(events.some((e) => e.type === 'hatched')).toBe(true);
  });

  it('ne consomme rien (métabolisme nul)', () => {
    const c = createCompanion('Testi');
    const satiety = c.satiety;
    advanceSim(c, wallet(), cfg.eggHatchSeconds / 2, cfg);
    expect(c.satiety).toBe(satiety);
  });
});

describe('métabolisme et dégradation (Faim → Humeur → Vitalité → Maladie → Mort)', () => {
  it('draine la Satiété au rythme du stade', () => {
    const c = hatchedBlob();
    c.satiety = 80;
    advanceSim(c, wallet(), HOUR, cfg);
    expect(c.satiety).toBeCloseTo(80 - cfg.stages.blob.metabolismPerHour, 1);
  });

  it("signale la faim au franchissement du seuil, l'humeur suit", () => {
    const c = hatchedBlob();
    c.satiety = 26;
    c.mood = 60;
    const events = advanceSim(c, wallet(), HOUR, cfg);
    expect(events.some((e) => e.type === 'got-hungry')).toBe(true);
    expect(c.mood).toBeLessThan(60);
    expect(visibleState(c, cfg)).toBe('hungry');
  });

  it('la Vitalité ne baisse que Satiété à zéro, puis maladie, puis mort', () => {
    const c = hatchedBlob();
    c.satiety = 0;
    c.vitality = 100;
    const events = advanceSim(c, wallet(), 2 * HOUR, cfg);
    expect(c.vitality).toBeLessThan(30);
    expect(c.sick).toBe(true);
    expect(events.some((e) => e.type === 'got-sick')).toBe(true);
    expect(c.dead).toBe(false);

    // Vitalité 0 prolongée → mort (permadeath).
    const more = advanceSim(c, wallet(), 3 * HOUR, cfg);
    expect(c.dead).toBe(true);
    expect(more.some((e) => e.type === 'died')).toBe(true);
  });

  it("récupère de la Vitalité tant qu'il est bien nourri", () => {
    const c = hatchedBlob();
    c.satiety = 90;
    c.vitality = 31; // presque malade mais bien nourri
    const events = advanceSim(c, wallet(), HOUR, cfg);
    expect(c.vitality).toBeGreaterThan(31);
    expect(events.some((e) => e.type === 'got-sick')).toBe(false);
  });

  it('la mort est un état terminal : la sim ne bouge plus', () => {
    const c = hatchedBlob();
    c.dead = true;
    const snapshot = { ...c };
    advanceSim(c, wallet(), HOUR, cfg);
    expect(c.satiety).toBe(snapshot.satiety);
  });
});

describe('nourrissage et paiement', () => {
  it('paie en Miettes et restaure la Satiété', () => {
    const c = hatchedBlob();
    c.satiety = 40;
    const w = wallet(20);
    const res = feed(c, w, capacity(), foodById(cfg, 'kibble')!, cfg);
    expect(res.ok).toBe(true);
    expect(w.crumbs).toBe(5);
    expect(c.satiety).toBe(70);
  });

  it('refuse sans le sou, sans effet de bord', () => {
    const c = hatchedBlob();
    c.satiety = 40;
    const w = wallet(3);
    const res = feed(c, w, capacity(), foodById(cfg, 'kibble')!, cfg);
    expect(res.ok).toBe(false);
    expect(w.crumbs).toBe(3);
    expect(c.satiety).toBe(40);
  });

  it('les repas TOKEN consomment la capacité et font grossir (tokensEaten)', () => {
    const c = hatchedBlob();
    c.satiety = 10;
    const feast = foodById(cfg, 'premium-feast')!;
    const cap = capacity();
    const res = feed(c, wallet(), cap, feast, cfg);
    expect(res.ok).toBe(true);
    expect(cap.used).toBe(feast.cost);
    expect(c.tokensEaten).toBe(feast.cost);
    expect(c.satiety).toBe(100);
  });

  it('refuse quand la capacité est épuisée (jamais de dépense cachée)', () => {
    const c = hatchedBlob();
    const feast = foodById(cfg, 'premium-feast')!;
    const cap: CapacityGauge = { budget: feast.cost, used: 1 };
    const res = feed(c, wallet(), cap, feast, cfg);
    expect(res.ok).toBe(false);
    expect(cap.used).toBe(1);
  });

  it('capacité illimitée (mode DEV) : nourrit sans jamais refuser', () => {
    const c = hatchedBlob();
    const feast = foodById(cfg, 'premium-feast')!;
    const cap: CapacityGauge = { budget: 0, used: 0, unlimited: true };
    const res = feed(c, wallet(), cap, feast, cfg);
    expect(res.ok).toBe(true);
    expect(c.tokensEaten).toBe(feast.cost);
  });

  it("un œuf ne mange pas", () => {
    const c = createCompanion('Testi');
    const res = feed(c, wallet(100), capacity(), foodById(cfg, 'kibble')!, cfg);
    expect(res.ok).toBe(false);
  });

  it('les prix chauffent au spam puis redescendent avec le temps actif', () => {
    const c = hatchedBlob();
    const kibble = foodById(cfg, 'kibble')!;
    const w = wallet(10_000);
    const cap = capacity();

    // Spam : chaque achat renchérit le suivant.
    feed(c, w, cap, kibble, cfg); // 15
    const after1 = 10_000 - w.crumbs;
    feed(c, w, cap, kibble, cfg); // ceil(15 × 1,6) = 24
    const after2 = 10_000 - w.crumbs - after1;
    expect(after1).toBe(kibble.cost);
    expect(after2).toBeGreaterThan(after1);

    // Le temps actif fait retomber la chauffe → prix de base retrouvé.
    c.satiety = 100;
    advanceSim(c, w, 2 * HOUR, cfg);
    expect(c.foodHeat[kibble.id] ?? 0).toBeLessThan(0.05);
  });
});

describe('compétences : la bascule vers l\'autosuffisance', () => {
  it('un blob ne peut pas apprendre (pas de slot)', () => {
    const c = hatchedBlob();
    const res = startLearning(c, wallet(500), capacity(), 'crumb-forage', cfg);
    expect(res.ok).toBe(false);
  });

  it("apprend après le temps d'étude, puis produit des Miettes plafonnées", () => {
    const c = child();
    const w = wallet();
    const cap = capacity();
    const res = startLearning(c, w, cap, 'crumb-forage', cfg);
    expect(res.ok).toBe(true);
    expect(cap.used).toBe(skillById(cfg, 'crumb-forage')!.cost);

    // Pendant l'étude : état "working", pas encore de production.
    expect(visibleState(c, cfg)).toBe('working');
    let events = advanceSim(c, w, cfg.skills[0].trainSeconds + 60, cfg);
    expect(events.some((e) => e.type === 'skill-learned')).toBe(true);

    // Production modulée par l'humeur, plafonnée à N heures (GDD §7).
    // Métabolisme ET évolution neutralisés pour isoler la production.
    const noHunger: GameConfig = {
      ...cfg,
      stages: {
        ...cfg.stages,
        kid: { ...cfg.stages.kid, metabolismPerHour: 0, xpToNext: null },
      },
    };
    const forageRate = skillById(cfg, 'crumb-forage')!.crumbsPerHour!;
    c.mood = 50; // multiplicateur ×1
    c.satiety = 100;
    const before = c.pendingCrumbs;
    advanceSim(c, w, HOUR, noHunger);
    expect(c.pendingCrumbs - before).toBeCloseTo(forageRate, 0);

    events = advanceSim(c, w, 100 * HOUR, noHunger);
    expect(c.pendingCrumbs).toBeLessThanOrEqual(crumbCap(c, noHunger));
    expect(events.some((e) => e.type === 'crumb-cap-reached')).toBe(true);
  });

  it("l'humeur module le rendement (×0,5 grognon, ×1,3 heureux)", () => {
    const grognon = child();
    grognon.skills = [{ skillId: 'crumb-forage', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    grognon.satiety = 100;
    grognon.mood = 10;
    advanceSim(grognon, wallet(), HOUR, cfg);

    const heureux = child();
    heureux.skills = [{ skillId: 'crumb-forage', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    heureux.satiety = 100;
    heureux.mood = 90;
    advanceSim(heureux, wallet(), HOUR, cfg);

    const rate = skillById(cfg, 'crumb-forage')!.crumbsPerHour!;
    expect(grognon.pendingCrumbs).toBeCloseTo(rate * 0.5, 0);
    expect(heureux.pendingCrumbs).toBeCloseTo(rate * 1.3, 0);
  });

  it("s'auto-nourrit avec ses Miettes quand il a faim (jamais avec les TOKEN)", () => {
    const c = child();
    c.skills = [
      { skillId: 'crumb-forage', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false },
      { skillId: 'auto-feeder', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false },
    ];
    c.satiety = 29;
    c.pendingCrumbs = 100;
    const w = wallet(0);
    const events = advanceSim(c, w, 60, cfg);
    expect(events.some((e) => e.type === 'auto-fed')).toBe(true);
    expect(c.satiety).toBeGreaterThan(29);
  });

  it('régime permanent : la branche Production complète rend autosuffisant', () => {
    // La promesse morale du jeu (GDD §12) : la voie gratuite est viable.
    // Avec la chauffe des prix, l'autonomie totale demande les DEUX
    // compétences de production — c'est le haut de la branche.
    const c = child();
    c.skills = [
      { skillId: 'crumb-forage', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false },
      { skillId: 'bakery', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false },
      { skillId: 'auto-feeder', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false },
    ];
    c.satiety = 80;
    c.mood = 80;
    const w = wallet(50);
    advanceSim(c, w, 8 * HOUR, cfg);
    expect(c.dead).toBe(false);
    expect(c.vitality).toBeGreaterThan(0);
  });

  it("l'arbre impose ses prérequis : pas de Boulangerie sans Ramasse-miettes", () => {
    const c = child();
    const res = startLearning(c, wallet(1000), capacity(), 'bakery', cfg);
    expect(res.ok).toBe(false);

    c.skills = [{ skillId: 'crumb-forage', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    const res2 = startLearning(c, wallet(1000), capacity(), 'bakery', cfg);
    expect(res2.ok).toBe(true);
  });

  it('monte de niveau : coût croissant, ré-étude, effet amplifié', () => {
    const forage = skillById(cfg, 'crumb-forage')!;
    const c = child();
    c.skills = [{ skillId: 'crumb-forage', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    const w = wallet();
    const cap = capacity();

    const res = startUpgrade(c, w, cap, 'crumb-forage', cfg);
    expect(res.ok).toBe(true);
    expect(cap.used).toBe(upgradeCost(cfg, forage.cost, 2)); // 5 000 × 1,8 = 9 000
    expect(visibleState(c, cfg)).toBe('working');

    // L'étude d'amélioration prend le même temps ; le niveau 1 produit pendant.
    const noHunger: GameConfig = {
      ...cfg,
      stages: { ...cfg.stages, kid: { ...cfg.stages.kid, metabolismPerHour: 0 } },
    };
    c.satiety = 100;
    const events = advanceSim(c, w, forage.trainSeconds + 60, noHunger);
    expect(events.some((e) => e.type === 'skill-upgraded')).toBe(true);
    expect(c.skills[0].level).toBe(2);

    // Effet niveau 2 : production ×1,5 à humeur neutre.
    c.mood = 50;
    c.pendingCrumbs = 0;
    advanceSim(c, w, HOUR, noHunger);
    expect(c.pendingCrumbs).toBeCloseTo(forage.crumbsPerHour! * levelScale(cfg, 2), 0);
  });

  it('niveau max respecté et une seule étude à la fois', () => {
    const c = child();
    c.skills = [
      { skillId: 'crumb-forage', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false },
      { skillId: 'auto-feeder', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false },
    ];
    // Garde-manger : maxLevel 1 → pas d'amélioration.
    expect(startUpgrade(c, wallet(99_999), capacity(), 'auto-feeder', cfg).ok).toBe(false);
    // Une amélioration se lance…
    expect(startUpgrade(c, wallet(99_999), capacity(), 'crumb-forage', cfg).ok).toBe(true);
    // …mais une seule étude à la fois.
    expect(startUpgrade(c, wallet(99_999), capacity(), 'crumb-forage', cfg).ok).toBe(false);
  });

  it('le Blob peut apprendre les racines de son stade (1 slot)', () => {
    const c = hatchedBlob();
    const res = startLearning(c, wallet(500), capacity(), 'hug-expert', cfg);
    expect(res.ok).toBe(true);
    // …mais une seule : le slot est occupé.
    const res2 = startLearning(c, wallet(500), capacity(), 'lean-stomach', cfg);
    expect(res2.ok).toBe(false);
  });

  it("les compétences d'Efficacité et de Conversion mordent vraiment", () => {
    // Estomac économe : métabolisme réduit selon la définition.
    const metaMult = skillById(cfg, 'lean-stomach')!.metabolismMultiplier!;
    const eco = child();
    eco.skills = [{ skillId: 'lean-stomach', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    eco.satiety = 100;
    const temoin = child();
    temoin.satiety = 100;
    advanceSim(eco, wallet(), HOUR, cfg);
    advanceSim(temoin, wallet(), HOUR, cfg);
    expect(100 - eco.satiety).toBeCloseTo((100 - temoin.satiety) * metaMult, 1);

    // Fin gourmet : croquette moins chère.
    const foodMult = skillById(cfg, 'gourmet')!.foodCostMultiplier!;
    const kibble = foodById(cfg, 'kibble')!;
    const gourmet = child();
    gourmet.skills = [{ skillId: 'gourmet', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    gourmet.satiety = 10;
    const price = Math.ceil(kibble.cost * foodMult);
    const w = wallet(price);
    const res = feed(gourmet, w, capacity(), kibble, cfg);
    expect(res.ok).toBe(true);
    expect(w.crumbs).toBe(0);

    // Papilles dorées : la ration d'urgence nourrit davantage.
    const satMult = skillById(cfg, 'golden-palate')!.tokenSatietyMultiplier!;
    const palate = child();
    palate.skills = [{ skillId: 'golden-palate', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    palate.satiety = 0;
    feed(palate, wallet(), capacity(), foodById(cfg, 'emergency-ration')!, cfg);
    expect(palate.satiety).toBeCloseTo(50 * satMult, 1);
  });

  it("l'arbre contient au moins 100 compétences, toutes atteignables", () => {
    expect(cfg.skills.length).toBeGreaterThanOrEqual(100);
    // Ids uniques.
    expect(new Set(cfg.skills.map((s) => s.id)).size).toBe(cfg.skills.length);
    // Tout prérequis existe et ne crée pas de cycle (chaînes linéaires).
    for (const s of cfg.skills) {
      for (const req of s.requires ?? []) {
        expect(skillById(cfg, req), `prérequis ${req} de ${s.id}`).toBeDefined();
      }
    }
    // Les slots du Papy permettent un build conséquent.
    expect(cfg.stages.grandpa.skillSlots).toBeGreaterThanOrEqual(20);
  });
});

describe('événements aléatoires : pillards et aubaines', () => {
  function readyForEvent(): CompanionState {
    const c = child();
    c.nextEventAtActive = 0; // événement dû immédiatement
    return c;
  }

  it("une menace non défendue vole une partie du pot, puis reprogramme", () => {
    const c = readyForEvent();
    c.pendingCrumbs = 100;
    c.satiety = 100;
    const quiet: GameConfig = { ...cfg, rng: () => 0.01 }; // force le corbeau, pas d'auto-défense
    const events = advanceSim(c, wallet(), 30, quiet);
    expect(events.some((e) => e.type === 'event-started')).toBe(true);
    expect(c.activeEvent).not.toBeNull();

    // La fenêtre expire sans défense → le corbeau se sert.
    const afterEvents = advanceSim(c, wallet(), cfg.eventWindowSeconds + 60, quiet);
    expect(afterEvents.some((e) => e.type === 'event-lost')).toBe(true);
    expect(c.pendingCrumbs).toBeLessThan(100);
    expect(c.activeEvent).toBeNull();
    expect(c.nextEventAtActive).toBeGreaterThan(c.activeSeconds);
  });

  it('défendre à temps sauve le butin et récompense', () => {
    const c = readyForEvent();
    c.pendingCrumbs = 100;
    c.satiety = 100;
    c.mood = 50;
    const quiet: GameConfig = { ...cfg, rng: () => 0.01 };
    advanceSim(c, wallet(), 30, quiet);
    expect(c.activeEvent).not.toBeNull();

    const events = defendEvent(c, quiet);
    expect(events.some((e) => e.type === 'event-defended')).toBe(true);
    expect(c.activeEvent).toBeNull();
    expect(c.pendingCrumbs).toBe(100); // rien volé
    expect(c.mood).toBeGreaterThan(50);
  });

  it('plus le pot déborde, plus les pillards rappliquent vite', () => {
    const fixed: GameConfig = { ...cfg, rng: () => 0.5 };
    const pauvre = child();
    pauvre.pendingCrumbs = 0;
    scheduleNextEvent(pauvre, fixed);
    const riche = child();
    riche.pendingCrumbs = 600;
    scheduleNextEvent(riche, fixed);
    expect(riche.nextEventAtActive).toBeLessThan(pauvre.nextEventAtActive);
    // …mais jamais sous le plancher.
    const cresus = child();
    cresus.pendingCrumbs = 1_000_000;
    scheduleNextEvent(cresus, fixed);
    expect(cresus.nextEventAtActive - cresus.activeSeconds).toBeGreaterThanOrEqual(
      cfg.eventIntervalFloorSeconds,
    );
  });

  it("l'OVNI enlève un petit si personne ne le chasse", () => {
    const c = child();
    c.stage = 'teen';
    c.satiety = 100;
    c.children = [
      { seed: 1, hue: 10, shape: 0, earStyle: 0, spots: false },
      { seed: 2, hue: 200, shape: 1, earStyle: 1, spots: true },
    ];
    c.activeEvent = {
      eventId: 'ufo-abduction',
      startedAtActive: c.activeSeconds,
      expiresAtActive: c.activeSeconds + 10,
    };
    const quiet: GameConfig = { ...cfg, rng: () => 0.5 };
    const events = advanceSim(c, wallet(), 120, quiet);
    expect(events.some((e) => e.type === 'event-lost')).toBe(true);
    expect(c.children.length).toBe(1);
    expect(c.children[0].seed).toBe(1); // le dernier adopté est parti
  });

  it("l'OVNI ne rôde jamais sans petits à enlever", () => {
    // Force le tirage sur la fin du pool : sans enfants, l'OVNI est filtré.
    const c = child();
    c.satiety = 100;
    c.children = [];
    c.nextEventAtActive = 0;
    // rng : 0,99 pour le tirage (dernier du pool filtré) puis constant.
    const forced: GameConfig = { ...cfg, rng: () => 0.99 };
    advanceSim(c, wallet(), 30, forced);
    // Avec rng 0,99 le tirage retombe sur une aubaine (fin du pool), jamais
    // sur l'OVNI : pas de menace active visant les petits.
    expect(c.activeEvent?.eventId).not.toBe('ufo-abduction');
  });

  it("les fourmis ne pillent que le pot, jamais le portefeuille", () => {
    const c = child();
    c.satiety = 100;
    c.pendingCrumbs = 100;
    const w = wallet(500);
    c.activeEvent = {
      eventId: 'ant-invasion',
      startedAtActive: c.activeSeconds,
      expiresAtActive: c.activeSeconds + 10,
    };
    const quiet: GameConfig = { ...cfg, rng: () => 0.5 };
    const events = advanceSim(c, w, 120, quiet);
    expect(events.some((e) => e.type === 'event-lost')).toBe(true);
    expect(c.pendingCrumbs).toBeLessThan(100);
    expect(w.crumbs).toBe(500);
  });

  it("une tourelle bien améliorée intercepte l'OVNI avant qu'il n'agisse, en consommant des munitions", () => {
    const c = child();
    c.stage = 'teen';
    c.satiety = 100;
    c.pendingCrumbs = 0;
    c.turretLevel = 5;
    c.children = [{ seed: 1, hue: 10, shape: 0, earStyle: 0, spots: false }];
    c.nextEventAtActive = 0;
    const forced: GameConfig = { ...cfg, rng: () => 0.7 };
    const w = wallet(1000);
    const events = advanceSim(c, w, 30, forced);
    expect(events.some((e) => e.type === 'event-defended' && e.data?.turret === true)).toBe(true);
    expect(c.children.length).toBe(1);
    expect(c.activeEvent).toBeNull();
    expect(w.crumbs).toBe(1000 - turretAmmoCost(cfg, 5));
  });

  it('une tourelle sans munitions (portefeuille vide) reste hors ligne', () => {
    const c = child();
    c.stage = 'teen';
    c.satiety = 100;
    c.pendingCrumbs = 0;
    c.turretLevel = 5;
    c.children = [{ seed: 1, hue: 10, shape: 0, earStyle: 0, spots: false }];
    c.nextEventAtActive = 0;
    const forced: GameConfig = { ...cfg, rng: () => 0.7 };
    const w = wallet(0);
    const events = advanceSim(c, w, 30, forced);
    expect(events.some((e) => e.type === 'event-defended' && e.data?.turret === true)).toBe(false);
    expect(w.crumbs).toBe(0);
  });

  it("une menace non-OVNI ne consomme jamais de munitions de tourelle", () => {
    const c = readyForEvent();
    c.turretLevel = 5;
    c.pendingCrumbs = 100;
    c.satiety = 100;
    const w = wallet(1000);
    const quiet: GameConfig = { ...cfg, rng: () => 0.01 }; // force le corbeau
    advanceSim(c, w, 30, quiet);
    expect(w.crumbs).toBe(1000);
  });

  it("les petits creusent l'appétit du foyer", () => {
    const solo = child();
    solo.satiety = 100;
    solo.nextEventAtActive = Infinity;
    const famille = child();
    famille.satiety = 100;
    famille.nextEventAtActive = Infinity;
    famille.children = [
      { seed: 1, hue: 10, shape: 0, earStyle: 0, spots: false },
      { seed: 2, hue: 200, shape: 1, earStyle: 1, spots: true },
    ];
    // 30 min : le foyer chargé draine plus vite, sans taper le plancher de 0.
    advanceSim(solo, wallet(), HOUR / 2, cfg);
    advanceSim(famille, wallet(), HOUR / 2, cfg);
    expect(100 - famille.satiety).toBeCloseTo(
      100 - solo.satiety + cfg.childMetabolismPerHour,
      1,
    );
  });

  it('la Défense réduit les pertes', () => {
    const naked = readyForEvent();
    naked.pendingCrumbs = 100;
    naked.satiety = 100;
    const armored = readyForEvent();
    armored.pendingCrumbs = 100;
    armored.satiety = 100;
    armored.skills = [
      { skillId: 'epouvantail', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false },
    ];
    const quiet: GameConfig = { ...cfg, rng: () => 0.01 };
    advanceSim(naked, wallet(), cfg.eventWindowSeconds + 90, quiet);
    advanceSim(armored, wallet(), cfg.eventWindowSeconds + 90, quiet);
    expect(100 - armored.pendingCrumbs).toBeLessThan(100 - naked.pendingCrumbs);
  });
});

describe('famille et contenants', () => {
  const KID_GENOME = { seed: 1, hue: 10, shape: 0 as const, earStyle: 0 as const, spots: false };

  it("chaque petit offre une étude en parallèle de plus", () => {
    const c = child();
    c.stage = 'teen';
    c.children = [KID_GENOME, { ...KID_GENOME, seed: 2 }];
    const w = wallet(50_000);
    const cap = capacity();
    // 1 de base + 2 petits = 3 études simultanées.
    expect(startLearning(c, w, cap, 'crumb-forage', cfg).ok).toBe(true);
    expect(startLearning(c, w, cap, 'lean-stomach', cfg).ok).toBe(true);
    expect(startLearning(c, w, cap, 'hug-expert', cfg).ok).toBe(true);
    expect(startLearning(c, w, cap, 'epouvantail', cfg).ok).toBe(false); // plus de place
    // …et les trois études progressent EN MÊME TEMPS.
    c.satiety = 100;
    advanceSim(c, w, skillById(cfg, 'crumb-forage')!.trainSeconds + 60, cfg);
    expect(c.skills.filter((sp) => sp.state === 'owned').length).toBeGreaterThanOrEqual(1);
  });

  it('le contenant améliore le plafond du pot (Bocal → Poubelle → …)', () => {
    const c = child();
    c.skills = [{ skillId: 'crumb-forage', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    const base = crumbCap(c, cfg);
    const w = wallet(cfg.containers[1].cost);
    expect(upgradeContainer(c, w, cfg).ok).toBe(true);
    expect(w.crumbs).toBe(0);
    expect(crumbCap(c, cfg)).toBeCloseTo(base * cfg.containers[1].capMultiplier, 5);
    // Sans le sou, pas de Piscine.
    expect(upgradeContainer(c, wallet(0), cfg).ok).toBe(false);
  });

  it('les petits grignotent le pot, puis le portefeuille', () => {
    // Production des petits neutralisée pour isoler leur appétit.
    const greedy: GameConfig = { ...cfg, childProductionPerHour: 0 };
    const c = child();
    c.satiety = 100;
    c.nextEventAtActive = Infinity;
    c.children = [KID_GENOME, { ...KID_GENOME, seed: 2 }];
    c.pendingCrumbs = 3;
    const w = wallet(100);
    advanceSim(c, w, HOUR, greedy);
    // 2 petits × 8/h = 16 mangées : le pot (3) d'abord, puis ~13 au portefeuille.
    expect(c.pendingCrumbs).toBe(0);
    expect(w.crumbs).toBeCloseTo(100 - (16 - 3), 0);
  });

  it('les petits produisent aussi dans le pot (net positif si bien gérés)', () => {
    const c = child();
    c.satiety = 100;
    c.mood = 50; // multiplicateur ×1
    c.nextEventAtActive = Infinity;
    c.children = [KID_GENOME, { ...KID_GENOME, seed: 2 }];
    advanceSim(c, wallet(), HOUR, cfg);
    // +30/h produites, −16/h mangées → net ≈ +14 dans le pot.
    expect(c.pendingCrumbs).toBeCloseTo(2 * (cfg.childProductionPerHour - cfg.childCrumbEatPerHour), 0);
  });
});

describe('boutique : cosmétiques et adoption', () => {
  it('achète, équipe (un par emplacement) et retire un cosmétique', () => {
    const c = child();
    const w = wallet(1000);
    expect(buyCosmetic(c, w, capacity(), 'beret', cfg).ok).toBe(true);
    expect(c.cosmetics.equipped).toContain('beret'); // porté direct

    // Un second chapeau remplace le premier (même emplacement).
    expect(buyCosmetic(c, w, capacity(), 'party-hat', cfg).ok).toBe(true);
    expect(c.cosmetics.equipped).toContain('party-hat');
    expect(c.cosmetics.equipped).not.toContain('beret');
    expect(c.cosmetics.owned).toContain('beret'); // toujours dans la garde-robe

    // Retirer.
    expect(equipCosmetic(c, 'party-hat', cfg).ok).toBe(true);
    expect(c.cosmetics.equipped).not.toContain('party-hat');
  });

  it("adopte des petits (dès Ado, prix doublé, production bonus)", () => {
    const kid = child();
    expect(buyChild(kid, wallet(9999), capacity(), cfg).ok).toBe(false); // trop jeune

    const c = child();
    c.stage = 'teen';
    const w = wallet(cfg.childBaseCost * 3);
    expect(buyChild(c, w, capacity(), cfg).ok).toBe(true);
    expect(c.children.length).toBe(1);
    expect(w.crumbs).toBe(cfg.childBaseCost * 2); // premier petit : prix de base

    // Le second coûte le double.
    expect(buyChild(c, w, capacity(), cfg).ok).toBe(true);
    expect(w.crumbs).toBe(0);

    // Ils aident à la production.
    expect(crumbRatePerHour(c, cfg)).toBeGreaterThan(0);
  });

  it('améliore la tourelle anti-OVNI par niveaux, jusqu\'au plafond', () => {
    const c = child();
    const cap = capacity();
    expect(buyTurret(c, wallet(), cap, cfg).ok).toBe(true);
    expect(c.turretLevel).toBe(1);
    for (let i = 1; i < cfg.turret.maxLevel; i++) {
      expect(buyTurret(c, wallet(), cap, cfg).ok).toBe(true);
    }
    expect(c.turretLevel).toBe(cfg.turret.maxLevel);
    expect(buyTurret(c, wallet(), cap, cfg).ok).toBe(false); // déjà au maximum
  });
});

describe('interactions et progression', () => {
  it("jouer monte l'humeur puis impose un cooldown", () => {
    const c = hatchedBlob();
    c.mood = 50;
    expect(play(c, cfg).ok).toBe(true);
    expect(c.mood).toBe(50 + cfg.playMoodGain);
    expect(play(c, cfg).ok).toBe(false); // cooldown
  });

  it('ramasser transfère le pot vers le portefeuille', () => {
    const c = child();
    c.pendingCrumbs = 42;
    const w = wallet(8);
    expect(collectCrumbs(c, w).ok).toBe(true);
    expect(w.crumbs).toBe(50);
    expect(c.pendingCrumbs).toBe(0);
  });

  it('évolue Blob → Enfant au seuil d\'XP', () => {
    const c = hatchedBlob();
    c.xp = cfg.stages.blob.xpToNext! - 1;
    c.satiety = 100;
    const events = advanceSim(c, wallet(), HOUR, cfg);
    expect(c.stage).toBe('kid');
    expect(events.some((e) => e.type === 'evolved')).toBe(true);
  });

  it('le génome est généré procéduralement et varie', () => {
    const seq = (vals: number[]) => {
      let i = 0;
      return () => vals[i++ % vals.length];
    };
    const a = createCompanion('A', seq([0.1, 0.2, 0.3, 0.4, 0.5]));
    const b = createCompanion('B', seq([0.9, 0.8, 0.7, 0.6, 0.5]));
    expect(a.genome).toBeDefined();
    expect(a.genome.hue).not.toBe(b.genome.hue);
    expect(a.genome.shape).not.toBe(b.genome.shape);
  });

  it('la croissance suit les paliers 100 / 10k / 1M', () => {
    expect(growthFactor(0)).toBe(0);
    expect(growthFactor(100)).toBeCloseTo(1 / 3, 1);
    expect(growthFactor(10_000)).toBeCloseTo(2 / 3, 1);
    expect(growthFactor(1_000_000)).toBe(1);
  });

  it('le simSpeed accélère le temps (panneau dev)', () => {
    const fast: GameConfig = { ...cfg, simSpeed: 60 };
    const c = hatchedBlob();
    c.satiety = 80;
    advanceSim(c, wallet(), 60, fast); // 1 min réelle = 1 h simulée
    expect(c.satiety).toBeCloseTo(80 - cfg.stages.blob.metabolismPerHour, 1);
  });

  it('le baseTimeScale (×1.25 par défaut) accélère le rythme de croisière', () => {
    const c = hatchedBlob();
    c.satiety = 80;
    advanceSim(c, wallet(), HOUR, DEFAULT_CONFIG); // baseTimeScale réel (1.25), simSpeed 1
    expect(c.satiety).toBeCloseTo(80 - cfg.stages.blob.metabolismPerHour * DEFAULT_CONFIG.baseTimeScale, 1);
    expect(DEFAULT_CONFIG.baseTimeScale).toBe(1.25);
  });
});

describe('papy : vieillesse accélérée', () => {
  function grandpa(): CompanionState {
    const c = child();
    c.stage = 'grandpa';
    c.grandpaEnteredAt = c.activeSeconds;
    c.satiety = 100;
    c.vitality = 100;
    c.nextEventAtActive = Infinity;
    return c;
  }

  it('meurt en environ 2-3h avec la courbe modérée (base 25/h, accel 12/h²)', () => {
    const c = grandpa();
    advanceSim(c, wallet(), 1 * HOUR, cfg);
    expect(c.dead).toBe(false);
    advanceSim(c, wallet(), 2 * HOUR, cfg);
    expect(c.dead).toBe(true);
  });

  it('la dégradation est strictement croissante avec l\'âge (accélération, pas linéaire)', () => {
    const early = grandpa();
    advanceSim(early, wallet(), 30 * 60, cfg);
    const earlyLoss = 100 - early.vitality;

    const late = grandpa();
    advanceSim(late, wallet(), 30 * 60, cfg); // 0 → 30 min
    late.vitality = 100; // reset pour mesurer la fenêtre suivante isolément
    advanceSim(late, wallet(), 30 * 60, cfg); // 30 → 60 min
    const lateLoss = 100 - late.vitality;

    expect(lateLoss).toBeGreaterThan(earlyLoss);
  });

  it("l'infirmière ralentit la dégradation mais ne l'arrête jamais (sursis, pas remède)", () => {
    const nursed = grandpa();
    nursed.skills = [{ skillId: 'nurse', state: 'owned', trainedSeconds: 0, level: 5, upgrading: false }];
    const naked = grandpa();

    advanceSim(nursed, wallet(), 2 * HOUR, cfg);
    advanceSim(naked, wallet(), 2 * HOUR, cfg);
    expect(nursed.vitality).toBeGreaterThan(naked.vitality); // ralentit…
    expect(nursed.vitality).toBeLessThan(100); // …mais ne stabilise pas indéfiniment (nurse L5 = 40/h, dépassé par l'accélération)

    const nursedTimeToDeath = grandpa();
    nursedTimeToDeath.skills = nursed.skills;
    advanceSim(nursedTimeToDeath, wallet(), 4 * HOUR, cfg);
    expect(nursedTimeToDeath.dead).toBe(true); // …et finit quand même par mourir
  });

  it("le Toki éternel (immortal) stoppe totalement la dégradation", () => {
    const c = grandpa();
    c.skills = [{ skillId: 'immortal', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    advanceSim(c, wallet(), 10 * HOUR, cfg);
    expect(c.vitality).toBe(100);
    expect(c.dead).toBe(false);
  });

  it('le délai de grâce à Vitalité 0 est plus court pour le Papy que pour les autres stades', () => {
    const c = grandpa();
    c.vitality = 0;
    c.zeroVitalitySeconds = cfg.grandpa.deathAfterZeroVitalitySeconds - 50;
    advanceSim(c, wallet(), 0, cfg); // no-op, juste pour vérifier l'état de départ
    expect(c.dead).toBe(false);

    const stillAlive = grandpa();
    stillAlive.vitality = 0;
    advanceSim(stillAlive, wallet(), cfg.grandpa.deathAfterZeroVitalitySeconds - 50, cfg);
    expect(stillAlive.dead).toBe(false);

    const nowDead = grandpa();
    nowDead.vitality = 0;
    advanceSim(nowDead, wallet(), cfg.grandpa.deathAfterZeroVitalitySeconds + 50, cfg);
    expect(nowDead.dead).toBe(true);

    expect(cfg.grandpa.deathAfterZeroVitalitySeconds).toBeLessThan(cfg.deathAfterZeroVitalitySeconds);
  });

  it('le taux de dégradation est plafonné (maxDecayPerHour) même pour un Papy très âgé', () => {
    const veryOld = grandpa();
    veryOld.grandpaEnteredAt = veryOld.activeSeconds - 10 * HOUR; // déjà 10 h de vieillesse
    const before = veryOld.vitality;
    advanceSim(veryOld, wallet(), 60, cfg); // 1 minute
    const lossPerHour = ((before - veryOld.vitality) / 60) * HOUR;
    expect(lossPerHour).toBeLessThanOrEqual(cfg.grandpa.maxDecayPerHour + 1); // marge d'arrondi
  });
});

describe('clicker : Miettes au clic', () => {
  it('un clic de base rapporte cfg.click.baseCrumbsPerClick Miettes au portefeuille', () => {
    const c = child();
    const w = wallet(0);
    const res = clickPet(c, w, cfg, () => 0.99); // rng haut : jamais critique
    expect(res.ok).toBe(true);
    expect(w.crumbs).toBe(cfg.click.baseCrumbsPerClick);
    expect(c.totalCrumbsGenerated).toBe(cfg.click.baseCrumbsPerClick);
  });

  it("l'œuf refuse le clic, le Compagnon mort aussi", () => {
    const egg = createCompanion('Œuf');
    expect(clickPet(egg, wallet(), cfg, () => 0.99).ok).toBe(false);

    const dead = child();
    dead.dead = true;
    expect(clickPet(dead, wallet(), cfg, () => 0.99).ok).toBe(false);
  });

  it('la compétence "Doigt leste" augmente le gain par clic, amplifié par le niveau', () => {
    const c = child();
    c.skills = [{ skillId: 'doigt-leste', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    const w1 = wallet(0);
    clickPet(c, w1, cfg, () => 0.99);
    expect(w1.crumbs).toBe(cfg.click.baseCrumbsPerClick + 1);

    c.skills[0].level = 5;
    const w5 = wallet(0);
    clickPet(c, w5, cfg, () => 0.99);
    expect(w5.crumbs).toBeCloseTo(cfg.click.baseCrumbsPerClick + 1 * levelScale(cfg, 5), 5);
  });

  it('un clic critique multiplie le gain par cfg.click.critMultiplier', () => {
    const c = child();
    c.skills = [{ skillId: 'clic-chanceux', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    const w = wallet(0);
    const res = clickPet(c, w, cfg, () => 0.001); // rng bas : force le critique
    expect(res.ok).toBe(true);
    expect((res as { ok: true; events: SimEvent[] }).events[0]?.data?.crit).toBe(true);
    expect(w.crumbs).toBe(cfg.click.baseCrumbsPerClick * cfg.click.critMultiplier);
  });

  it('la chance de critique cumulée est plafonnée à critChanceCap', () => {
    const c = child();
    c.skills = [
      { skillId: 'clic-chanceux', state: 'owned', trainedSeconds: 0, level: 3, upgrading: false },
      { skillId: 'souris-gamer', state: 'owned', trainedSeconds: 0, level: 3, upgrading: false },
      { skillId: 'transcendance-tactile', state: 'owned', trainedSeconds: 0, level: 3, upgrading: false },
    ];
    const { critChance } = clickValue(c, cfg);
    expect(critChance).toBeLessThanOrEqual(cfg.click.critChanceCap);
  });

  it('la Macro douteuse (auto-clicker) crédite des Miettes au fil du temps sans intervention', () => {
    const c = child();
    c.satiety = 100;
    c.skills = [{ skillId: 'macro-douteuse', state: 'owned', trainedSeconds: 0, level: 1, upgrading: false }];
    const w = wallet(0);
    advanceSim(c, w, HOUR, cfg);
    expect(w.crumbs).toBeGreaterThan(0);
  });
});
