// Panneau dev — accélérateur de sim, recharge de capacité simulée, gel manuel,
// remise à zéro. Aussi le lieu où la transparence du provider s'affiche
// (GDD §12 : le mode payant sera opt-in explicite, jamais par défaut).

import { listProviders, providerById } from '../ai';
import { useTokidachi } from '../state/store';
import { formatTokens } from './format';

interface Props {
  onClose: () => void;
}

export function DevPanel({ onClose }: Props) {
  const {
    cfg,
    game,
    providerId,
    locked,
    setSimSpeed,
    refillCapacity,
    setUnlimitedTokens,
    resetSave,
    setLocked,
  } = useTokidachi();
  const provider = providerById(providerId);
  const unlimited = game.capacity.unlimited ?? false;

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>Réglages</h2>

        <section>
          <h3>Provider IA</h3>
          <p className="panel-hint">{provider.label}</p>
          <p className="panel-hint">
            Capacité :{' '}
            {unlimited
              ? '∞ (illimitée)'
              : `${formatTokens(game.capacity.budget - game.capacity.used)}/${formatTokens(game.capacity.budget)} TOKEN`}
            {provider.kind === 'dev' && ' — simulée, aucun coût réel'}
          </p>
          <p className="panel-hint muted">
            Providers disponibles : {listProviders().map((p) => p.label).join(', ')}.
            Gemini free / Ollama / payant opt-in : à venir.
          </p>
          {provider.kind === 'dev' && (
            <>
              <button
                className={unlimited ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setUnlimitedTokens(!unlimited)}
              >
                TOKEN illimités : {unlimited ? 'ON' : 'OFF'}
              </button>
              {!unlimited && (
                <button className="btn-secondary" onClick={refillCapacity}>
                  Recharger la capacité simulée
                </button>
              )}
            </>
          )}
        </section>

        <section>
          <h3>Simulation</h3>
          <div className="row">
            {[1, 10, 60, 1000].map((x) => (
              <button
                key={x}
                className={cfg.simSpeed === x ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setSimSpeed(x)}
              >
                ×{x}
              </button>
            ))}
          </div>
          <button className="btn-secondary" onClick={() => setLocked(!locked)}>
            {locked ? 'Simuler le déverrouillage' : 'Simuler le verrouillage'}
          </button>
        </section>

        <section>
          <h3>Danger</h3>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('Effacer la sauvegarde (Compagnon + mémorial) ?')) {
                void resetSave();
                onClose();
              }
            }}
          >
            Réinitialiser la sauvegarde
          </button>
        </section>

        <button className="btn-secondary" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
