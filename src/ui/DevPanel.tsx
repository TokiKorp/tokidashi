// Panneau dev — accélérateur de sim, recharge de capacité simulée, gel manuel,
// remise à zéro. Aussi le lieu où la transparence du provider s'affiche
// (GDD §12 : le mode payant sera opt-in explicite, jamais par défaut).

import { useState } from 'react';
import { providerById } from '../ai';
import { useTokidachi } from '../state/store';
import { formatTokens } from './format';
import { TRANSLATIONS } from './translations';

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
    disableDevMode,
    language,
    setLanguage,
    notificationsEnabled,
    notifyThingsDone,
    notifyNeedsAttention,
    setNotificationsEnabled,
    setNotifyThingsDone,
    setNotifyNeedsAttention,
    disableEnemies,
    setDisableEnemies,
  } = useTokidachi();
  const provider = providerById(providerId);
  const unlimited = game.capacity.unlimited ?? false;
  const [keyInput, setKeyInput] = useState('');
  
  const t = TRANSLATIONS[language];

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>{t.settings}</h2>

        <section>
          <h3>{t.ai_provider}</h3>
          
          {/* Language Selector */}
          <div style={{ margin: '0 0 12px 0', display: 'flex', gap: '6px', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: 'var(--ink-soft)' }}>{t.language}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className={language === 'fr' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, padding: '6px', fontSize: '0.85em' }}
                onClick={() => setLanguage('fr')}
              >
                🇫🇷 Français
              </button>
              <button
                className={language === 'en' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, padding: '6px', fontSize: '0.85em' }}
                onClick={() => setLanguage('en')}
              >
                🇬🇧 English
              </button>
            </div>
          </div>

          <div style={{ margin: '8px 0', display: 'flex', gap: '6px', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: 'var(--ink-soft)' }}>{t.provider_type}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className={providerId === 'dev' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, padding: '8px', fontSize: '0.9em' }}
                onClick={() => setProvider('dev')}
              >
                {t.dev_mode_simulated}
              </button>
              <button
                className={providerId === 'cli' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, padding: '8px', fontSize: '0.9em' }}
                onClick={() => setProvider('cli')}
              >
                {t.real_mode_cli}
              </button>
            </div>
          </div>

          {providerId === 'cli' && (
            <div style={{ margin: '12px 0 8px 0', display: 'flex', gap: '6px', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: 'var(--ink-soft)' }}>{t.active_cli_client}</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {(['random', 'agy', 'codex', 'claude'] as const).map((cli) => (
                  <button
                    key={cli}
                    className={selectedCli === cli ? 'btn-primary' : 'btn-secondary'}
                    style={{ fontSize: '0.8em', padding: '6px 2px', textTransform: 'capitalize' }}
                    onClick={() => setSelectedCli(cli)}
                  >
                    {cli === 'random' ? (language === 'fr' ? '🎲 Auto' : '🎲 Auto') : cli}
                  </button>
                ))}
              </div>
            </div>
          )}

          {game.capacity.tokenBag !== undefined && (
            <p className="panel-hint" style={{ color: '#ffd700', fontWeight: 'bold', margin: '12px 0 8px 0' }}>
              {t.token_bag} {formatTokens(game.capacity.tokenBag)} TOKEN
            </p>
          )}

          <p className="panel-hint">
            {t.capacity}{' '}
            {unlimited
              ? (language === 'fr' ? '∞ (illimitée)' : '∞ (unlimited)')
              : `${formatTokens(game.capacity.budget - game.capacity.used)}/${formatTokens(game.capacity.budget)} TOKEN`}
            {provider.kind === 'dev' && t.simulated_no_cost}
            {provider.kind === 'cli' && t.real_consumption}
          </p>

          {provider.kind === 'dev' && (
            <>
              <button
                className={unlimited ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setUnlimitedTokens(!unlimited)}
              >
                {t.unlimited_tokens} {unlimited ? 'ON' : 'OFF'}
              </button>
              {!unlimited && (
                <button className="btn-secondary" onClick={refillCapacity}>
                  {t.refill_capacity}
                </button>
              )}
            </>
          )}
        </section>

        <section>
          <h3>{t.notifications}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Pixel toggle: Notifications enabled */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            >
              <div style={{
                width: '32px', height: '16px',
                background: notificationsEnabled ? 'var(--mint-dark)' : '#ccc',
                border: '2px solid var(--ink)',
                borderRadius: '2px',
                position: 'relative',
                transition: 'background 0.15s',
                imageRendering: 'pixelated',
                flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute',
                  top: '1px',
                  left: notificationsEnabled ? '13px' : '1px',
                  width: '10px', height: '10px',
                  background: 'var(--ink)',
                  transition: 'left 0.15s',
                }} />
              </div>
              <span style={{ fontSize: '0.9em', color: 'var(--ink)', userSelect: 'none' }}>{t.notifications_enabled}</span>
            </div>

            {notificationsEnabled && (
              <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '3px solid var(--ink-soft)', marginTop: '2px' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                  onClick={() => setNotifyThingsDone(!notifyThingsDone)}
                >
                  <div style={{
                    width: '32px', height: '16px',
                    background: notifyThingsDone ? 'var(--mint-dark)' : '#ccc',
                    border: '2px solid var(--ink)',
                    borderRadius: '2px',
                    position: 'relative',
                    transition: 'background 0.15s',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '1px',
                      left: notifyThingsDone ? '13px' : '1px',
                      width: '10px', height: '10px',
                      background: 'var(--ink)',
                      transition: 'left 0.15s',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.85em', color: 'var(--ink-soft)', userSelect: 'none' }}>{t.notify_things_done}</span>
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                  onClick={() => setNotifyNeedsAttention(!notifyNeedsAttention)}
                >
                  <div style={{
                    width: '32px', height: '16px',
                    background: notifyNeedsAttention ? 'var(--mint-dark)' : '#ccc',
                    border: '2px solid var(--ink)',
                    borderRadius: '2px',
                    position: 'relative',
                    transition: 'background 0.15s',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '1px',
                      left: notifyNeedsAttention ? '13px' : '1px',
                      width: '10px', height: '10px',
                      background: 'var(--ink)',
                      transition: 'left 0.15s',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.85em', color: 'var(--ink-soft)', userSelect: 'none' }}>{t.notify_needs_attention}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3>{t.simulation}</h3>
          {devMode ? (
            <>
              <p className="panel-hint" style={{ color: '#4caf50', fontWeight: 'bold', margin: '4px 0 8px 0' }}>
                {t.dev_mode_active}
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
                {locked 
                  ? (language === 'fr' ? 'Simuler le déverrouillage' : 'Simulate Unlock') 
                  : (language === 'fr' ? 'Simuler le verrouillage' : 'Simulate Lock')}
              </button>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '8px', marginBottom: '8px' }}
                onClick={() => setDisableEnemies(!disableEnemies)}
              >
                <div style={{
                  width: '32px', height: '16px',
                  background: disableEnemies ? 'var(--mint-dark)' : '#ccc',
                  border: '2px solid var(--ink)',
                  borderRadius: '2px',
                  position: 'relative',
                  transition: 'background 0.15s',
                  flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '1px',
                    left: disableEnemies ? '13px' : '1px',
                    width: '10px', height: '10px',
                    background: 'var(--ink)',
                    transition: 'left 0.15s',
                  }} />
                </div>
                <span style={{ fontSize: '0.9em', color: 'var(--ink)', userSelect: 'none' }}>
                  {language === 'fr' ? 'Désactiver les ennemis (Pigeon, fourmis…)' : 'Disable enemies (Pigeon, ants…)'}
                </span>
              </div>
              <button 
                className="btn-danger" 
                style={{ marginTop: '8px', padding: '6px' }} 
                onClick={disableDevMode}
              >
                {t.deactivate_dev_mode}
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
                <label style={{ fontSize: '0.8em', fontWeight: 'bold', color: 'var(--ink-soft)' }}>{t.activate_dev_mode_label}</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder={t.secret_key}
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
                    {t.activate}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section>
          <h3>{t.danger}</h3>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm(t.confirm_reset)) {
                void resetSave();
                onClose();
              }
            }}
          >
            {t.reset_save}
          </button>
        </section>

        <button className="btn-secondary" onClick={onClose}>{t.close}</button>
      </div>
    </div>
  );
}
