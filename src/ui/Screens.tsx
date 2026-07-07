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
  const { game, buryAndRestart } = useTokidachi();
  const c = game.companion;
  if (!c) return null;
  return (
    <div className="screen">
      <div className="screen-card">
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
        <NameForm label="Adopter un nouvel œuf" onSubmit={buryAndRestart} />
        <Memorial game={game} />
      </div>
    </div>
  );
}
