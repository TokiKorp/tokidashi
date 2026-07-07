// Arbre de compétences (GDD §6.2) — 100 compétences en six branches. Chaque
// branche est une chaîne à prérequis repliable ; chaque compétence affiche
// le STADE requis et son niveau. C'est la bascule vers l'autosuffisance.

import { maxLevelOf, upgradeCost } from '../game/sim';
import type { SkillCategory, SkillDef } from '../game/types';
import { useTokidachi } from '../state/store';
import { formatActiveDuration, formatTokens } from './format';

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  production: 'Production',
  automation: 'Automatisation',
  efficiency: 'Efficacité',
  conversion: 'Conversion',
  social: 'Sociale',
  defense: 'Défense',
};

const CATEGORY_ORDER: SkillCategory[] = [
  'production',
  'automation',
  'efficiency',
  'conversion',
  'social',
  'defense',
];

const STAGE_EMOJI: Record<string, string> = {
  egg: '🥚',
  blob: '🫧',
  kid: '🧒',
  teen: '🎸',
  adult: '💼',
  grandpa: '👴',
};

interface Props {
  onClose: () => void;
}

/** Profondeur dans la chaîne = nombre d'ancêtres via `requires`. */
function depthOf(skill: SkillDef, byId: Map<string, SkillDef>): number {
  let depth = 0;
  let current = skill;
  while (current.requires?.length) {
    const parent = byId.get(current.requires[0]);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

export function SkillPanel({ onClose }: Props) {
  const { cfg, game, learn, upgrade } = useTokidachi();
  const c = game.companion;
  if (!c) return null;

  const byId = new Map(cfg.skills.map((s) => [s.id, s]));
  const stageIndex = cfg.stageOrder.indexOf(c.stage);
  const studying = c.skills.some((sp) => sp.state === 'learning' || sp.upgrading);

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>Arbre de compétences</h2>
        <p className="panel-hint">
          {cfg.skills.length} compétences · slots : {c.skills.length}/
          {cfg.stages[c.stage].skillSlots} au stade {cfg.stages[c.stage].label}
        </p>

        {CATEGORY_ORDER.map((cat) => {
          const branch = cfg.skills.filter((s) => s.category === cat);
          if (branch.length === 0) return null;
          const ownedCount = branch.filter((s) =>
            c.skills.some((sp) => sp.skillId === s.id && sp.state === 'owned'),
          ).length;
          return (
            <details key={cat} className="skill-branch-group" open={cat === 'production'}>
              <summary>
                <span className={`skill-cat cat-${cat}`}>{CATEGORY_LABELS[cat]}</span>{' '}
                {ownedCount}/{branch.length}
              </summary>
              <ul className="skill-list">
                {branch.map((skill) => {
                  const progress = c.skills.find((sp) => sp.skillId === skill.id);
                  const depth = depthOf(skill, byId);
                  const stageLocked = stageIndex < cfg.stageOrder.indexOf(skill.minStage);
                  const missing = (skill.requires ?? []).filter(
                    (id) => !c.skills.some((sp) => sp.skillId === id && sp.state === 'owned'),
                  );
                  const locked = !progress && (stageLocked || missing.length > 0);
                  return (
                    <li
                      key={skill.id}
                      className={`skill-item ${locked ? 'skill-locked' : ''}`}
                      style={{ marginLeft: Math.min(depth, 6) * 8 }}
                    >
                      <div className="skill-head">
                        <strong>
                          {depth > 0 && <span className="skill-branch">└ </span>}
                          {skill.label}{' '}
                          <span
                            className={`skill-stage ${stageLocked ? 'stage-locked' : ''}`}
                            title={`Stade requis : ${cfg.stages[skill.minStage].label}`}
                          >
                            {STAGE_EMOJI[skill.minStage]} {cfg.stages[skill.minStage].label}
                          </span>
                        </strong>
                        <span className="skill-cost">
                          {skill.costCurrency === 'token'
                            ? `🪙 ${formatTokens(skill.cost)}`
                            : `🍞 ${skill.cost}`}
                          {' · '}
                          {formatActiveDuration(skill.trainSeconds)}
                        </span>
                      </div>
                      {skill.description && <p className="skill-desc">{skill.description}</p>}
                      {progress?.state === 'owned' && (
                        <div className="skill-owned-row">
                          <span className="skill-badge owned">
                            Niv. {progress.level}/{maxLevelOf(cfg, skill.id)} ✓
                          </span>
                          {progress.upgrading && (
                            <span className="skill-badge learning">
                              Améliore…{' '}
                              {Math.floor((progress.trainedSeconds / skill.trainSeconds) * 100)}%
                            </span>
                          )}
                          {!progress.upgrading &&
                            progress.level < maxLevelOf(cfg, skill.id) &&
                            !studying && (
                              <button
                                className="btn-secondary btn-upgrade"
                                onClick={() => upgrade(skill.id)}
                              >
                                Améliorer →{' '}
                                {skill.costCurrency === 'token'
                                  ? `🪙 ${formatTokens(upgradeCost(cfg, skill.cost, progress.level + 1))}`
                                  : `🍞 ${upgradeCost(cfg, skill.cost, progress.level + 1)}`}
                              </button>
                            )}
                        </div>
                      )}
                      {progress?.state === 'learning' && (
                        <span className="skill-badge learning">
                          Étudie… {Math.floor((progress.trainedSeconds / skill.trainSeconds) * 100)}%
                        </span>
                      )}
                      {!progress && locked && (
                        <span className="skill-badge lock">
                          🔒{' '}
                          {stageLocked
                            ? `Stade ${cfg.stages[skill.minStage].label} requis`
                            : `Nécessite ${missing.map((id) => byId.get(id)?.label ?? id).join(', ')}`}
                        </span>
                      )}
                      {!progress && !locked && (
                        <button className="btn-primary" onClick={() => learn(skill.id)}>
                          Apprendre
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}

        <button className="btn-secondary" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
