import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createCompanion, feed } from './actions';
import { DEFAULT_CONFIG, foodById, prestigeSkillBlocked, PRESTIGE_SKILLS, type GameConfig } from './config';
import {
  advanceOutpost,
  buyCompetenceNode,
  buyDecoration,
  castResolve,
  competenceLevel,
  competenceModifiers,
  competencePointsAvailable,
  freshOutpost,
  harvestTree,
  isTreeMature,
  plantSapling,
  resolveCatch,
  sellCrumbFish,
  startCooking,
  stokeFire,
  xpToReach,
  COMPETENCE_MAX_LEVEL,
} from './outpost';
import { FISH_SPECIES, SAPLING_COST, WOOD_SECONDS_PER_UNIT } from './outpostConfig';
import type { CapacityGauge, OutpostState, WalletState } from './types';
import { useTokidachi } from '../state/store';

beforeAll(() => {
  const memory = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  });
});

const cfg: GameConfig = { ...DEFAULT_CONFIG, baseTimeScale: 1 };

function wallet(crumbs = 0): WalletState {
  return { crumbs };
}

function capacity(budget = 1_000_000): CapacityGauge {
  return { budget, used: 0 };
}

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('courbe de niveau des compétences', () => {
  it('niveau 1 ne coûte aucune xp', () => {
    expect(xpToReach(1)).toBe(0);
    expect(competenceLevel(0)).toBe(1);
  });

  it('monte progressivement avec xp croissante', () => {
    expect(competenceLevel(xpToReach(5) - 1)).toBeLessThan(5);
    expect(competenceLevel(xpToReach(5))).toBe(5);
  });

  it('plafonne au niveau maximum', () => {
    expect(competenceLevel(Number.MAX_SAFE_INTEGER)).toBe(COMPETENCE_MAX_LEVEL);
  });
});

describe('competenceModifiers', () => {
  it('valeurs par défaut sans nœud', () => {
    const o = freshOutpost();
    const mods = competenceModifiers(o);
    expect(mods.garden.growthTimeMult).toBe(1);
    expect(mods.camp.fuelBurnMult).toBe(1);
    expect(mods.pool.maxFishTier).toBe(3);
  });

  it('applique le plancher de fuelBurnMult', () => {
    const o = freshOutpost();
    o.competences.camp.nodes.push('camp-feu-eco');
    const mods = competenceModifiers(o);
    expect(mods.camp.fuelBurnMult).toBeGreaterThanOrEqual(0.4);
  });

  it('plafonne doubleCatchChance à 0.35', () => {
    const o = freshOutpost();
    o.competences.pool.nodes.push('mare-double-prise-1', 'mare-double-prise-2');
    const mods = competenceModifiers(o);
    expect(mods.pool.doubleCatchChance).toBeLessThanOrEqual(0.35);
  });
});

describe('buyCompetenceNode', () => {
  it('refuse sous le niveau minimum', () => {
    const o = freshOutpost();
    const res = buyCompetenceNode(o, 'garden', 'jardin-tier4');
    expect(res.ok).toBe(false);
  });

  it('refuse si le prérequis manque', () => {
    const o = freshOutpost();
    o.competences.garden.xp = xpToReach(15);
    const res = buyCompetenceNode(o, 'garden', 'jardin-tier5');
    expect(res.ok).toBe(false);
  });

  it('accepte quand niveau et points suffisent', () => {
    const o = freshOutpost();
    o.competences.garden.xp = xpToReach(2);
    const res = buyCompetenceNode(o, 'garden', 'jardin-croissance-1');
    expect(res.ok).toBe(true);
    expect(o.competences.garden.nodes).toContain('jardin-croissance-1');
  });

  it('refuse si pas assez de points de maîtrise', () => {
    const o = freshOutpost();
    o.competences.garden.xp = xpToReach(8);
    buyCompetenceNode(o, 'garden', 'jardin-croissance-1');
    buyCompetenceNode(o, 'garden', 'jardin-croissance-2');
    buyCompetenceNode(o, 'garden', 'jardin-repos-1');
    buyCompetenceNode(o, 'garden', 'jardin-repos-2');
    expect(competencePointsAvailable(o, 'garden')).toBeLessThan(3);
    const res = buyCompetenceNode(o, 'garden', 'jardin-parcelles');
    expect(res.ok).toBe(false);
  });

  it('pointsAvailable diminue avec les nœuds achetés', () => {
    const o = freshOutpost();
    o.competences.garden.xp = xpToReach(2);
    const before = competencePointsAvailable(o, 'garden');
    buyCompetenceNode(o, 'garden', 'jardin-croissance-1');
    expect(competencePointsAvailable(o, 'garden')).toBe(before - 1);
  });
});

