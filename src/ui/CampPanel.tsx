import { useEffect, useState } from 'react';
import { competenceModifiers } from '../game/outpost';
import {
  BASE_DECORATION_SLOTS,
  CRUMB_FISH_SELL_PRICE,
  DECORATIONS,
  FIRE_CAP_SECONDS,
  FISH_SPECIES,
  decorationById,
} from '../game/outpostConfig';
import { useTokidachi } from '../state/store';
import { CompetenceTab } from './CompetenceTab';
import { formatActiveDuration, formatCrumbs } from './format';
import { ICON_CRUMB, ICON_FIRE, ICON_FISH, ICON_STAR, ICON_WOOD } from './icons';
import { PixelIcon } from './PixelIcon';

interface Props {
  onClose: () => void;
}

export function CampPanel({ onClose }: Props) {
  const { game, stokeFire, startCooking, sellCrumbFish, buyDecoration } = useTokidachi();
  const [tab, setTab] = useState<'jeu' | 'maitrise'>('jeu');
  const [speciesId, setSpeciesId] = useState(FISH_SPECIES[0].id);
  const [batch, setBatch] = useState(1);
  const o = game.outpost;
  if (!o) return null;

  const mods = competenceModifiers(o);
  const fuelPct = Math.min(100, Math.floor((o.camp.fuelSeconds / FIRE_CAP_SECONDS) * 100));
  const cookable = FISH_SPECIES.filter((s) => Math.floor(o.resources.rawFish[s.id] ?? 0) >= 1);
  const maxSlots = BASE_DECORATION_SLOTS + mods.camp.extraDecorSlots;
  const owned = o.camp.decorations;
  const shopItems = DECORATIONS.filter((d) => !owned.includes(d.id));

  useEffect(() => {
    if (cookable.length > 0 && !cookable.some((s) => s.id === speciesId)) {
      setSpeciesId(cookable[0].id);
    }
  }, [cookable, speciesId]);

  useEffect(() => {
    if (batch > mods.camp.batchSize) setBatch(mods.camp.batchSize);
  }, [batch, mods.camp.batchSize]);

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
              <PixelIcon grid={ICON_FIRE} alt="" /> Feu de camp
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
            <section>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PixelIcon grid={ICON_FIRE} alt="" /> Le feu
              </h3>
              <div style={{ height: '10px', background: '#eee', borderRadius: '5px', overflow: 'hidden', border: '1px solid #ddd' }}>
                <div style={{ height: '100%', background: fuelPct > 0 ? '#e07a5f' : '#ccc', width: `${fuelPct}%` }} />
              </div>
              <p className="panel-hint">
                {formatActiveDuration(o.camp.fuelSeconds)} de feu restant · {formatCrumbs(o.resources.wood)} bois disponible
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary btn-mini" disabled={o.resources.wood < 1} onClick={() => stokeFire(1)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><PixelIcon grid={ICON_WOOD} alt="" size={12} /> +1 bois</span>
                </button>
                <button className="btn-secondary btn-mini" disabled={o.resources.wood < 10} onClick={() => stokeFire(10)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><PixelIcon grid={ICON_WOOD} alt="" size={12} /> +10 bois</span>
                </button>
              </div>
            </section>

            <section>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PixelIcon grid={ICON_FISH} alt="" /> Cuisson
              </h3>
              {o.camp.cooking ? (
                <>
                  <p className="panel-hint">
                    {o.camp.cooking.count}× {FISH_SPECIES.find((s) => s.id === o.camp.cooking!.speciesId)?.label ?? o.camp.cooking.speciesId} en cours
                  </p>
                  <div style={{ height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden', border: '1px solid #ddd' }}>
                    <div
                      style={{
                        height: '100%', background: 'var(--gold)',
                        width: `${Math.floor((1 - o.camp.cooking.remainingSeconds / o.camp.cooking.totalSeconds) * 100)}%`,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '0.75em', color: 'var(--ink-soft)' }}>
                    {formatActiveDuration(o.camp.cooking.remainingSeconds)} restant
                    {o.camp.fuelSeconds <= 0 && mods.camp.embersCookRatio <= 0 ? ' (en pause, pas de feu)' : ''}
                  </span>
                </>
              ) : cookable.length === 0 ? (
                <p className="panel-hint muted">Pêche du poisson à la Mare pour pouvoir cuisiner.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={speciesId}
                      onChange={(e) => setSpeciesId(e.target.value)}
                      style={{ flex: 1, padding: '4px', border: '2px solid var(--ink)', borderRadius: '4px', font: 'inherit' }}
                    >
                      {cookable.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} ({Math.floor(o.resources.rawFish[s.id] ?? 0)})
                        </option>
                      ))}
                    </select>
                    <select
                      value={batch}
                      onChange={(e) => setBatch(Number(e.target.value))}
                      style={{ padding: '4px', border: '2px solid var(--ink)', borderRadius: '4px', font: 'inherit' }}
                    >
                      {Array.from({ length: mods.camp.batchSize }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>×{n}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn-primary btn-mini"
                    disabled={(o.resources.rawFish[speciesId] ?? 0) < batch}
                    onClick={() => startCooking(speciesId, batch)}
                  >
                    Mettre sur le feu
                  </button>
                </div>
              )}
            </section>

            <section>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                Poisson-miette
              </h3>
              <p className="panel-hint">
                Stock : <strong>{formatCrumbs(o.resources.crumbFish)}</strong> · Prix de vente :{' '}
                {Math.round(CRUMB_FISH_SELL_PRICE * mods.camp.sellMult)} Miettes/unité
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary btn-mini" disabled={o.resources.crumbFish < 1} onClick={() => sellCrumbFish(1)}>Vendre ×1</button>
                <button className="btn-secondary btn-mini" disabled={o.resources.crumbFish < 10} onClick={() => sellCrumbFish(10)}>Vendre ×10</button>
                <button className="btn-secondary btn-mini" disabled={o.resources.crumbFish < 1} onClick={() => sellCrumbFish(Math.floor(o.resources.crumbFish))}>Vendre tout</button>
              </div>
            </section>

            <section>
              <h3>Décorations ({owned.length}/{maxSlots})</h3>
              {owned.length > 0 && (
                <p className="panel-hint">{owned.map((id) => decorationById(id)?.label ?? id).join(', ')}</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {shopItems.map((d) => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '6px 8px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '6px' }}>
                    <div>
                      <strong style={{ fontSize: '0.85em' }}>{d.label}</strong>
                      <p style={{ fontSize: '0.75em', color: 'var(--ink-soft)', margin: 0 }}>{d.description}</p>
                    </div>
                    <button
                      className="btn-secondary btn-mini"
                      disabled={owned.length >= maxSlots || game.wallet.crumbs < d.cost}
                      onClick={() => buyDecoration(d.id)}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <PixelIcon grid={ICON_CRUMB} alt="" size={10} /> {d.cost}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <CompetenceTab game="camp" />
        )}

        <button className="btn-secondary" style={{ marginTop: '10px' }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
