// Arbre de compétences (GDD §6.2) — affiché en carte de nœuds SVG.
// Chaque branche = une ligne de nœuds reliés par des arcs. Clic = détail + actions.
// Le panneau intègre également l'arbre de Prestige et le sacrifice précoce à 3 clics.

import { useState } from 'react';
import { maxStudies, studyingCount } from '../game/actions';
import { maxLevelOf, upgradeCost } from '../game/sim';
import type { SkillCategory } from '../game/types';
import { useTokidachi } from '../state/store';
import { formatActiveDuration, formatCrumbs, formatTokens } from './format';
import { PRESTIGE_SKILLS, prestigeSkillBlocked } from '../game/config';
import {
  ICON_TOKEN, ICON_CRUMB, ICON_SKULL, ICON_TREE, ICON_STAR
} from './icons';
import { PixelIcon } from './PixelIcon';
import type { Grid } from '../render/pixel';

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  production: 'Production',
  automation: 'Automatisation',
  efficiency: 'Efficacité',
  conversion: 'Conversion',
  social: 'Sociale',
  defense: 'Défense',
  clicker: 'Clicker',
};

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  production: '#6fc7a8',   // mint
  automation: '#8ecae6',   // sky
  efficiency: '#f7c873',   // gold
  conversion: '#b06fd8',   // violet
  social: '#ff9aa2',       // pink
  defense: '#e07a5f',      // danger/orange
  clicker: '#4ecdc4',      // turquoise
};

const CATEGORY_ORDER: SkillCategory[] = [
  'production',
  'clicker',
  'automation',
  'efficiency',
  'conversion',
  'social',
  'defense',
];

// Icônes pixel art par stade (inline small)
const STAGE_ICON: Record<string, Grid> = {
  egg:     [
    '....oooo....','...oYYYYo...','..oYwYYYYo..','..oYYYYYYo..','..oYYwYYYo..','..oYYYYYYo..','...oYYYYo...','....oooo....','............','............','............','............'
  ],
  blob:    [
    '....oooo....','..ooGGGGoo..','..oGGwGGGo..','..oGGGGGGo..','..oGwGGGGo..','..oGGGGGGo..','...oGGGGo...','....oooo....','............','............','............','............'
  ],
  kid:     [
    '....oooo....','...oBBBBo...','..oBBwBBBo..','.ooBBBBBBoo.','..oBwBBwBo..','..oBBBBBBo..','...oBBBBo...','....oooo....','............','............','............','............'
  ],
  teen:    [
    '...oooooo...','..oMMMMMo...','..oMwMMMo...','..oMMMMMMo..','..oooooooo..','..oMMMMMo...','..oMMMMMo...','..oMMMMMo...','...oooooo...','............','............','............'
  ],
  adult:   [
    '....oooo....','...oBBBBo...','..oBBwBBBo..','..oBBBBBBo..','..ooooooo...','..oBBBBBBo..','..oBBBBBBo..','..oBBBBBBo..','...oooooo...','............','............','............'
  ],
  grandpa: [
    '....oooo....','...oBBBBo...','..oBwBBBBo..','..oBBBBBBo..','...oooooo...','..oGGGGGo...','..oGGGGGo...','..oGGGGGo...','...oooooo...','...oGGGo....','..oGGGGGo...','...oooooo...'
  ],
};

// ---------- Skill Node Map (constellation sur fond sombre) ----------
const NODE_R = 15; // rayon des nœuds
const COL_W = 68; // espacement horizontal
const LANE_H = 74; // hauteur d'une branche
const ZIGZAG = 12; // décalage vertical alterné (l'effet « toile »)
const PAD_X = 56; // place pour le nœud d'origine
const PAD_Y = 30;

const MAP_BG = '#232833';
const MAP_STAR = 'rgba(255,255,255,0.06)';

interface Props {
  onClose: () => void;
}