describe('plantSapling', () => {
  it('paye et plante avec rng déterministe', () => {
    const o = freshOutpost();
    const w = wallet(1000);
    const res = plantSapling(o, w, 0, seededRng(1));
    expect(res.ok).toBe(true);
    expect(w.crumbs).toBe(1000 - SAPLING_COST);
    expect(o.garden.plots[0]).not.toBeNull();
    expect(o.garden.plots[0]!.tier).toBe(1);
  });

  it('refuse sur parcelle occupée', () => {
    const o = freshOutpost();
    const w = wallet(10000);
    plantSapling(o, w, 0, seededRng(2));
    const res = plantSapling(o, w, 0, seededRng(3));
    expect(res.ok).toBe(false);
  });

  it('refuse sur parcelle non débloquée', () => {
    const o = freshOutpost();
    const w = wallet(10000);
    const res = plantSapling(o, w, 4, seededRng(4));
    expect(res.ok).toBe(false);
  });

  it('refuse sans assez de miettes', () => {
    const o = freshOutpost();
    const w = wallet(10);
    const res = plantSapling(o, w, 0, seededRng(5));
    expect(res.ok).toBe(false);
  });

  it('même seed produit le même arbre', () => {
    const o1 = freshOutpost();
    const o2 = freshOutpost();
    plantSapling(o1, wallet(1000), 0, seededRng(42));
    plantSapling(o2, wallet(1000), 0, seededRng(42));
    expect(o1.garden.plots[0]).toEqual(o2.garden.plots[0]);
  });
});

describe('croissance, récolte et tier-up', () => {
  function plantedOutpost(): OutpostState {
    const o = freshOutpost();
    plantSapling(o, wallet(1000), 0, seededRng(7));
    return o;
  }

  it("n'est pas mûr avant le temps de pousse", () => {
    const o = plantedOutpost();
    const mods = competenceModifiers(o);
    advanceOutpost(o, 60, cfg);
    expect(isTreeMature(o.garden.plots[0]!, mods)).toBe(false);
  });

  it('devient mûr après le temps de pousse T1 (30 min)', () => {
    const o = plantedOutpost();
    advanceOutpost(o, 30 * 60 + 1, cfg);
    const mods = competenceModifiers(o);
    expect(isTreeMature(o.garden.plots[0]!, mods)).toBe(true);
  });

  it('la récolte donne du bois et met en repos', () => {
    const o = plantedOutpost();
    advanceOutpost(o, 30 * 60 + 1, cfg);
    const res = harvestTree(o, wallet(), 0, seededRng(9));
    expect(res.ok).toBe(true);
    expect(o.resources.wood).toBeGreaterThan(0);
    expect(o.garden.plots[0]!.restSeconds).toBeGreaterThan(0);
  });

  it('refuse la récolte pendant le repos', () => {
    const o = plantedOutpost();
    advanceOutpost(o, 30 * 60 + 1, cfg);
    harvestTree(o, wallet(), 0, seededRng(9));
    const res = harvestTree(o, wallet(), 0, seededRng(9));
    expect(res.ok).toBe(false);
  });

  it('passe en tier 2 après 3 récoltes cumulées', () => {
    const o = plantedOutpost();
    for (let i = 0; i < 3; i++) {
      advanceOutpost(o, 30 * 60 + 1, cfg);
      const res = harvestTree(o, wallet(), 0, seededRng(11 + i));
      expect(res.ok).toBe(true);
      advanceOutpost(o, 20 * 60 + 1, cfg);
    }
    expect(o.garden.plots[0]!.tier).toBe(2);
  });

  it('gagne de la xp de jardin en plantant et récoltant', () => {
    const o = plantedOutpost();
    expect(o.competences.garden.xp).toBeGreaterThan(0);
    advanceOutpost(o, 30 * 60 + 1, cfg);
    const before = o.competences.garden.xp;
    harvestTree(o, wallet(), 0, seededRng(13));
    expect(o.competences.garden.xp).toBeGreaterThan(before);
  });
});

