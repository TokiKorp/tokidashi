// Scène PixiJS du Compagnon : rendu nearest-neighbor du pixel art procédural
// + animations idle par état. Le Compagnon GROSSIT avec les TOKEN mangés
// (growth 0→1, échelle log jusqu'à 1M) — il devient aussi un peu plus dodu.

import { useEffect, useRef } from 'react';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { Genome, StageCode, VisibleState } from '../game/types';
import { ENEMY_PALETTE, ENEMY_SPRITES, enemyMotion } from './enemies';
import { gridToCanvas } from './pixel';
import { buildSprite } from './sprites';

const STAGE_W = 264;
const STAGE_H = 200;
const BASE_SCALE = 6;
const MAX_SCALE = 9; // borne dure : le sprite doit tenir dans la scène

interface Props {
  state: VisibleState;
  stage: StageCode;
  genome: Genome;
  /** 0→∞ : croissance liée aux TOKEN mangés. */
  growth: number;
  /** Miettes produites en attente → autant de miettes visibles au sol. */
  pendingCrumbs?: number;
  /** Cosmétiques portés (boutique). */
  cosmetics?: string[];
  /** Petits adoptés — mini-sprites aux pieds du Compagnon. */
  children?: Genome[];
  /** Menace en cours (id d'événement) : ennemi animé, cliquable pour chasser. */
  threatId?: string | null;
  onDefend?: () => void;
  onCollect?: () => void;
  onTap?: () => void;
}

// Textures d'ennemis (2 frames), construites à la demande.
const enemyTextureCache = new Map<string, [Texture, Texture]>();

function getEnemyTextures(id: string): [Texture, Texture] | null {
  const def = ENEMY_SPRITES[id];
  if (!def) return null;
  if (!enemyTextureCache.has(id)) {
    const pair = def.frames.map((g) => {
      const tex = Texture.from(gridToCanvas(g, ENEMY_PALETTE));
      tex.source.scaleMode = 'nearest';
      return tex;
    }) as [Texture, Texture];
    enemyTextureCache.set(id, pair);
  }
  return enemyTextureCache.get(id)!;
}

const STAGE_SCALE: Record<StageCode, number> = {
  egg: 1,
  blob: 1,
  kid: 1.1,
  teen: 1.2,
  adult: 1.3,
  grandpa: 1.25,
};

const CHILD_SPOTS: Array<[number, number]> = [
  [34, 196], [230, 196], [64, 198], [200, 198],
];

// ——— Miettes au sol : la production se VOIT (et se ramasse au clic) ———

const CRUMB_PALETTE = { '.': 'transparent', o: '#8a6d3b', s: '#f7c873', w: '#fde8bd' };
const CRUMB_GRIDS = [
  ['.oo.', 'oswo', 'osso', '.oo.'],
  ['..o.', '.oso', 'osso', '.oo.'],
  ['.o.', 'oso', '.o.'],
];

// ——— Entassement : 1 sprite = 1 Miette disponible. Chaque miette atterrit à
// un x ALÉATOIRE et se pose SUR celles déjà là (carte de hauteurs par colonne).
// Elles restent jusqu'au ramassage — le sol se couvre, puis ça monte.

const GROUND_Y = 196;
const BUCKET_W = 8;
const BUCKETS = Math.floor(STAGE_W / BUCKET_W); // colonnes d'empilement
const CRUMB_STACK_H = 5; // hauteur gagnée par miette empilée
/** Garde-fou perf : au-delà, on n'ajoute plus de sprites (compteur au pot). */
const MAX_CRUMB_SPRITES = 600;

/** Point d'où jaillissent les miettes : le Compagnon lui-même. */
const CRUMB_SOURCE: [number, number] = [STAGE_W / 2, STAGE_H - 70];
const FLIGHT_MS = 600;
const FADE_MS = 400;

let crumbTextures: Texture[] | null = null;

function getCrumbTextures(): Texture[] {
  crumbTextures ??= CRUMB_GRIDS.map((g) => {
    const tex = Texture.from(gridToCanvas(g, CRUMB_PALETTE));
    tex.source.scaleMode = 'nearest';
    return tex;
  });
  return crumbTextures;
}

function visibleCrumbCount(pending: number): number {
  return Math.min(MAX_CRUMB_SPRITES, Math.floor(pending));
}

