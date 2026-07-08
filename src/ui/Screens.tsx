// Écrans hors-jeu : adoption (premier lancement / recommencement) et mort.
// Permadeath (GDD §8.3) : pas de réanimation, un mémorial sobre, et la
// possibilité d'adopter un nouvel œuf. Jamais de vente autour de la mort.

import { useState } from 'react';
import { growthFactor } from '../game/genome';
import type { GameState } from '../game/types';
import { useTokidachi } from '../state/store';
import { PetStage } from '../render/PetStage';
import { DragBar } from './Chrome';
import { formatActiveDuration } from './format';

function Memorial({ game }: { game: GameState }) {
  if (game.memorial.length === 0) return null;
  return (
    <section className="memorial">
      <h3>🪦 Mémorial</h3>
      <ul>
        {game.memorial.map((m, i) => (
          <li key={i}>
            <strong>{m.name}</strong> — {formatActiveDuration(m.activeSeconds)} de vie active,{' '}
            {new Date(m.diedAtIso).toLocaleDateString('fr-FR')}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NameForm({ label, onSubmit }: { label: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form
      className="name-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(name);
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Son nom…"
        maxLength={16}
        autoFocus
      />
      <button className="btn-primary" type="submit">{label}</button>
    </form>
  );
}

export function AdoptScreen() {
  const { game, adopt } = useTokidachi();
  return (
    <div className="screen">
      <div className="screen-card">
        <DragBar title="Tokidachi" />
        <h1>Tokidachi</h1>
        <p>
          Un petit être va éclore sur ton bureau. Il ne vivra que quand ta session
          est déverrouillée, et il faudra le nourrir — parfois avec tes propres
          TOKEN. Prêt·e à en prendre soin ?
        </p>
        <NameForm label="Couver l'œuf" onSubmit={adopt} />
        <Memorial game={game} />
      </div>
    </div>
  );
}

export function DeathScreen() {
  const { game, buryAndRestart, succeed } = useTokidachi();
  const [selectedChildIndex, setSelectedChildIndex] = useState<number | null>(null);
  const [successorName, setSuccessorName] = useState('');
  const c = game.companion;
  
  if (!c) return null;

  const handleSucceedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedChildIndex !== null && successorName.trim()) {
      succeed(selectedChildIndex, successorName);
    }
  };

  return (
    <div className="screen">
      <div className="screen-card" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <DragBar title="Tokidachi" />
        <PetStage
          state="dead"
          stage={c.stage}
          genome={c.genome}
          growth={growthFactor(c.tokensEaten)}
        />
        <h2>{c.name} s'est éteint…</h2>
        <p className="panel-hint">
          {formatActiveDuration(c.activeSeconds)} de vie active partagée. Son nom
          rejoint le mémorial.
        </p>

        {c.children && c.children.length > 0 ? (
          <section style={{ borderTop: '2px dashed rgba(0,0,0,0.1)', marginTop: '12px', paddingTop: '12px' }}>
            <h3>🐣 Choisir un successeur</h3>
            <p className="panel-hint" style={{ marginBottom: '8px' }}>
              Désigner un enfant comme héritier. Il démarrera au stade <strong>blob</strong> et <strong>conservera toutes les compétences actives</strong> !
            </p>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 0' }}>
              {c.children.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedChildIndex(idx)}
                  style={{
                    padding: '8px 12px',
                    border: selectedChildIndex === idx ? '3px solid var(--gold)' : '1px solid #ccc',
                    borderRadius: '8px',
                    background: selectedChildIndex === idx ? 'rgba(247,200,115,0.1)' : '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    minWidth: '70px'
                  }}
                  type="button"
                >
                  <span style={{ fontSize: '1.5em' }}>👶</span>
                  <span style={{ fontSize: '0.8em', color: 'var(--ink-soft)' }}>Enfant #{idx + 1}</span>
                </button>
              ))}
            </div>

            {selectedChildIndex !== null && (
              <form onSubmit={handleSucceedSubmit} style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input
                  value={successorName}
                  onChange={(e) => setSuccessorName(e.target.value)}
                  placeholder="Nom du successeur..."
                  maxLength={16}
                  required
                  style={{
                    background: '#fff',
                    border: '1px solid #ccc',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    font: 'inherit'
                  }}
                />
                <button className="btn-primary" type="submit">
                  Faire succéder l'Enfant #{selectedChildIndex + 1}
                </button>
              </form>
            )}

            <div style={{ borderTop: '1px solid rgba(0,0,0,0.1)', marginTop: '16px', paddingTop: '12px' }}>
              <p className="panel-hint" style={{ marginBottom: '6px' }}>Ou recommencer à zéro avec un œuf :</p>
              <NameForm label="Adopter un nouvel œuf" onSubmit={buryAndRestart} />
            </div>
          </section>
        ) : (
          <NameForm label="Adopter un nouvel œuf" onSubmit={buryAndRestart} />
        )}

        <Memorial game={game} />
      </div>
    </div>
  );
}