describe('feu de camp', () => {
  it('stoke ajoute du fuelSeconds et consomme du bois', () => {
    const o = freshOutpost();
    o.resources.wood = 10;
    const res = stokeFire(o, 5);
    expect(res.ok).toBe(true);
    expect(o.resources.wood).toBe(5);
    expect(o.camp.fuelSeconds).toBe(5 * WOOD_SECONDS_PER_UNIT);
  });

  it('refuse sans assez de bois', () => {
    const o = freshOutpost();
    o.resources.wood = 1;
    const res = stokeFire(o, 5);
    expect(res.ok).toBe(false);
  });

  it('plafonne le fuelSeconds', () => {
    const o = freshOutpost();
    o.resources.wood = 1000;
    stokeFire(o, 1000);
    expect(o.camp.fuelSeconds).toBeLessThanOrEqual(7200);
  });

  it('brûle avec le temps et émet fire-out', () => {
    const o = freshOutpost();
    o.resources.wood = 1;
    stokeFire(o, 1);
    const events = advanceOutpost(o, WOOD_SECONDS_PER_UNIT + 10, cfg);
    expect(o.camp.fuelSeconds).toBe(0);
    expect(events.some((e) => e.type === 'fire-out')).toBe(true);
  });
});

describe('cuisson', () => {
  it('consomme le poisson cru au démarrage', () => {
    const o = freshOutpost();
    o.resources.rawFish.ablette = 2;
    const res = startCooking(o, 'ablette', 1);
    expect(res.ok).toBe(true);
    expect(o.resources.rawFish.ablette).toBe(1);
  });

  it('refuse sans assez de poisson', () => {
    const o = freshOutpost();
    const res = startCooking(o, 'ablette', 1);
    expect(res.ok).toBe(false);
  });

  it("ne progresse pas sans feu", () => {
    const o = freshOutpost();
    o.resources.rawFish.ablette = 1;
    startCooking(o, 'ablette', 1);
    advanceOutpost(o, 200, cfg);
    expect(o.camp.cooking).not.toBeNull();
  });

  it('avance et termine la cuisson avec du feu, produit du poisson-miette', () => {
    const o = freshOutpost();
    o.resources.wood = 10;
    stokeFire(o, 10);
    o.resources.rawFish.ablette = 1;
    startCooking(o, 'ablette', 1);
    const events = advanceOutpost(o, 130, cfg);
    expect(o.camp.cooking).toBeNull();
    expect(o.resources.crumbFish).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'cook-done')).toBe(true);
  });

  it('reprend la cuisson quand le feu revient', () => {
    const o = freshOutpost();
    o.resources.rawFish.ablette = 1;
    startCooking(o, 'ablette', 1);
    advanceOutpost(o, 60, cfg);
    const remainingBefore = o.camp.cooking!.remainingSeconds;
    o.resources.wood = 5;
    stokeFire(o, 5);
    advanceOutpost(o, 30, cfg);
    expect(o.camp.cooking ? o.camp.cooking.remainingSeconds : 0).toBeLessThan(remainingBefore);
  });

  it('la fournée max dépend du niveau de compétence', () => {
    const o = freshOutpost();
    o.resources.rawFish.ablette = 4;
    const res = startCooking(o, 'ablette', 4);
    expect(res.ok).toBe(false);
    o.competences.camp.xp = xpToReach(4);
    buyCompetenceNode(o, 'camp', 'camp-fournee-1');
    o.competences.camp.xp = xpToReach(8);
    buyCompetenceNode(o, 'camp', 'camp-fournee-2');
    const res2 = startCooking(o, 'ablette', 4);
    expect(res2.ok).toBe(true);
  });

  it('fumage-lent ajoute un poisson-miette bonus sur une fournée de 4', () => {
    const o = freshOutpost();
    o.competences.camp.xp = xpToReach(12);
    buyCompetenceNode(o, 'camp', 'camp-fournee-1');
    buyCompetenceNode(o, 'camp', 'camp-fournee-2');
    buyCompetenceNode(o, 'camp', 'camp-fumage-lent');
    o.resources.wood = 20;
    stokeFire(o, 20);
    o.resources.rawFish.ablette = 4;
    startCooking(o, 'ablette', 4);
    advanceOutpost(o, 130, cfg);
    expect(o.resources.crumbFish).toBe(4 * 1 + 1);
  });
});

