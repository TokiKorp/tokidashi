import { useState, useEffect } from 'react';
import { useTokidachi } from '../state/store';
import { formatActiveDuration, formatCrumbs, formatTokens } from './format';

interface Props {
  onClose: () => void;
}

type Tab = 'backup' | 'leaderboard';
type SortMetric = 'tokens_eaten' | 'active_seconds' | 'crumbs';

interface LeaderboardEntry {
  companion_name: string;
  stage: string;
  active_seconds: number;
  tokens_eaten: number;
  crumbs: number;
  dev_mode?: number;
  updated_at: string;
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
    setCloudSyncEnabled,
    setCloudServerUrl,
    regenerateBackupId,
    triggerCloudSync,
    restoreFromCloud,
  } = useTokidachi();

  const [activeTab, setActiveTab] = useState<Tab>('backup');
  const [serverUrlInput, setServerUrlInput] = useState(cloudServerUrl);
  const [restoreIdInput, setRestoreIdInput] = useState('');
  
  // Sync status
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Leaderboard state
  const [metric, setMetric] = useState<SortMetric>('tokens_eaten');
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

    const ok = confirm(
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
      const url = `${cloudServerUrl.replace(/\/$/, '')}/api/leaderboard?sortBy=${metric}`;
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
  }, [activeTab, metric, cloudServerUrl]);

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

            <section style={{ gap: '6px' }}>
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
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ff6b6b',
                    fontSize: '0.75em',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  onClick={() => {
                    if (confirm("⚠️ Attention : changer d'identifiant vous séparera de votre sauvegarde actuelle sur le cloud (une nouvelle sauvegarde sera créée). Continuer ?")) {
                      regenerateBackupId();
                    }
                  }}
                >
                  Régénérer
                </button>
              </div>
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
                    {leaderboard.map((entry, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid #333',
                          background: entry.updated_at.startsWith(new Date().toISOString().substring(0, 10))
                            ? 'rgba(76, 175, 80, 0.05)'
                            : 'none',
                        }}
                      >
                        <td style={{ padding: '6px 8px', color: idx === 0 ? '#gold' : idx === 1 ? '#silver' : idx === 2 ? '#cd7f32' : '#888', fontWeight: idx < 3 ? 'bold' : 'normal' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: entry.companion_name ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {entry.companion_name}
                          {!!entry.dev_mode && (
                            <span 
                              style={{ 
                                background: '#333', 
                                color: '#ffd700', 
                                border: '1px solid #ffd700', 
                                borderRadius: '3px', 
                                padding: '1px 4px', 
                                fontSize: '0.7em', 
                                fontWeight: 'bold' 
                              }}
                              title="Mode Dev activé (triche active/simulée)"
                            >
                              DEV
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
                    ))}
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
    </div>
  );
}
