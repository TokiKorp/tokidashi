// Boutique (GDD §6.3) : cosmétiques équipables (un par emplacement) et
// adoption de petits compagnons. Les cosmétiques s'affichent en pixels sur
// le sprite ; les petits aident à la production de Miettes.

import { childCost } from '../game/config';
import { containerOf } from '../game/sim';
import { useTokidachi } from '../state/store';
import { formatCrumbs, formatTokens } from './format';

const SLOT_LABELS: Record<string, string> = {
  head: 'Tête',
  face: 'Visage',
  neck: 'Cou',
};

interface Props {
  onClose: () => void;
}

export function ShopPanel({ onClose }: Props) {
  const { cfg, game, buyCosmetic, toggleCosmetic, buyChild, upgradeContainer } = useTokidachi();
  const c = game.companion;
  if (!c) return null;

  const nextChildPrice = childCost(cfg, c.children.length);
  const houseFull = c.children.length >= cfg.maxChildren;
  const container = containerOf(c, cfg);
  const nextContainer = cfg.containers[c.containerLevel + 1];

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>Boutique</h2>
        <p className="panel-hint">
          🪙 {formatTokens(game.capacity.unlimited ? null : game.capacity.budget - game.capacity.used)}
          {' · '}🍞 {formatCrumbs(game.wallet.crumbs)}
        </p>

        <section>
          <h3>Cosmétiques</h3>
          <ul className="shop-list">
            {cfg.cosmetics.map((item) => {
              const owned = c.cosmetics.owned.includes(item.id);
              const equipped = c.cosmetics.equipped.includes(item.id);
              return (
                <li key={item.id} className="shop-item">
                  <span className="shop-emoji">{item.emoji}</span>
                  <span className="shop-name">
                    {item.label}
                    <small className="shop-slot"> · {SLOT_LABELS[item.slot]}</small>
                  </span>
                  {owned ? (
                    <button
                      className={equipped ? 'btn-primary btn-mini' : 'btn-secondary btn-mini'}
                      onClick={() => toggleCosmetic(item.id)}
                    >
                      {equipped ? 'Porté ✓' : 'Porter'}
                    </button>
                  ) : (
                    <button className="btn-secondary btn-mini" onClick={() => buyCosmetic(item.id)}>
                      {item.currency === 'token'
                        ? `🪙 ${formatTokens(item.cost)}`
                        : `🍞 ${item.cost}`}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3>Contenant à Miettes</h3>
          <p className="panel-hint">
            Actuel : {container.emoji} {container.label} (plafond ×{container.capMultiplier}).
            Un grand contenant stocke plus… et attire plus de pillards.
          </p>
          {nextContainer ? (
            <button className="btn-primary" onClick={upgradeContainer}>
              Passer au {nextContainer.emoji} {nextContainer.label} (×
              {nextContainer.capMultiplier}) — 🍞 {nextContainer.cost}
            </button>
          ) : (
            <p className="panel-hint">👝 Contenant ultime atteint !</p>
          )}
        </section>

        {c.containerLevel >= 3 && (
          <section className="pea-section" style={{ marginTop: '12px', padding: '10px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
            <h3>💼 PEA (Plan d'Épargne en Actions)</h3>
            <p className="panel-hint">
              Solde : <strong>{formatCrumbs(game.wallet.pea || 0)} Miettes</strong>
              <br />
              Rendement : +5% par heure active (<strong>+{formatCrumbs(Math.round((game.wallet.pea || 0) * 0.05))}/h</strong>)
              <br />
              <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>⚠️ Non récupérable !</span> Les miettes placées dessus y restent définitivement.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <input
                type="number"
                min="1"
                max={game.wallet.crumbs}
                placeholder="Ex: 1000"
                id="pea-deposit-amount"
                style={{ flex: 1, padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', font: 'inherit' }}
              />
              <button
                className="btn-primary btn-mini"
                onClick={() => {
                  const input = document.getElementById('pea-deposit-amount') as HTMLInputElement;
                  const amt = parseInt(input?.value || '0', 10);
                  if (amt > 0 && amt <= game.wallet.crumbs) {
                    useTokidachi.getState().depositToPea(amt);
                    if (input) input.value = '';
                  } else {
                    alert("Montant invalide ou solde insuffisant !");
                  }
                }}
              >
                Déposer
              </button>
            </div>
          </section>
        )}

        <section>
          <h3>Adoption</h3>
          <p className="panel-hint">
            Un petit au génome aléatoire : +{cfg.childProductionPerHour} Miettes/h de récolte,
            une étude en parallèle de plus… mais il mange ({cfg.childCrumbEatPerHour} Miettes/h
            et +{cfg.childMetabolismPerHour} d'appétit du foyer). Famille : {c.children.length}/
            {cfg.maxChildren}.
          </p>
          <button className="btn-primary" onClick={buyChild} disabled={houseFull}>
            {houseFull ? 'La maison est pleine !' : `Adopter un petit — 🍞 ${nextChildPrice}`}
          </button>
        </section>

        <button className="btn-secondary" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