describe('sellCrumbFish', () => {
  it('vend et crédite le portefeuille', () => {
    const o = freshOutpost();
    o.resources.crumbFish = 5;
    const w = wallet();
    const res = sellCrumbFish(o, w, 5);
    expect(res.ok).toBe(true);
    expect(o.resources.crumbFish).toBe(0);
    expect(w.crumbs).toBeGreaterThan(0);
  });

  it('refuse sans assez de stock', () => {
    const o = freshOutpost();
    const res = sellCrumbFish(o, wallet(), 1);
    expect(res.ok).toBe(false);
  });
});

describe('buyDecoration', () => {
  it('achète dans la limite des emplacements', () => {
    const o = freshOutpost();
    const w = wallet(1_000_000);
    for (const id of ['banc-rondins', 'guirlande-lucioles', 'totem-chouette']) {
      expect(buyDecoration(o, w, id).ok).toBe(true);
    }
    const res = buyDecoration(o, w, 'pare-vent');
    expect(res.ok).toBe(false);
  });
});

describe('resolveCatch', () => {
  it('ne pêche jamais un poisson au-delà de maxFishTier', () => {
    const mods = competenceModifiers(freshOutpost());
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) {
      const outcome = resolveCatch(mods, rng);
      expect(outcome.tier).toBeLessThanOrEqual(mods.pool.maxFishTier);
    }
  });

  it('casse la ligne parfois sur tier 4+ sans fil-solide', () => {
    const mods = competenceModifiers(freshOutpost());
    mods.pool.maxFishTier = 5;
    const rng = seededRng(2);
    let sawLoss = false;
    for (let i = 0; i < 2000; i++) {
      const outcome = resolveCatch(mods, rng);
      if (outcome.tier >= 4 && outcome.lost) sawLoss = true;
    }
    expect(sawLoss).toBe(true);
  });

  it('fil-solide empêche toute casse sur tier 4+', () => {
    const mods = competenceModifiers(freshOutpost());
    mods.pool.maxFishTier = 5;
    mods.pool.noLineBreakT4Plus = true;
    const rng = seededRng(3);
    for (let i = 0; i < 500; i++) {
      const outcome = resolveCatch(mods, rng);
      expect(outcome.lost).toBe(false);
    }
  });

  it('poids couvre toutes les espèces débloquées', () => {
    const mods = competenceModifiers(freshOutpost());
    const rng = seededRng(4);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      seen.add(resolveCatch(mods, rng).speciesId);
    }
    const unlocked = FISH_SPECIES.filter((s) => s.tier <= mods.pool.maxFishTier).map((s) => s.id);
    for (const id of unlocked) expect(seen.has(id)).toBe(true);
  });
});

describe('castResolve', () => {
  it('la touche ratée ne donne pas de poisson mais un peu de xp', () => {
    const o = freshOutpost();
    const res = castResolve(o, false);
    expect(res.outcome).toBeNull();
    expect(o.pool.casts).toBe(1);
    expect(o.pool.catches).toBe(0);
    expect(o.competences.pool.xp).toBeGreaterThan(0);
  });

  it('une prise réussie ajoute du poisson cru', () => {
    const o = freshOutpost();
    const res = castResolve(o, true, seededRng(3));
    expect(res.ok).toBe(true);
    if (!res.outcome!.lost) {
      const total = Object.values(o.resources.rawFish).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      expect(o.pool.catches).toBe(1);
    }
  });
});

