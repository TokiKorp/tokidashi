import { competenceLevel, competencePointsAvailable, COMPETENCE_MAX_LEVEL, xpToReach } from '../game/outpost';
import { competenceNodesForGame } from '../game/outpostConfig';
import type { OutpostGame } from '../game/types';
import { useTokidachi } from '../state/store';
import { ICON_STAR } from './icons';
import { PixelIcon } from './PixelIcon';

interface Props {
  game: OutpostGame;
}

export function CompetenceTab({ game }: Props) {
  const { game: g, buyCompetenceNode } = useTokidachi();
  const state = g.outpost?.competences[game];
  if (!state) return null;

  const level = competenceLevel(state.xp);
  const prevXp = xpToReach(level);
  const nextXp = xpToReach(Math.min(COMPETENCE_MAX_LEVEL, level + 1));
  const progress = level >= COMPETENCE_MAX_LEVEL ? 1 : (state.xp - prevXp) / Math.max(1, nextXp - prevXp);
  const points = competencePointsAvailable(g.outpost!, game);
  const nodes = competenceNodesForGame(game);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>Niveau {level}{level >= COMPETENCE_MAX_LEVEL ? ' (max)' : ''}</strong>
        <span style={{ fontSize: '0.85em', color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <PixelIcon grid={ICON_STAR} alt="" size={12} /> {points} point{points > 1 ? 's' : ''} de maîtrise
        </span>
      </div>

      {level < COMPETENCE_MAX_LEVEL && (
        <div style={{ height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden', border: '1px solid #ddd' }}>
          <div style={{ height: '100%', background: 'var(--gold)', width: `${Math.floor(progress * 100)}%` }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {nodes.map((node) => {
          const owned = state.nodes.includes(node.id);
          const missing = (node.requires ?? []).filter((id) => !state.nodes.includes(id));
          const levelLocked = level < node.minLevel;
          const locked = !owned && (levelLocked || missing.length > 0);
          const affordable = !locked && points >= node.cost;

          return (
            <div
              key={node.id}
              style={{
                padding: '8px 10px',
                background: owned ? 'rgba(168,230,207,0.15)' : '#fff',
                border: owned ? '2px solid var(--mint-dark)' : '1px solid rgba(0,0,0,0.12)',
                borderRadius: '8px',
                opacity: locked ? 0.65 : 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.9em', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {node.label}
                  {owned && <span style={{ color: 'var(--mint-dark)' }}>✓</span>}
                </div>
                <p style={{ fontSize: '0.78em', color: 'var(--ink-soft)', margin: '2px 0 0' }}>{node.description}</p>
                {locked && (
                  <p style={{ fontSize: '0.75em', color: 'var(--danger)', fontStyle: 'italic', margin: '2px 0 0' }}>
                    {levelLocked
                      ? `Niveau ${node.minLevel} requis`
                      : `Nécessite : ${missing.map((id) => nodes.find((n) => n.id === id)?.label ?? id).join(', ')}`}
                  </p>
                )}
              </div>
              {!owned && (
                <button
                  className="btn-secondary btn-mini"
                  disabled={locked || !affordable}
                  onClick={() => buyCompetenceNode(game, node.id)}
                >
                  {node.cost} pt{node.cost > 1 ? 's' : ''}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
