// Panneau dev — accélérateur de sim, recharge de capacité simulée, gel manuel,
// remise à zéro. Aussi le lieu où la transparence du provider s'affiche
// (GDD §12 : le mode payant sera opt-in explicite, jamais par défaut).

import { useState } from 'react';
import { providerById } from '../ai';
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
    selectedCli,
    devMode,
    locked,
    setSimSpeed,
    refillCapacity,
    setUnlimitedTokens,
    resetSave,
    setLocked,
    setProvider,
    setSelectedCli,
    unlockDevMode,
  } = useTokidachi();
  const provider = providerById(providerId);
  const unlimited = game.capacity.unlimited ?? false;
  const [keyInput, setKeyInput] = useState('');

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>Réglages</h2>

        <section>
          <h3>Mode IA & Client</h3>
          
          <div style={{ margin: '8px 0', display: 'flex', gap: '6px', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#ccc' }}>Type de Provider :</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className={providerId === 'dev' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, padding: '8px', fontSize: '0.9em' }}
                onClick={() => setProvider('dev')}
              >
                🖥️ Mode DEV (Simulé)
              </button>
              <button
                className={providerId === 'cli' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, padding: '8px', fontSize: '0.9em' }}
                onClick={() => setProvider('cli')}
              >
                ⚙️ Mode Réel (CLI)
              </button>
            </div>
          </div>

          {providerId === 'cli' && (
            <div style={{ margin: '12px 0 8px 0', display: 'flex', gap: '6px', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#ccc' }}>Client CLI actif :</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {(['random', 'agy', 'codex', 'claude'] as const).map((cli) => (
                  <button
                    key={cli}
                    className={selectedCli === cli ? 'btn-primary' : 'btn-secondary'}
                    style={{ fontSize: '0.8em', padding: '6px 2px', textTransform: 'capitalize' }}
                    onClick={() => setSelectedCli(cli)}
                  >
                    {cli === 'random' ? '🎲 Auto' : cli}
                  </button>
                ))}
              </div>
            </div>
          )}

          {game.capacity.tokenBag !== undefined && (
            <p className="panel-hint" style={{ color: '#ffd700', fontWeight: 'bold', margin: '12px 0 8px 0' }}>
              💼 Sac de jetons : {formatTokens(game.capacity.tokenBag)} TOKEN
            </p>
          )}

          <p className="panel-hint">
            Capacité :{' '}
            {unlimited
              ? '∞ (illimitée)'
              : `${formatTokens(game.capacity.budget - game.capacity.used)}/${formatTokens(game.capacity.budget)} TOKEN`}
            {provider.kind === 'dev' && ' — simulée, aucun coût réel'}
            {provider.kind === 'cli' && ' — consommation réelle via CLIs'}
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
          {devMode ? (
            <>
              <p className="panel-hint" style={{ color: '#4caf50', fontWeight: 'bold', margin: '4px 0 8px 0' }}>
                ✓ Mode Dev Actif
              </p>
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
            </>
          ) : (
            <>
              <div className="row">
                {[1, 10, 60, 1000].map((x) => (
                  <button
                    key={x}
                    disabled={x !== 1}
                    className={cfg.simSpeed === x ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setSimSpeed(x)}
                    style={x !== 1 ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                  >
                    {x === 1 ? '×1' : '🔒'}
                  </button>
                ))}
              </div>
              
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8em', fontWeight: 'bold', color: '#aaa' }}>Activer le mode Dev :</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Clé secrète..."
                    style={{
                      flex: 1,
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #444',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      fontSize: '0.85em'
                    }}
                  />
                  <button
                    className="btn-primary"
                    style={{ padding: '6px 12px', fontSize: '0.85em' }}
                    onClick={() => {
                      unlockDevMode(keyInput);
                      setKeyInput('');
                    }}
                  >
                    Activer
                  </button>
                </div>
              </div>
            </>
          )}
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