describe('feed avec ressource crumbFish', () => {
  const crumbFish = foodById(cfg, 'crumb-fish')!;

  it('nourrit en consommant le stock au lieu des miettes', () => {
    const c = createCompanion('Testi');
    c.stage = 'kid';
    const resources = { crumbFish: 2 };
    const res = feed(c, wallet(0), capacity(), crumbFish, cfg, resources);
    expect(res.ok).toBe(true);
    expect(resources.crumbFish).toBe(1);
  });

  it('refuse si le stock est vide', () => {
    const c = createCompanion('Testi');
    c.stage = 'kid';
    const resources = { crumbFish: 0 };
    const res = feed(c, wallet(0), capacity(), crumbFish, cfg, resources);
    expect(res.ok).toBe(false);
  });
});

describe('prestige requires chain', () => {
  it('bloque camp sans garden', () => {
    const camp = PRESTIGE_SKILLS.find((s) => s.id === 'unlock-camp')!;
    expect(prestigeSkillBlocked(camp, [])).not.toBeNull();
    expect(prestigeSkillBlocked(camp, ['unlock-garden'])).toBeNull();
  });

  it('bloque pool sans camp', () => {
    const pool = PRESTIGE_SKILLS.find((s) => s.id === 'unlock-pool')!;
    expect(prestigeSkillBlocked(pool, ['unlock-garden'])).not.toBeNull();
    expect(prestigeSkillBlocked(pool, ['unlock-garden', 'unlock-camp'])).toBeNull();
  });
});

describe('structure : le prestige ne touche pas outpost', () => {
  it('l\'outpost survit à un prestige précoce', () => {
    const store = useTokidachi;
    store.getState().adopt('Testi');
    store.setState((s) => {
      const game = structuredClone(s.game);
      game.outpost!.resources.wood = 42;
      game.outpost!.competences.garden.xp = 100;
      game.outpost!.competences.garden.nodes = ['jardin-croissance-1'];
      return { game };
    });

    store.getState().prestigeEarly();

    const game = store.getState().game;
    expect(game.outpost?.resources.wood).toBe(42);
    expect(game.outpost?.competences.garden.xp).toBe(100);
    expect(game.outpost?.competences.garden.nodes).toEqual(['jardin-croissance-1']);
    expect(game.companion?.stage).toBe('egg');
  });
});

describe('déterminisme grand pas de temps', () => {
  it('1×3600s ≡ 3600×1s pour le feu et la cuisson', () => {
    const a = freshOutpost();
    a.resources.wood = 50;
    stokeFire(a, 50);
    a.resources.rawFish.ablette = 1;
    startCooking(a, 'ablette', 1);

    const b = structuredClone(a);

    advanceOutpost(a, 3600, cfg);
    for (let i = 0; i < 3600; i++) advanceOutpost(b, 1, cfg);

    expect(a.camp.fuelSeconds).toBeCloseTo(b.camp.fuelSeconds, 6);
    expect(a.camp.cooking).toEqual(b.camp.cooking);
    expect(a.resources.crumbFish).toBeCloseTo(b.resources.crumbFish, 6);
  });

  it('1×3600s ≡ 3600×1s pour la croissance du jardin', () => {
    const a = freshOutpost();
    plantSapling(a, wallet(1000), 0, seededRng(21));
    const b = structuredClone(a);

    advanceOutpost(a, 3600, cfg);
    for (let i = 0; i < 3600; i++) advanceOutpost(b, 1, cfg);

    expect(a.garden.plots[0]!.growthSeconds).toBeCloseTo(b.garden.plots[0]!.growthSeconds, 6);
  });
});

describe('advanceOutpost reste déterministe (aucun Math.random)', () => {
  it('deux exécutions identiques donnent le même résultat', () => {
    const a = freshOutpost();
    a.resources.wood = 20;
    stokeFire(a, 20);
    a.resources.rawFish.ablette = 3;
    startCooking(a, 'ablette', 1);
    const b = structuredClone(a);

    advanceOutpost(a, 500, cfg);
    advanceOutpost(b, 500, cfg);

    expect(a).toEqual(b);
  });
});