export function SkillPanel({ onClose }: Props) {
  const { cfg, game, learn, upgrade, buyPrestigeSkill, prestigeEarly } = useTokidachi();
  const c = game.companion;
  const [tab, setTab] = useState<'skills' | 'prestige'>('skills');
  const [prestigeClicks, setPrestigeClicks] = useState(0);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  if (!c) return null;

  const stageIndex = cfg.stageOrder.indexOf(c.stage);
  const studies = studyingCount(c);
  const studyMax = maxStudies(c, cfg);
  const studying = studies >= studyMax;

  // Prestige estimate
  const days = c.activeSeconds / 86400;
  const crumbsGen = c.totalCrumbsGenerated || 0;
  const estimatedPrestige = Math.floor(days * 10 + crumbsGen / 2000);

  const byId = new Map(cfg.skills.map((s) => [s.id, s]));

  // Compute SVG layout for the node map
  const rows = CATEGORY_ORDER.map((cat) => {
    const branch = cfg.skills.filter((s) => s.category === cat);
    return { cat, branch };
  }).filter((r) => r.branch.length > 0);

  const svgWidth = Math.max(...rows.map((r) => PAD_X + r.branch.length * COL_W + 30));
  const svgHeight = PAD_Y * 2 + rows.length * LANE_H;

  // Centre de chaque nœud : lanes horizontales avec zigzag → toile organique.
  const nodePos = (rowIdx: number, colIdx: number) => ({
    x: PAD_X + colIdx * COL_W + NODE_R,
    y: PAD_Y + rowIdx * LANE_H + LANE_H / 2 + (colIdx % 2 === 0 ? -ZIGZAG : ZIGZAG),
  });

  // Nœud d'origine (le Compagnon) d'où partent toutes les branches.
  const origin = { x: 22, y: PAD_Y + (rows.length * LANE_H) / 2 };

  const selectedSkill = selectedSkillId ? byId.get(selectedSkillId) : null;
  const selectedProgress = selectedSkill
    ? c.skills.find((sp) => sp.skillId === selectedSkill.id)
    : null;
  const selectedStageLocked = selectedSkill
    ? stageIndex < cfg.stageOrder.indexOf(selectedSkill.minStage)
    : false;
  const selectedMissing = selectedSkill
    ? (selectedSkill.requires ?? []).filter(
        (id) => !c.skills.some((sp) => sp.skillId === id && sp.state === 'owned')
      )
    : [];
  const selectedLocked = selectedSkill && !selectedProgress && (selectedStageLocked || selectedMissing.length > 0);

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(94vw, 620px)' }}>

        {/* Onglets */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--ink)', marginBottom: '12px' }}>
          <button
            style={{
              flex: 1, padding: '10px', border: 'none',
              background: tab === 'skills' ? 'var(--bg-panel)' : 'rgba(0,0,0,0.05)',
              borderBottom: tab === 'skills' ? '3px solid var(--gold)' : 'none',
              font: 'inherit', fontWeight: 'bold', cursor: 'pointer', color: 'var(--ink)'
            }}
            onClick={() => setTab('skills')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><PixelIcon grid={ICON_TREE} alt="" /> Compétences</span>
          </button>
          <button
            style={{
              flex: 1, padding: '10px', border: 'none',
              background: tab === 'prestige' ? 'var(--bg-panel)' : 'rgba(0,0,0,0.05)',
              borderBottom: tab === 'prestige' ? '3px solid var(--gold)' : 'none',
              font: 'inherit', fontWeight: 'bold', cursor: 'pointer', color: 'var(--ink)'
            }}
            onClick={() => setTab('prestige')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><PixelIcon grid={ICON_STAR} alt="" /> Prestige ({game.prestigePoints || 0} pts)</span>
          </button>
        </div>

        {tab === 'skills' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <h2 style={{ margin: 0 }}>Carte des compétences</h2>
              <small style={{ color: 'var(--ink-soft)' }}>
                Slots : {c.skills.length}/{cfg.stages[c.stage].skillSlots} · Études : {studies}/{studyMax}
              </small>
            </div>

            {/* Constellation des compétences — nœuds circulaires sur fond sombre */}
            <div style={{ overflow: 'auto', maxHeight: '340px', border: '2px solid var(--ink)', borderRadius: '8px', background: MAP_BG }}>
              <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
                {/* Poussière d'étoiles déterministe */}
                {Array.from({ length: 70 }, (_, i) => (
                  <circle
                    key={`star-${i}`}
                    cx={((i * 137) % svgWidth)}
                    cy={((i * 89 + 31) % svgHeight)}
                    r={i % 3 === 0 ? 1.5 : 1}
                    fill={MAP_STAR}
                  />
                ))}

                {/* Nœud d'origine : le Compagnon, d'où rayonnent les branches */}
                {rows.map((_, rowIdx) => {
                  const to = nodePos(rowIdx, 0);
                  return (
                    <path
                      key={`root-${rowIdx}`}
                      d={`M ${origin.x} ${origin.y} Q ${(origin.x + to.x) / 2} ${to.y} ${to.x - NODE_R} ${to.y}`}
                      fill="none"
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth={1.5}
                    />
                  );
                })}
                <circle cx={origin.x} cy={origin.y} r={13} fill="#f7c873" stroke="#fff" strokeWidth={2} />
                <text x={origin.x} y={origin.y + 4} textAnchor="middle" fontSize="12">🐣</text>

                {rows.map(({ cat, branch }, rowIdx) => {
                  const color = CATEGORY_COLORS[cat];
                  const laneY = PAD_Y + rowIdx * LANE_H;

                  return (
                    <g key={cat}>
                      <text
                        x={PAD_X}
                        y={laneY + 8}
                        fontSize="9"
                        fontFamily="'Courier New', monospace"
                        fontWeight="bold"
                        fill={color}
                        opacity={0.9}
                        style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
                      >
                        {CATEGORY_LABELS[cat]}
                      </text>

                      {/* Liens : lumineux si le tronçon est débloqué */}
                      {branch.map((skill, colIdx) => {
                        if (colIdx === 0) return null;
                        const from = nodePos(rowIdx, colIdx - 1);
                        const to = nodePos(rowIdx, colIdx);
                        const prevOwned = c.skills.some(
                          (sp) => sp.skillId === branch[colIdx - 1].id && sp.state === 'owned'
                        );
                        return (
                          <line
                            key={`line-${skill.id}`}
                            x1={from.x + NODE_R}
                            y1={from.y}
                            x2={to.x - NODE_R}
                            y2={to.y}
                            stroke={prevOwned ? color : 'rgba(255,255,255,0.22)'}
                            strokeWidth={prevOwned ? 2.5 : 1.5}
                            strokeDasharray={prevOwned ? undefined : '3 4'}
                          />
                        );
                      })}

                      {/* Nœuds circulaires */}
                      {branch.map((skill, colIdx) => {
                        const pos = nodePos(rowIdx, colIdx);
                        const progress = c.skills.find((sp) => sp.skillId === skill.id);
                        const stageLocked = stageIndex < cfg.stageOrder.indexOf(skill.minStage);
                        const missingReqs = (skill.requires ?? []).filter(
                          (id) => !c.skills.some((sp) => sp.skillId === id && sp.state === 'owned')
                        );
                        const isLocked = !progress && (stageLocked || missingReqs.length > 0);
                        const isSelected = selectedSkillId === skill.id;
                        const isOwned = progress?.state === 'owned';
                        const isLearning = progress?.state === 'learning' || progress?.upgrading;
                        const level = progress?.level ?? 0;
                        const maxLvl = maxLevelOf(cfg, skill.id);

                        return (
                          <g
                            key={skill.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedSkillId(isSelected ? null : skill.id)}
                          >
                            {/* Halo des nœuds acquis / en étude */}
                            {(isOwned || isLearning) && (
                              <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={NODE_R + 5}
                                fill="none"
                                stroke={isOwned ? color : '#f7c873'}
                                strokeWidth={2}
                                opacity={0.35}
                              />
                            )}

                            {/* Cercle principal */}
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={NODE_R}
                              fill={isOwned ? color : isLearning ? 'rgba(247,200,115,0.25)' : MAP_BG}
                              stroke={
                                isSelected
                                  ? '#ffffff'
                                  : isOwned || isLearning || !isLocked
                                    ? color
                                    : 'rgba(255,255,255,0.25)'
                              }
                              strokeWidth={isSelected ? 3 : isOwned ? 2.5 : 2}
                              opacity={isLocked && !isSelected ? 0.55 : 1}
                            />

                            {/* Progression d'étude : arc doré */}
                            {isLearning && progress && (
                              <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={NODE_R}
                                fill="none"
                                stroke="#f7c873"
                                strokeWidth={3}
                                strokeDasharray={`${2 * Math.PI * NODE_R * Math.min(1, progress.trainedSeconds / skill.trainSeconds)} ${2 * Math.PI * NODE_R}`}
                                transform={`rotate(-90 ${pos.x} ${pos.y})`}
                              />
                            )}

                            {/* Contenu : cadenas / coût / niveau */}
                            <text
                              x={pos.x}
                              y={pos.y + 3.5}
                              textAnchor="middle"
                              fontSize={isOwned ? '10' : '8'}
                              fontFamily="'Courier New', monospace"
                              fontWeight="bold"
                              fill={isOwned ? MAP_BG : isLocked ? 'rgba(255,255,255,0.4)' : '#fff'}
                            >
                              {isLocked
                                ? '🔒'
                                : isOwned
                                  ? `${level}`
                                  : skill.costCurrency === 'token'
                                    ? `${formatTokens(skill.cost)}`
                                    : `${skill.cost}`}
                            </text>

                            {/* Pips de niveau autour du nœud acquis */}
                            {isOwned &&
                              Array.from({ length: maxLvl }, (_, i) => {
                                const angle = -Math.PI / 2 + (i * 2 * Math.PI) / maxLvl;
                                return (
                                  <circle
                                    key={i}
                                    cx={pos.x + Math.cos(angle) * (NODE_R + 5)}
                                    cy={pos.y + Math.sin(angle) * (NODE_R + 5)}
                                    r={1.8}
                                    fill={i < level ? '#f7c873' : 'rgba(255,255,255,0.25)'}
                                  />
                                );
                              })}

                            {/* Libellé sous le nœud */}
                            <text
                              x={pos.x}
                              y={pos.y + NODE_R + 13}
                              textAnchor="middle"
                              fontSize="7.5"
                              fontFamily="'Courier New', monospace"
                              fill={isLocked ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)'}
                            >
                              {skill.label.length > 11 ? skill.label.slice(0, 10) + '…' : skill.label}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Detail panel for selected node */}
            {selectedSkill && (
              <div style={{
                marginTop: '10px',
                padding: '12px',
                background: selectedLocked ? 'rgba(0,0,0,0.03)' : selectedProgress?.state === 'owned' ? 'rgba(111,199,168,0.1)' : '#fff',
                border: `2px solid ${CATEGORY_COLORS[selectedSkill.category as SkillCategory]}`,
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ fontSize: '1em' }}>{selectedSkill.label}</strong>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px', fontSize: '0.82em', color: 'var(--ink-soft)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        {selectedSkill.costCurrency === 'token'
                          ? <><PixelIcon grid={ICON_TOKEN} alt="" size={10} /> {formatTokens(selectedSkill.cost)}</>
                          : <><PixelIcon grid={ICON_CRUMB} alt="" size={10} /> {selectedSkill.cost}</>}
                      </span>
                      <span>· {formatActiveDuration(selectedSkill.trainSeconds)}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        · Stade <PixelIcon grid={STAGE_ICON[selectedSkill.minStage]} alt={selectedSkill.minStage} size={10} />
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedSkillId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em', color: 'var(--ink-soft)', lineHeight: 1 }}>×</button>
                </div>

                <p style={{ fontSize: '0.85em', color: 'var(--ink)', margin: 0 }}>{selectedSkill.description}</p>

                {/* Actions */}
                {selectedLocked && (
                  <div style={{ fontSize: '0.82em', color: 'var(--danger)', fontStyle: 'italic' }}>
                    ■ {selectedStageLocked
                      ? `Stade ${cfg.stages[selectedSkill.minStage].label} requis`
                      : `Nécessite : ${selectedMissing.map((id) => byId.get(id)?.label ?? id).join(', ')}`}
                  </div>
                )}

                {!selectedProgress && !selectedLocked && (
                  <button
                    className="btn-primary btn-mini"
                    style={{ alignSelf: 'flex-start', padding: '4px 12px' }}
                    onClick={() => { learn(selectedSkill.id); setSelectedSkillId(null); }}
                  >
                    Apprendre
                  </button>
                )}

                {selectedProgress?.state === 'learning' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82em', fontWeight: 'bold', color: 'var(--gold)' }}>
                      <span>Étude en cours…</span>
                      <span>{Math.floor((selectedProgress.trainedSeconds / selectedSkill.trainSeconds) * 100)}%</span>
                    </div>
                    <div style={{ height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden', border: '1px solid #ddd' }}>
                      <div style={{ height: '100%', background: 'var(--gold)', width: `${Math.floor((selectedProgress.trainedSeconds / selectedSkill.trainSeconds) * 100)}%`, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )}

                {selectedProgress?.state === 'owned' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82em', fontWeight: 'bold' }}>
                      <span style={{ color: 'var(--mint-dark)' }}>Niv. {selectedProgress.level}/{maxLevelOf(cfg, selectedSkill.id)}</span>
                      {selectedProgress.upgrading && <span style={{ color: 'var(--gold)' }}>Amélioration…</span>}
                    </div>
                    {selectedProgress.upgrading && (
                      <div style={{ height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden', border: '1px solid #ddd' }}>
                        <div style={{ height: '100%', background: 'var(--gold)', width: `${Math.floor((selectedProgress.trainedSeconds / selectedSkill.trainSeconds) * 100)}%`, transition: 'width 0.5s' }} />
                      </div>
                    )}
                    {!selectedProgress.upgrading && selectedProgress.level < maxLevelOf(cfg, selectedSkill.id) && !studying && (
                      <button
                        className="btn-secondary btn-mini"
                        style={{ alignSelf: 'flex-start', padding: '4px 12px' }}
                        onClick={() => upgrade(selectedSkill.id)}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          Améliorer (<PixelIcon grid={ICON_CRUMB} alt="" size={9} /> {upgradeCost(cfg, selectedSkill.cost, selectedProgress.level + 1)})
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!selectedSkill && (
              <p style={{ fontSize: '0.8em', color: 'var(--ink-soft)', marginTop: '8px', textAlign: 'center' }}>
                Clique sur un nœud pour voir les détails et agir.
              </p>
            )}
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
                const missing = prestigeSkillBlocked(skill, game.prestigeSkills ?? []);

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
                      {!owned && missing && (
                        <p style={{ fontSize: '0.78em', color: 'var(--danger)', fontStyle: 'italic', marginTop: '2px' }}>
                          Nécessite : {missing.map((id) => PRESTIGE_SKILLS.find((s) => s.id === id)?.label ?? id).join(', ')}
                        </p>
                      )}
                    </div>

                    <div>
                      {owned ? (
                        <span style={{ fontSize: '0.85em', color: 'var(--mint-dark)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Possédé</span>
                      ) : (
                        <button
                          className="btn-primary btn-mini"
                          style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}
                          disabled={!affordable || !!missing}
                          onClick={() => buyPrestigeSkill(skill.id)}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><PixelIcon grid={ICON_STAR} alt="" /> {skill.cost} pts</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Prestige Early Section */}
            <div style={{ borderTop: '2px dashed rgba(0,0,0,0.1)', paddingTop: '16px', textAlign: 'center' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <PixelIcon grid={ICON_SKULL} alt="" /> Finir le cycle (Prestige précoce)
              </h3>
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
                <PixelIcon grid={ICON_SKULL} alt="" />{' '}
                {prestigeClicks === 0 ? 'Sacrifier le Tokidachi' : prestigeClicks === 1 ? 'Validation : 2 clics de plus' : 'CONFIRMER : Dernier clic !'}
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
