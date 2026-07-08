import { useState } from 'react';
import {
  availableGardenPlots,
  competenceModifiers,
  effectiveGrowSeconds,
  effectiveRestSeconds,
  isTreeMature,
} from '../game/outpost';
import { MAX_GARDEN_PLOTS, SAPLING_COST, traitById } from '../game/outpostConfig';
import type { TreeRarity } from '../game/types';
import { useTokidachi } from '../state/store';
import { CompetenceTab } from './CompetenceTab';
import { formatActiveDuration, formatCrumbs } from './format';
import { ICON_CRUMB, ICON_SAPLING, ICON_STAR, ICON_WOOD } from './icons';
import { PixelIcon } from './PixelIcon';

const RARITY_LABELS: Record<TreeRarity, string> = {
  common: 'Commun',
  uncommon: 'Peu commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

const RARITY_COLORS: Record<TreeRarity, string> = {
  common: '#9aa5b1',
  uncommon: '#6fc7a8',
  rare: '#8ecae6',
  epic: '#b06fd8',
  legendary: '#f4c542',
};

interface Props {
  onClose: () => void;
}

export function GardenPanel({ onClose }: Props) {
  const { game, plantSapling, harvestTree } = useTokidachi();
  const [tab, setTab] = useState<'jeu' | 'maitrise'>('jeu');
  const o = game.outpost;
  if (!o) return null;

  const mods = competenceModifiers(o);
  const available = availableGardenPlots(mods);

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(94vw, 460px)' }}>
        <div style={{ display: 'flex', borderBottom: '2px solid var(--ink)', marginBottom: '10px' }}>
          <button
            style={{
              flex: 1, padding: '10px', border: 'none',
              background: tab === 'jeu' ? 'var(--bg-panel)' : 'rgba(0,0,0,0.05)',
              borderBottom: tab === 'jeu' ? '3px solid var(--gold)' : 'none',
              font: 'inherit', fontWeight: 'bold', cursor: 'pointer', color: 'var(--ink)',
            }}
            onClick={() => setTab('jeu')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <PixelIcon grid={ICON_SAPLING} alt="" /> Jardin
            </span>
          </button>
          <button
            style={{
              flex: 1, padding: '10px', border: 'none',
              background: tab === 'maitrise' ? 'var(--bg-panel)' : 'rgba(0,0,0,0.05)',
              borderBottom: tab === 'maitrise' ? '3px solid var(--gold)' : 'none',
              font: 'inherit', fontWeight: 'bold', cursor: 'pointer', color: 'var(--ink)',
            }}
            onClick={() => setTab('maitrise')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <PixelIcon grid={ICON_STAR} alt="" /> Maîtrise
            </span>
          </button>
        </div>

        {tab === 'jeu' ? (
          <>
            <p className="panel-hint" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <PixelIcon grid={ICON_CRUMB} alt="" /> {formatCrumbs(game.wallet.crumbs)}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <PixelIcon grid={ICON_WOOD} alt="" /> {formatCrumbs(o.resources.wood)} bois
              </span>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
              {Array.from({ length: MAX_GARDEN_PLOTS }, (_, i) => i).map((i) => {
                const tree = o.garden.plots[i];
                const unlocked = i < available;

                if (!unlocked) {
                  return (
                    <div key={i} style={{ padding: '10px', border: '1px dashed rgba(0,0,0,0.2)', borderRadius: '8px', opacity: 0.5, textAlign: 'center', fontSize: '0.82em' }}>
                      🔒 Parcelle verrouillée
                    </div>
                  );
                }

                if (!tree) {
                  return (
                    <div key={i} style={{ padding: '10px', border: '2px dashed var(--ink)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82em', color: 'var(--ink-soft)' }}>Parcelle vide</span>
                      <button
                        className="btn-primary btn-mini"
                        disabled={game.wallet.crumbs < SAPLING_COST}
                        onClick={() => plantSapling(i)}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <PixelIcon grid={ICON_SAPLING} alt="" size={12} /> Planter (<PixelIcon grid={ICON_CRUMB} alt="" size={10} /> {SAPLING_COST})
                        </span>
                      </button>
                    </div>
                  );
                }

                const mature = isTreeMature(tree, mods);
                const growCap = effectiveGrowSeconds(tree, mods);
                const growPct = Math.min(100, Math.floor((tree.growthSeconds / growCap) * 100));
                const restCap = effectiveRestSeconds(tree, mods);
                const restPct = tree.restSeconds > 0 ? Math.floor((tree.restSeconds / restCap) * 100) : 0;

                return (
                  <div key={i} style={{ padding: '10px', border: `2px solid ${RARITY_COLORS[tree.rarity]}`, borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82em' }}>
                      <strong>Tier {tree.tier}</strong>
                      <span style={{ color: RARITY_COLORS[tree.rarity] }}>{RARITY_LABELS[tree.rarity]}</span>
                    </div>
                    {tree.traits.length > 0 && (
                      <p style={{ fontSize: '0.72em', color: 'var(--ink-soft)', margin: 0 }}>
                        {tree.traits.map((id) => traitById(id)?.label ?? id).join(', ')}
                      </p>
                    )}
                    {!mature ? (
                      <>
                        <div style={{ height: '5px', background: '#eee', borderRadius: '3px', overflow: 'hidden', border: '1px solid #ddd' }}>
                          <div style={{ height: '100%', background: 'var(--mint-dark)', width: `${growPct}%` }} />
                        </div>
                        <span style={{ fontSize: '0.72em', color: 'var(--ink-soft)' }}>
                          Pousse — {formatActiveDuration(Math.max(0, growCap - tree.growthSeconds))} restant
                        </span>
                      </>
                    ) : tree.restSeconds > 0 ? (
                      <>
                        <div style={{ height: '5px', background: '#eee', borderRadius: '3px', overflow: 'hidden', border: '1px solid #ddd' }}>
                          <div style={{ height: '100%', background: '#8ecae6', width: `${restPct}%` }} />
                        </div>
                        <span style={{ fontSize: '0.72em', color: 'var(--ink-soft)' }}>
                          Repos — {formatActiveDuration(tree.restSeconds)} restant
                        </span>
                      </>
                    ) : (
                      <button className="btn-primary btn-mini" onClick={() => harvestTree(i)}>
                        Récolter
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <CompetenceTab game="garden" />
        )}

        <button className="btn-secondary" style={{ marginTop: '10px' }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
