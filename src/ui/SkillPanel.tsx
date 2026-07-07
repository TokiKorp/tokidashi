// Arbre de compétences (GDD §6.2) — les prérequis dessinent des branches,
// chaque compétence affiche le STADE requis. C'est la bascule vers
// l'autosuffisance : investir maintenant pour ne plus dépenser plus tard.

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
};

const STAGE_EMOJI: Record<string, string> = {
  egg: '🥚',
  blob: '🫧',
  child: '🧒',
};

interface Props {
  onClose: () => void;
}

/** Profondeur dans l'arbre = nombre d'ancêtres via `requires`. */
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
          Slots utilisés : {c.skills.length}/{cfg.stages[c.stage].skillSlots} au stade{' '}
          {cfg.stages[c.stage].label}
        </p>
        <ul className="skill-list">
          {cfg.skills.map((skill) => {
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
                style={{ marginLeft: depth * 16 }}
              >
                <div className="skill-head">
                  <strong>
                    {depth > 0 && <span className="skill-branch">└ </span>}
                    {skill.label}{' '}
                    <span className={`skill-cat cat-${skill.category}`}>
                      {CATEGORY_LABELS[skill.category]}
                    </span>{' '}
                    <span
                      className={`skill-stage ${stageLocked ? 'stage-locked' : ''}`}
                      title={`Stade requis : ${cfg.stages[skill.minStage].label}`}
                    >
                      {STAGE_EMOJI[skill.minStage]} {cfg.stages[skill.minStage].label}
                    </span>
                  </strong>
                  <span className="skill-cost">
                    {skill.costCurrency === 'token'
                      ? `🪙 ${formatTokens(skill.cost)} TOKEN`
                      : `🍞 ${skill.cost}`}
                    {' · '}étude {formatActiveDuration(skill.trainSeconds)}
                  </span>
                </div>
                <p className="skill-desc">{skill.description}</p>
                {progress?.state === 'owned' && (
                  <div className="skill-owned-row">
                    <span className="skill-badge owned">
                      Niv. {progress.level}/{maxLevelOf(cfg, skill.id)} ✓
                    </span>
                    {progress.upgrading && (
                      <span className="skill-badge learning">
                        Améliore… {Math.floor((progress.trainedSeconds / skill.trainSeconds) * 100)}%
                      </span>
                    )}
                    {!progress.upgrading &&
                      progress.level < maxLevelOf(cfg, skill.id) &&
                      !studying && (
                        <button className="btn-secondary btn-upgrade" onClick={() => upgrade(skill.id)}>
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
        <button className="btn-secondary" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
