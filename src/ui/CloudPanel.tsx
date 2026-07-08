import { useState, useEffect } from 'react';
import { useTokidachi } from '../state/store';
import { formatActiveDuration, formatCrumbs, formatTokens } from './format';
import { TRANSLATIONS } from './translations';
import { useConfirm } from './useConfirm';

interface Props {
  onClose: () => void;
}

type Tab = 'backup' | 'leaderboard';
type SortMetric = 'tokens_eaten' | 'active_seconds' | 'crumbs';
type Scope = 'all' | 'alive';

interface LeaderboardEntry {
  companion_name: string;
  stage: string;
  active_seconds: number;
  tokens_eaten: number;
  crumbs: number;
  dead: number;
  died_at: string | null;
  updated_at: string;
  account_pseudo: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  egg: '🥚 Œuf',
  blob: '💧 Blob',
  kid: '👶 Kid',
  teen: '👦 Ado',
  adult: '🧑 Adulte',
  grandpa: '👴 Papy',
};

export function CloudPanel({ onClose }: Props) {
  const {
    backupId,
    cloudSyncEnabled,
    cloudServerUrl,
    accountPseudo,
    setCloudSyncEnabled,
    setCloudServerUrl,
    regenerateBackupId,
    adoptBackupId,
    triggerCloudSync,
    restoreFromCloud,
    register,
    login,
    logout,
    language,
  } = useTokidachi();
  const t = TRANSLATIONS[language];
  const { confirm, dialog } = useConfirm();

  const [activeTab, setActiveTab] = useState<Tab>('backup');
  const [serverUrlInput, setServerUrlInput] = useState(cloudServerUrl);
  const [restoreIdInput, setRestoreIdInput] = useState('');

  // Sync status
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [pseudoInput, setPseudoInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading'>('idle');
  const [authError, setAuthError] = useState<string | null>(null);

  // Leaderboard state
  const [metric, setMetric] = useState<SortMetric>('tokens_eaten');
  const [scope, setScope] = useState<Scope>('all');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState(false);

  // Apply server URL changes on blur or enter key
  const handleServerUrlSave = () => {
    let url = serverUrlInput.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    setCloudServerUrl(url);
    setServerUrlInput(url);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthStatus('loading');
    setAuthError(null);

    if (authMode === 'register') {
      const result = await register(pseudoInput.trim(), passwordInput);
      setAuthStatus('idle');
      if (!result.ok) {
        setAuthError(result.error ?? 'Erreur inconnue');
        return;
      }
      setPseudoInput('');
      setPasswordInput('');
      return;
    }

    const result = await login(pseudoInput.trim(), passwordInput);
    setAuthStatus('idle');
    if (!result.ok) {
      setAuthError(result.error ?? 'Erreur inconnue');
      return;
    }
    setPseudoInput('');
    setPasswordInput('');

    const serverBackupId = result.serverBackupId ?? null;
    if (serverBackupId && serverBackupId !== backupId) {
      const useCloudSave = await confirm(
        "Ce compte possède déjà une sauvegarde différente de celle de cet appareil.\n\nOK = charger la sauvegarde du compte (écrase la sauvegarde locale).\nAnnuler = garder la sauvegarde locale (elle écrasera celle du compte au prochain envoi)."
      );
      if (useCloudSave) {
        await restoreFromCloud(serverBackupId);
      } else {
        adoptBackupId(serverBackupId);
        void triggerCloudSync();
      }
    }
  };

  const handleLogout = () => {
    logout();
  };

  const handleSyncNow = async () => {
    setSyncStatus('loading');
    const success = await triggerCloudSync();
    setSyncStatus(success ? 'success' : 'error');
    if (success) {
      setTimeout(() => setSyncStatus('idle'), 3000);
      // Refresh leaderboard if we are on leaderboard tab or if we want it updated
      if (activeTab === 'leaderboard') {
        void fetchLeaderboard();
      }
    }
  };

  const handleRestore = async () => {
    const targetId = restoreIdInput.trim();
    if (!targetId) return;

    const ok = await confirm(
      "⚠️ RESTAURATION DU CLOUD\n\nCela va écraser définitivement votre compagnon local actuel par les données du cloud.\n\nÊtes-vous sûr de vouloir continuer ?"
    );
    if (!ok) return;

    setRestoreStatus('loading');
    const success = await restoreFromCloud(targetId);
    if (success) {
      setRestoreStatus('success');
      setRestoreIdInput('');
      setTimeout(() => setRestoreStatus('idle'), 3000);
    } else {
      setRestoreStatus('error');
    }
  };

  const fetchLeaderboard = async () => {
    if (!cloudServerUrl) return;
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    try {
      const url = `${cloudServerUrl.replace(/\/$/, '')}/api/leaderboard?sortBy=${metric}&scope=${scope}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (data && data.rankings) {
        setLeaderboard(data.rankings);
      } else {
        setLeaderboardError(true);
      }
    } catch (err) {
      console.error('Failed to load leaderboard', err);
      setLeaderboardError(true);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      void fetchLeaderboard();
    }
  }, [activeTab, metric, scope, cloudServerUrl]);

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(92vw, 360px)' }}>
        <h2>Nuage & Classement</h2>

        {/* Tab Header */}
        <div style={{ display: 'flex', borderBottom: '1px solid #444', marginBottom: '8px' }}>
          <button
            onClick={() => setActiveTab('backup')}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'backup' ? '2px solid var(--ink-primary)' : 'none',
              color: activeTab === 'backup' ? 'var(--ink-primary)' : 'var(--ink-soft)',
              padding: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.9em',
            }}
          >
            ☁️ Sauvegarde
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'leaderboard' ? '2px solid var(--ink-primary)' : 'none',
              color: activeTab === 'leaderboard' ? 'var(--ink-primary)' : 'var(--ink-soft)',
              padding: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.9em',
            }}
          >
            🏆 Classement
          </button>
        </div>

        {activeTab === 'backup' && (
          <>
            <section style={{ gap: '8px' }}>
              <h3 style={{ color: '#4caf50', margin: '0 0 4px 0' }}>{t.acct_section}</h3>
              {accountPseudo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <p className="panel-hint">
                    {t.acct_logged_in_as} <strong>{accountPseudo}</strong>
                  </p>
                  <button
                    className="btn-secondary"
                    onClick={handleLogout}
                    style={{ padding: '6px 10px', fontSize: '0.85em', alignSelf: 'flex-start' }}
                  >
                    {t.acct_logout}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder={t.acct_pseudo_placeholder}
                    value={pseudoInput}
                    onChange={(e) => setPseudoInput(e.target.value)}
                    style={{
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #444',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      fontSize: '0.85em',
                    }}
                  />
                  <input
                    type="password"
                    placeholder={t.acct_password_placeholder}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    style={{
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #444',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      fontSize: '0.85em',
                    }}
                  />
                  {authError && (
                    <p style={{ color: '#ff6b6b', fontSize: '0.8em', margin: 0 }}>{authError}</p>
                  )}
                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={authStatus === 'loading' || !pseudoInput.trim() || !passwordInput}
                    style={{ padding: '8px' }}
                  >
                    {authStatus === 'loading' ? t.acct_loading : authMode === 'login' ? t.acct_login : t.acct_register}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === 'login' ? 'register' : 'login');
                      setAuthError(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--ink-soft)',
                      fontSize: '0.75em',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: 0,
                      textAlign: 'left',
                    }}
                  >
                    {authMode === 'login' ? t.acct_switch_to_register : t.acct_switch_to_login}
                  </button>
                </form>
              )}
            </section>

            <hr style={{ border: '0', borderTop: '1px solid #444', margin: '8px 0' }} />

            <section style={{ gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="cloudSyncToggle"
                  checked={cloudSyncEnabled}
                  onChange={(e) => setCloudSyncEnabled(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="cloudSyncToggle" style={{ fontSize: '0.9em', fontWeight: 'bold', cursor: 'pointer' }}>
                  Activer la sauvegarde automatique
                </label>
              </div>
              <p className="panel-hint">
                Envoie vos progrès sur le cloud à chaque sauvegarde locale (toutes les 30s d'activité).
              </p>
            </section>

            <section style={{ gap: '6px' }}>
              <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#ccc' }}>URL du serveur cloud :</label>
              <input
                type="text"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                onBlur={handleServerUrlSave}
                onKeyDown={(e) => e.key === 'Enter' && handleServerUrlSave()}
                placeholder="https://..."
                style={{
                  background: '#222',
                  color: '#fff',
                  border: '1px solid #444',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontSize: '0.85em',
                }}
              />
            </section>

            <section style={{ gap: '6px', marginTop: '4px' }}>
              <button
                className="btn-primary"
                onClick={handleSyncNow}
                disabled={syncStatus === 'loading'}
                style={{ padding: '8px' }}
              >
                {syncStatus === 'loading' && 'Synchronisation...'}
                {syncStatus === 'success' && '✓ Sauvegardé avec succès !'}
                {syncStatus === 'error' && '❌ Échec de synchronisation'}
                {syncStatus === 'idle' && 'Nuage ☁️ Sauvegarder maintenant'}
              </button>
            </section>

            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.85em', color: 'var(--ink-soft)' }}>
                {t.acct_advanced_options} ▸
              </summary>

              <section style={{ gap: '6px', marginTop: '8px' }}>
                <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#ccc' }}>Clé de synchronisation (ID) :</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    readOnly
                    value={backupId}
                    style={{
                      flex: 1,
                      background: '#151515',
                      color: '#888',
                      border: '1px solid #333',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      fontSize: '0.75em',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.8em' }}
                    onClick={() => {
                      navigator.clipboard.writeText(backupId);
                      alert("ID copié ! Conservez-le précieusement pour restaurer plus tard.");
                    }}
                  >
                    Copier
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="panel-hint muted">Identifiant unique de votre partie.</span>
                  <button
                    disabled={!!accountPseudo}
                    title={accountPseudo ? 'Déconnectez-vous pour régénérer un identifiant.' : undefined}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: accountPseudo ? '#666' : '#ff6b6b',
                      fontSize: '0.75em',
                      textDecoration: 'underline',
                      cursor: accountPseudo ? 'not-allowed' : 'pointer',
                      padding: 0
                    }}
                    onClick={async () => {
                      if (await confirm("⚠️ Attention : changer d'identifiant vous séparera de votre sauvegarde actuelle sur le cloud (une nouvelle sauvegarde sera créée). Continuer ?")) {
                        regenerateBackupId();
                      }
                    }}
                  >
                    Régénérer
                  </button>
                </div>
              </section>

              <hr style={{ border: '0', borderTop: '1px solid #444', margin: '8px 0' }} />

              <section style={{ gap: '6px' }}>
                <h3 style={{ color: '#ffc107', margin: '0 0 4px 0' }}>Restaurer une partie</h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="Coller l'ID de sauvegarde..."
                    value={restoreIdInput}
                    onChange={(e) => setRestoreIdInput(e.target.value)}
                    style={{
                      flex: 1,
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #444',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      fontSize: '0.8em',
                    }}
                  />
                  <button
                    className="btn-secondary"
                    disabled={!restoreIdInput.trim() || restoreStatus === 'loading'}
                    style={{ padding: '6px 12px', fontSize: '0.85em' }}
                    onClick={handleRestore}
                  >
                    {restoreStatus === 'loading' ? 'Restauration...' : 'Restaurer'}
                  </button>
                </div>
                {restoreStatus === 'error' && (
                  <p style={{ color: '#ff6b6b', fontSize: '0.8em', margin: '2px 0 0 0' }}>
                    Impossible de trouver cette sauvegarde. Vérifiez l'ID.
                  </p>
                )}
                {restoreStatus === 'success' && (
                  <p style={{ color: '#4caf50', fontSize: '0.8em', margin: '2px 0 0 0' }}>
                    Restauration réussie !
                  </p>
                )}
              </section>
            </details>
          </>
        )}

        {activeTab === 'leaderboard' && (
          <>
            <section style={{ gap: '6px', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#ccc' }}>Classer par :</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {(['tokens_eaten', 'active_seconds', 'crumbs'] as const).map((m) => (
                  <button
                    key={m}
                    className={metric === m ? 'btn-primary' : 'btn-secondary'}
                    style={{ fontSize: '0.75em', padding: '6px 2px' }}
                    onClick={() => setMetric(m)}
                  >
                    {m === 'tokens_eaten' ? '🪙 Taille' : m === 'active_seconds' ? '⏳ Âge' : '🍞 Miettes'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '6px' }}>
                {(['all', 'alive'] as const).map((s) => (
                  <button
                    key={s}
                    className={scope === s ? 'btn-primary' : 'btn-secondary'}
                    style={{ fontSize: '0.75em', padding: '6px 2px' }}
                    onClick={() => setScope(s)}
                  >
                    {s === 'all' ? t.lb_scope_all : t.lb_scope_alive}
                  </button>
                ))}
              </div>
            </section>

            <div
              style={{
                flex: 1,
                minHeight: '160px',
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid #444',
                borderRadius: '4px',
                background: '#151515',
              }}
            >
              {leaderboardLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#aaa', fontSize: '0.9em' }}>
                  Chargement...
                </div>
              ) : leaderboardError ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#ff6b6b', fontSize: '0.85em' }}>
                  Erreur de chargement du classement.
                </div>
              ) : leaderboard.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#888', fontSize: '0.85em' }}>
                  Aucun compagnon dans le classement.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#222', borderBottom: '1px solid #444', color: '#aaa' }}>
                      <th style={{ padding: '6px 8px', width: '40px' }}>#</th>
                      <th style={{ padding: '6px 8px' }}>Nom</th>
                      <th style={{ padding: '6px 8px', width: '80px' }}>Stade</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, idx) => {
                      const isDead = !!entry.dead;
                      const diedOnLabel = entry.died_at
                        ? `${t.lb_died_on} ${new Date(entry.died_at).toLocaleDateString()}`
                        : undefined;
                      return (
                      <tr
                        key={idx}
                        title={diedOnLabel}
                        style={{
                          borderBottom: '1px solid #333',
                          opacity: isDead ? 0.55 : 1,
                          background: !isDead && entry.updated_at.startsWith(new Date().toISOString().substring(0, 10))
                            ? 'rgba(76, 175, 80, 0.05)'
                            : 'none',
                        }}
                      >
                        <td style={{ padding: '6px 8px', color: idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : '#888', fontWeight: idx < 3 ? 'bold' : 'normal' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: entry.companion_name ? 'bold' : 'normal', color: isDead ? '#999' : undefined, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {entry.companion_name}
                          {isDead && <span aria-hidden="true">†</span>}
                          {entry.account_pseudo && (
                            <span style={{ color: '#888', fontWeight: 'normal', fontSize: '0.85em' }}>
                              {t.lb_by} {entry.account_pseudo}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', fontSize: '0.95em' }}>
                          {STAGE_LABELS[entry.stage] || entry.stage}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                          {metric === 'tokens_eaten' && `🪙 ${formatTokens(entry.tokens_eaten)}`}
                          {metric === 'active_seconds' && `⏳ ${formatActiveDuration(entry.active_seconds)}`}
                          {metric === 'crumbs' && `🍞 ${formatCrumbs(entry.crumbs)}`}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <button className="btn-secondary" style={{ marginTop: '4px' }} onClick={onClose}>
          Fermer
        </button>
      </div>
      {dialog}
    </div>
  );
}
