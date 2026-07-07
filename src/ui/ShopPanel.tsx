// Boutique (GDD §6.3) : cosmétiques équipables (un par emplacement) et
// adoption de petits compagnons. Les cosmétiques s'affichent en pixels sur
// le sprite ; les petits aident à la production de Miettes.

import { childCost } from '../game/config';
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
  const { cfg, game, buyCosmetic, toggleCosmetic, buyChild } = useTokidachi();
  const c = game.companion;
  if (!c) return null;

  const nextChildPrice = childCost(cfg, c.children.length);
  const houseFull = c.children.length >= cfg.maxChildren;

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
          <h3>Adoption</h3>
          <p className="panel-hint">
            Un petit compagnon au génome aléatoire, qui rapporte +{cfg.childProductionPerHour}{' '}
            Miettes/h. Famille : {c.children.length}/{cfg.maxChildren}.
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
