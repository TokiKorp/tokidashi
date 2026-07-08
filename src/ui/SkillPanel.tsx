// Arbre de compétences (GDD §6.2) — 100 compétences en six branches. Chaque
// branche est affichée sous forme de carte de progression horizontale (fog of war).
// Le panneau intègre également l'arbre de Prestige et le sacrifice précoce à 3 clics.

import { useState } from 'react';
import { maxStudies, studyingCount } from '../game/actions';
import { maxLevelOf, upgradeCost } from '../game/sim';
import type { SkillCategory } from '../game/types';
import { useTokidachi } from '../state/store';
import { formatActiveDuration, formatCrumbs, formatTokens } from './format';
import { PRESTIGE_SKILLS } from '../game/config';

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

export function SkillPanel({ onClose }: Props) {
  const { cfg, game, learn, upgrade, buyPrestigeSkill, prestigeEarly } = useTokidachi();
  const c = game.companion;
  const [tab, setTab] = useState<'skills' | 'prestige'>('skills');
  const [prestigeClicks, setPrestigeClicks] = useState(0);

  if (!c) return null;

  const stageIndex = cfg.stageOrder.indexOf(c.stage);
  const studies = studyingCount(c);
  const studyMax = maxStudies(c, cfg);
  const studying = studies >= studyMax;

  // Calcul du gain de prestige estimé
  const days = c.activeSeconds / 86400;
  const crumbsGen = c.totalCrumbsGenerated || 0;
  const estimatedPrestige = Math.floor(days * 10 + crumbsGen / 2000);

  const byId = new Map(cfg.skills.map((s) => [s.id, s]));

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
        
        {/* Onglets */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--ink)', marginBottom: '12px' }}>
          <button
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: tab === 'skills' ? 'var(--bg-panel)' : 'rgba(0,0,0,0.05)',
              borderBottom: tab === 'skills' ? '3px solid var(--gold)' : 'none',
              font: 'inherit',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: 'var(--ink)'
            }}
            onClick={() => setTab('skills')}
          >
            🧠 Compétences
          </button>
          <button
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: tab === 'prestige' ? 'var(--bg-panel)' : 'rgba(0,0,0,0.05)',
              borderBottom: tab === 'prestige' ? '3px solid var(--gold)' : 'none',
              font: 'inherit',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: 'var(--ink)'
            }}
            onClick={() => setTab('prestige')}
          >
            ✨ Prestige ({game.prestigePoints || 0} pts)
          </button>
        </div>

        {tab === 'skills' ? (
          <>
            <h2>Arbre de compétences</h2>
            <p className="panel-hint" style={{ marginBottom: '16px' }}>
              {cfg.skills.length} compétences · slots : {c.skills.length}/
              {cfg.stages[c.stage].skillSlots} au stade {cfg.stages[c.stage].label} · études :{' '}
              {studies}/{studyMax}
              {c.children.length > 0 && ' (les petits aident aux devoirs)'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              {CATEGORY_ORDER.map((cat) => {
                const branch = cfg.skills.filter((s) => s.category === cat);
                if (branch.length === 0) return null;

                // Fog of War: filter to show only owned, learning, or unlockable frontier
                const visibleBranch = branch.filter((skill) => {
                  const progress = c.skills.find((sp) => sp.skillId === skill.id);
                  if (progress) return true;
                  // accessible if requires are owned
                  const missing = (skill.requires ?? []).filter(
                    (id) => !c.skills.some((sp) => sp.skillId === id && sp.state === 'owned')
                  );
                  return missing.length === 0;
                });

                const ownedCount = branch.filter((s) =>
                  c.skills.some((sp) => sp.skillId === s.id && sp.state === 'owned')
                ).length;

                return (
                  <div key={cat} style={{ borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className={`skill-cat cat-${cat}`} style={{ fontWeight: 'bold' }}>
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <small style={{ color: 'var(--ink-soft)' }}>{ownedCount}/{branch.length}</small>
                    </div>

                    {/* Horizontal scroll map */}
                    <div style={{ display: 'flex', overflowX: 'auto', gap: '12px', padding: '8px 4px', alignItems: 'center', scrollbarWidth: 'thin' }}>
                      {visibleBranch.map((skill, index) => {
                        const progress = c.skills.find((sp) => sp.skillId === skill.id);
                        const stageLocked = stageIndex < cfg.stageOrder.indexOf(skill.minStage);
                        const missing = (skill.requires ?? []).filter(
                          (id) => !c.skills.some((sp) => sp.skillId === id && sp.state === 'owned')
                        );
                        const locked = !progress && (stageLocked || missing.length > 0);

                        return (
                          <div key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                            {index > 0 && <span style={{ fontSize: '1.2em', color: 'var(--ink-soft)' }}>➔</span>}
                            
                            <div
                              style={{
                                width: '180px',
                                background: progress?.state === 'owned' ? 'rgba(168,230,207,0.15)' : progress?.state === 'learning' || progress?.upgrading ? 'rgba(247,200,115,0.15)' : '#fff',
                                border: progress?.state === 'owned' ? '2px solid var(--mint-dark)' : progress?.state === 'learning' || progress?.upgrading ? '2px solid var(--gold)' : '2px solid var(--ink-soft)',
                                borderRadius: '8px',
                                padding: '8px',
                                fontSize: '0.85em',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                opacity: locked ? 0.6 : 1
                              }}
                            >
                              <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px' }} title={skill.label}>{skill.label}</span>
                                <span title={`Stade requis : ${cfg.stages[skill.minStage].label}`}>
                                  {STAGE_EMOJI[skill.minStage]}
                                </span>
                              </div>

                              <div style={{ color: 'var(--ink-soft)', fontSize: '0.9em', display: 'flex', justifyContent: 'space-between' }}>
                                <span>
                                  {skill.costCurrency === 'token' ? `🪙 ${formatTokens(skill.cost)}` : `🍞 ${skill.cost}`}
                                </span>
                                <span>{formatActiveDuration(skill.trainSeconds)}</span>
                              </div>

                              <p style={{ fontSize: '0.8em', margin: '2px 0', minHeight: '34px', color: 'var(--ink)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={skill.description}>
                                {skill.description}
                              </p>

                              {/* Actions */}
                              {progress?.state === 'owned' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8em', fontWeight: 'bold' }}>
                                    <span style={{ color: 'var(--mint-dark)' }}>Niv. {progress.level}/{maxLevelOf(cfg, skill.id)}</span>
                                    {progress.upgrading && <span style={{ color: 'var(--gold)' }}>Amélioration...</span>}
                                  </div>
                                  {progress.upgrading && (
                                    <div style={{ height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
                                      <div style={{ height: '100%', background: 'var(--gold)', width: `${Math.floor((progress.trainedSeconds / skill.trainSeconds) * 100)}%` }} />
                                    </div>
                                  )}
                                  {!progress.upgrading && progress.level < maxLevelOf(cfg, skill.id) && !studying && (
                                    <button
                                      className="btn-secondary btn-mini"
                                      style={{ padding: '2px 6px', fontSize: '0.9em', marginTop: '2px' }}
                                      onClick={() => upgrade(skill.id)}
                                    >
                                      Améliorer (🍞 {upgradeCost(cfg, skill.cost, progress.level + 1)})
                                    </button>
                                  )}
                                </div>
                              )}

                              {progress?.state === 'learning' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', fontWeight: 'bold', color: 'var(--gold)' }}>
                                    <span>Étude en cours...</span>
                                    <span>{Math.floor((progress.trainedSeconds / skill.trainSeconds) * 100)}%</span>
                                  </div>
                                  <div style={{ height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', background: 'var(--gold)', width: `${Math.floor((progress.trainedSeconds / skill.trainSeconds) * 100)}%` }} />
                                  </div>
                                </div>
                              )}

                              {!progress && locked && (
                                <div style={{ fontSize: '0.8em', color: 'var(--danger)', fontStyle: 'italic', marginTop: '4px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  🔒 {stageLocked ? `Stade ${cfg.stages[skill.minStage].label} requis` : `Nécessite ${missing.map((id) => byId.get(id)?.label ?? id).join(', ')}`}
                                </div>
                              )}

                              {!progress && !locked && (
                                <button
                                  className="btn-primary btn-mini"
                                  style={{ padding: '3px 8px', fontSize: '0.9em', marginTop: '4px' }}
                                  onClick={() => learn(skill.id)}
                                >
                                  Apprendre
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h2>Arbre de Prestige</h2>
            <p className="panel-hint" style={{ marginBottom: '16px' }}>
              Points accumulés : <strong>{game.prestigePoints || 0} pts</strong>.
              Ces compétences de prestige sont <strong>permanentes</strong> et s'appliquent à tous les prochains cycles !
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px', marginBottom: '16px' }}>
              {PRESTIGE_SKILLS.map((skill) => {
                const owned = game.prestigeSkills?.includes(skill.id);
                const affordable = (game.prestigePoints || 0) >= skill.cost;

                return (
                  <div
                    key={skill.id}
                    style={{
                      padding: '10px',
                      background: owned ? 'rgba(168,230,207,0.1)' : '#fff',
                      border: owned ? '2px solid var(--mint-dark)' : '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {skill.label}
                        {owned && <span style={{ color: 'var(--mint-dark)', fontSize: '0.9em' }}>✓</span>}
                      </div>
                      <p style={{ fontSize: '0.8em', color: 'var(--ink-soft)', marginTop: '2px' }}>{skill.description}</p>
                    </div>

                    <div>
                      {owned ? (
                        <span style={{ fontSize: '0.85em', color: 'var(--mint-dark)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Possédé</span>
                      ) : (
                        <button
                          className="btn-primary btn-mini"
                          style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}
                          disabled={!affordable}
                          onClick={() => buyPrestigeSkill(skill.id)}
                        >
                          🌟 {skill.cost} pts
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Prestige Early Section */}
            <div style={{ borderTop: '2px dashed rgba(0,0,0,0.1)', paddingTop: '16px', textAlign: 'center' }}>
              <h3>💀 Finir le cycle (Prestige précoce)</h3>
              <p className="panel-hint" style={{ maxWidth: '85%', margin: '4px auto 12px' }}>
                Sacrifier {c.name} pour recommencer le cycle immédiatement.
                <br />
                Gain estimé : <strong>+{estimatedPrestige} Points de Prestige</strong>
                <br />
                <span style={{ color: 'var(--ink-soft)' }}>
                  (Basé sur : {days.toFixed(1)}j actifs et {formatCrumbs(crumbsGen)} miettes générées)
                </span>
              </p>
              
              <button
                className="btn-danger"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '12px 24px',
                  fontSize: '1.1em',
                  cursor: 'pointer',
                  border: '3px solid var(--ink)',
                  borderRadius: '10px',
                  minWidth: '240px',
                  transition: 'background 0.2s',
                  background: prestigeClicks === 0 ? 'var(--pink)' : prestigeClicks === 1 ? '#ff7582' : '#e03a4b'
                }}
                onClick={() => {
                  if (prestigeClicks < 2) {
                    setPrestigeClicks((prev) => prev + 1);
                  } else {
                    setPrestigeClicks(0);
                    prestigeEarly();
                    onClose();
                  }
                }}
                onMouseLeave={() => setPrestigeClicks(0)}
              >
                💀 {prestigeClicks === 0 ? 'Sacrifier le Tokidachi' : prestigeClicks === 1 ? 'Validation : 2 clics de plus' : 'CONFIRMER : Dernier clic !'}
              </button>
            </div>
          </>
        )}

        <button className="btn-secondary" style={{ marginTop: '16px', display: 'block', width: '100%' }} onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
