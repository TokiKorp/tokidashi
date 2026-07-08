import { useEffect, useRef, useState } from 'react';
import { competenceModifiers } from '../game/outpost';
import { BITE_WINDOW_SECONDS, CAST_WAIT_MAX_SECONDS, CAST_WAIT_MIN_SECONDS, fishSpeciesById } from '../game/outpostConfig';
import { useTokidachi } from '../state/store';
import { CompetenceTab } from './CompetenceTab';
import { ICON_FISH, ICON_ROD, ICON_STAR } from './icons';
import { PixelIcon } from './PixelIcon';

type Phase = 'idle' | 'waiting' | 'bite' | 'result';

interface Props {
  onClose: () => void;
}

export function PoolPanel({ onClose }: Props) {
  const { game, locked, castResolve, poolCatch } = useTokidachi();
  const [tab, setTab] = useState<'jeu' | 'maitrise'>('jeu');
  const [phase, setPhase] = useState<Phase>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  useEffect(() => {
    if (locked) {
      clearTimer();
      setPhase('idle');
    }
  }, [locked]);

  const o = game.outpost;
  if (!o) return null;
  const mods = competenceModifiers(o);

  const cast = () => {
    clearTimer();
    setPhase('waiting');
    const delayMs =
      (CAST_WAIT_MIN_SECONDS + Math.random() * (CAST_WAIT_MAX_SECONDS - CAST_WAIT_MIN_SECONDS)) *
      mods.pool.biteDelayMult *
      1000;
    timeoutRef.current = setTimeout(() => {
      setPhase('bite');
      const windowMs = BITE_WINDOW_SECONDS * mods.pool.biteWindowMult * 1000;
      timeoutRef.current = setTimeout(() => {
        castResolve(false);
        setPhase('result');
      }, windowMs);
    }, delayMs);
  };

  const onBiteClick = () => {
    clearTimer();
    castResolve(true);
    setPhase('result');
  };

  const reset = () => {
    clearTimer();
    setPhase('idle');
  };

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(94vw, 420px)' }}>
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
              <PixelIcon grid={ICON_ROD} alt="" /> La Mare
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '18px 0' }}>
            <p className="panel-hint">
              Lancers : {o.pool.casts} · Prises : {o.pool.catches} · Meilleur tier : {o.pool.bestTier || '—'}
            </p>

            {phase === 'idle' && (
              <button className="btn-primary" onClick={cast} disabled={locked}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <PixelIcon grid={ICON_ROD} alt="" /> Lancer la ligne
                </span>
              </button>
            )}

            {phase === 'waiting' && <p style={{ fontStyle: 'italic', color: 'var(--ink-soft)' }}>La ligne est à l'eau…</p>}

            {phase === 'bite' && (
              <button
                className="btn-danger"
                onClick={onBiteClick}
                style={{ fontSize: '1.15em', padding: '16px 28px', border: '3px solid var(--ink)', borderRadius: '10px', cursor: 'pointer' }}
              >
                Ça mord ! Ferre !
              </button>
            )}

            {phase === 'result' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                {!poolCatch && <p>Raté… trop lent !</p>}
                {poolCatch?.lost && (
                  <p>La ligne a cassé… ({fishSpeciesById(poolCatch.speciesId)?.label ?? poolCatch.speciesId} échappé)</p>
                )}
                {poolCatch && !poolCatch.lost && (
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <PixelIcon grid={ICON_FISH} alt="" /> {fishSpeciesById(poolCatch.speciesId)?.label ?? poolCatch.speciesId} attrapé
                    {poolCatch.doubled ? ' ×2' : ''} !
                  </p>
                )}
                <button className="btn-secondary btn-mini" onClick={reset}>Relancer</button>
              </div>
            )}
          </div>
        ) : (
          <CompetenceTab game="pool" />
        )}

        <button className="btn-secondary" style={{ marginTop: '10px' }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