interface CrumbSprite {
  sprite: Sprite;
  target: [number, number];
  /** Colonne d'empilement (pour libérer la hauteur au ramassage). */
  bucket: number;
  /** Vol d'apparition en cours (null = posée sur le tas). */
  flight: { from: [number, number]; start: number } | null;
}

interface Anim {
  state: VisibleState;
  main: Texture;
  blink: Texture | null;
  nextBlinkAt: number;
  blinkUntil: number;
}

function toTexture(canvas: HTMLCanvasElement): Texture {
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

export function PetStage({
  state,
  stage,
  genome,
  growth,
  pendingCrumbs = 0,
  cosmetics = [],
  children = [],
  threatId = null,
  onDefend,
  onCollect,
  onTap,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const spriteRef = useRef<Sprite | null>(null);
  const crumbLayerRef = useRef<Container | null>(null);
  const animRef = useRef<Anim | null>(null);
  const growthRef = useRef(growth);
  const stageRef = useRef(stage);
  const onCollectRef = useRef(onCollect);
  const onDefendRef = useRef(onDefend);
  onDefendRef.current = onDefend;
  const enemyRef = useRef<{ id: string; sprite: Sprite } | null>(null);
  const enemyLayerRef = useRef<Container | null>(null);
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const crumbCountRef = useRef(0);
  const crumbsRef = useRef<CrumbSprite[]>([]);
  const childLayerRef = useRef<Container | null>(null);
  const heightsRef = useRef<number[]>(new Array(BUCKETS).fill(0));
  const leavingRef = useRef<Array<{ sprite: Sprite; start: number }>>([]);
  const timeRef = useRef(0);
  growthRef.current = growth;
  stageRef.current = stage;
  onCollectRef.current = onCollect;

  // Montage unique de l'application Pixi.
  useEffect(() => {
    let cancelled = false;
    let app: Application | null = null;

    (async () => {
      const a = new Application();
      await a.init({
        width: STAGE_W,
        height: STAGE_H,
        backgroundAlpha: 0,
        antialias: false,
      });
      if (cancelled) {
        a.destroy(true);
        return;
      }
      app = a;
      appRef.current = a;
      containerRef.current?.appendChild(a.canvas);

      // Miettes au sol, derrière le Compagnon ; clic = tout ramasser.
      const crumbLayer = new Container();
      crumbLayer.eventMode = 'static';
      crumbLayer.cursor = 'pointer';
      crumbLayer.on('pointertap', () => onCollectRef.current?.());
      a.stage.addChild(crumbLayer);
      crumbLayerRef.current = crumbLayer;
      // Restauration : les miettes déjà produites sont posées sans vol.
      syncCrumbs(crumbCountRef.current, false);

      // Les petits adoptés, entre les miettes et le Compagnon.
      const childLayer = new Container();
      a.stage.addChild(childLayer);
      childLayerRef.current = childLayer;
      populateChildren(childrenRef.current);

      const sprite = new Sprite();
      sprite.anchor.set(0.5, 1);
      sprite.position.set(STAGE_W / 2, STAGE_H - 4);
      a.stage.addChild(sprite);
      spriteRef.current = sprite;

      // Couche des ennemis (au premier plan — c'est eux qu'on doit cliquer).
      const enemyLayer = new Container();
      enemyLayer.eventMode = 'static';
      enemyLayer.cursor = 'pointer';
      enemyLayer.on('pointertap', () => onDefendRef.current?.());
      a.stage.addChild(enemyLayer);
      enemyLayerRef.current = enemyLayer;
      spawnEnemy(threatIdRef.current);

      let t = 0;
      a.ticker.add((ticker) => {
        t += ticker.deltaMS;
        const anim = animRef.current;
        const s = spriteRef.current;
        if (!anim || !s) return;

        // Clignement.
        if (anim.blink) {
          const blinking = t < anim.blinkUntil;
          if (!blinking && t >= anim.nextBlinkAt) {
            anim.blinkUntil = t + 130;
            anim.nextBlinkAt = t + 2500 + Math.random() * 3000;
          }
          s.texture = t < anim.blinkUntil ? anim.blink : anim.main;
        } else {
          s.texture = anim.main;
        }

        // Échelle : base × stade × croissance. La croissance est SANS plafond
        // numérique ; l'échelle de rendu sature en douceur (le corps continue
        // de s'élargir dans la grille via `fat`).
        const g = growthRef.current;
        const soft = g <= 1 ? g : 1 + Math.log2(g) * 0.5; // saturation douce
        const stageK = STAGE_SCALE[stageRef.current];
        const sx = Math.min(MAX_SCALE, BASE_SCALE * stageK * (1 + 0.65 * soft));
        const sy = Math.min(MAX_SCALE, BASE_SCALE * stageK * (1 + 0.45 * soft));

        // Postures par état.
        s.rotation = 0;
        s.position.x = STAGE_W / 2;
        let y = STAGE_H - 4;
        let squash = 1 + 0.025 * Math.sin(t / 450); // respiration

        switch (anim.state) {
          case 'egg': {
            const phase = t % 2600;
            if (phase < 500) s.rotation = Math.sin(t / 70) * 0.06;
            squash = 1;
            break;
          }
          case 'happy':
            y -= Math.abs(Math.sin(t / 280)) * 7;
            break;
          case 'sick':
            s.position.x += Math.sin(t / 55) * 0.9;
            break;
          case 'working':
            s.rotation = Math.sin(t / 520) * 0.03;
            break;
          case 'dead':
            squash = 1;
            break;
        }

        s.position.y = y;
        s.scale.set(sx, sy * squash);

        // — Miettes : vol d'apparition en cloche, puis scintillement sur le tas.
        timeRef.current = t;
        crumbsRef.current.forEach((c, i) => {
          if (c.flight) {
            const p = (t - c.flight.start) / FLIGHT_MS;
            if (p >= 1) {
              c.sprite.position.set(c.target[0], c.target[1]);
              c.sprite.rotation = 0;
              c.sprite.alpha = 1;
              c.flight = null;
            } else if (p > 0) {
              const [fx, fy] = c.flight.from;
              const [tx, ty] = c.target;
              c.sprite.visible = true;
              c.sprite.position.set(
                fx + (tx - fx) * p,
                fy + (ty - fy) * p - Math.sin(p * Math.PI) * 46,
              );
              c.sprite.rotation = p * Math.PI * 2 * (c.target[0] < STAGE_W / 2 ? -1 : 1);
            } else {
              c.sprite.visible = false; // départ différé (vols en cascade)
            }
          } else {
            c.sprite.visible = true;
            c.sprite.alpha = 0.85 + 0.15 * Math.sin(t / 500 + i * 1.7);
          }
        });

        // Les petits respirent en décalé.
        childLayerRef.current?.children.forEach((kid, i) => {
          kid.scale.set(3, 3 * (1 + 0.03 * Math.sin(t / 380 + i * 2.1)));
        });

        // — Ennemi : battement d'ailes / marche / picorage + trajectoire.
        const enemy = enemyRef.current;
        if (enemy) {
          const def = ENEMY_SPRITES[enemy.id];
          const textures = getEnemyTextures(enemy.id);
          if (def && textures) {
            enemy.sprite.texture = textures[Math.floor(t / def.frameMs) % 2];
            const { x, y } = enemyMotion(enemy.id, t);
            enemy.sprite.position.set(x, y);
            // Il regarde dans sa direction de déplacement.
            const { x: xNext } = enemyMotion(enemy.id, t + 50);
            enemy.sprite.scale.x = xNext < x ? 3 : -3;
          }
        }

        // Ramassées : petite envolée + fondu.
        leavingRef.current = leavingRef.current.filter((l) => {
          const p = (t - l.start) / FADE_MS;
          if (p >= 1) {
            l.sprite.destroy();
            return false;
          }
          l.sprite.alpha = 1 - p;
          l.sprite.position.y -= 1.2;
          return true;
        });
      });
    })();

    return () => {
      cancelled = true;
      appRef.current = null;
      spriteRef.current = null;
      crumbLayerRef.current = null;
      crumbsRef.current = [];
      heightsRef.current = new Array(BUCKETS).fill(0);
      leavingRef.current = [];
      enemyLayerRef.current = null;
      enemyRef.current = null;
      app?.destroy(true);
    };
  }, []);

  // Changement d'état / stade / génome / embonpoint / tenue → nouvelles textures.
  // `fat` est quantifié pour ne pas reconstruire la texture à chaque tick.
  const fatQ = Math.round(growth * 8) / 8;
  const wearKey = cosmetics.join('|');
  useEffect(() => {
    const frames = buildSprite(state, stage, genome, fatQ, cosmetics);
    animRef.current = {
      state,
      main: toTexture(frames.main),
      blink: frames.blink ? toTexture(frames.blink) : null,
      nextBlinkAt: 1500,
      blinkUntil: 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, stage, genome.seed, fatQ, wearKey]);

  // Les petits adoptés : mini-sprites heureux aux pieds du Compagnon.
  function populateChildren(genomes: Genome[]): void {
    const layer = childLayerRef.current;
    if (!layer) return;
    layer.removeChildren();
    genomes.forEach((g, i) => {
      const mini = new Sprite(toTexture(buildSprite('happy', 'blob', g).main));
      mini.anchor.set(0.5, 1);
      mini.scale.set(3);
      const [x, y] = CHILD_SPOTS[i % CHILD_SPOTS.length];
      mini.position.set(x, y);
      layer.addChild(mini);
    });
  }

  const childKey = children.map((g) => g.seed).join('|');
  useEffect(() => {
    populateChildren(childrenRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childKey]);

  // Apparition / disparition de l'ennemi en cours.
  function spawnEnemy(id: string | null): void {
    const layer = enemyLayerRef.current;
    if (!layer) return;
    if (enemyRef.current) {
      enemyRef.current.sprite.destroy();
      enemyRef.current = null;
    }
    if (id && ENEMY_SPRITES[id]) {
      const sprite = new Sprite(getEnemyTextures(id)![0]);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(3);
      layer.addChild(sprite);
      enemyRef.current = { id, sprite };
    }
  }

  const threatIdRef = useRef(threatId);
  threatIdRef.current = threatId;
  useEffect(() => {
    spawnEnemy(threatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threatId]);

  // Synchronise les sprites de miettes avec le compte disponible (1 pour 1) :
  // les nouvelles VOLENT depuis le Compagnon vers une colonne aléatoire et se
  // posent SUR la pile ; les ramassées s'envolent en fondu (dernière arrivée,
  // première partie — les hauteurs restent cohérentes).
  function syncCrumbs(count: number, animate: boolean): void {
    const layer = crumbLayerRef.current;
    if (!layer) return;
    const crumbs = crumbsRef.current;
    const heights = heightsRef.current;
    const now = timeRef.current;

    while (crumbs.length > count) {
      const c = crumbs.pop()!;
      heights[c.bucket] = Math.max(0, heights[c.bucket] - 1);
      if (animate) {
        leavingRef.current.push({ sprite: c.sprite, start: now });
      } else {
        c.sprite.destroy();
      }
    }

    const textures = getCrumbTextures();
    let spawnIndex = 0;
    while (crumbs.length < count) {
      const i = crumbs.length;
      const sprite = new Sprite(textures[i % textures.length]);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(3);

      const bucket = Math.floor(Math.random() * BUCKETS);
      const x = bucket * BUCKET_W + BUCKET_W / 2 + (Math.random() * 4 - 2);
      const y = Math.max(12, GROUND_Y - heights[bucket] * CRUMB_STACK_H);
      heights[bucket] += 1;
      const target: [number, number] = [x, y];

      layer.addChild(sprite);
      if (animate) {
        sprite.visible = false;
        sprite.position.set(CRUMB_SOURCE[0], CRUMB_SOURCE[1]);
        crumbs.push({
          sprite,
          target,
          bucket,
          flight: { from: [...CRUMB_SOURCE], start: now + Math.min(spawnIndex, 6) * 90 },
        });
        spawnIndex += 1;
      } else {
        sprite.position.set(target[0], target[1]);
        crumbs.push({ sprite, target, bucket, flight: null });
      }
    }
  }

  // Le nombre de miettes affiché == le nombre de Miettes disponibles au pot.
  const crumbCount = visibleCrumbCount(pendingCrumbs);
  crumbCountRef.current = crumbCount;
  useEffect(() => {
    syncCrumbs(crumbCount, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crumbCount]);

  return (
    <div
      ref={containerRef}
      className="pet-stage"
      style={{ width: STAGE_W, height: STAGE_H }}
      onClick={onTap}
      role={onTap ? 'button' : undefined}
    />
  );
}
