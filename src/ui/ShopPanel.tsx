// Boutique (GDD §6.3) : cosmétiques équipables (un par emplacement) et
// adoption de petits compagnons. Les cosmétiques s'affichent en pixels sur
// le sprite ; les petits aident à la production de Miettes.

import { childCost, turretAmmoCost, turretCost } from '../game/config';
import { containerOf, ufoInterceptChance } from '../game/sim';
import { useTokidachi } from '../state/store';
import { formatCrumbs, formatTokens } from './format';
import { ICON_TOKEN, ICON_CRUMB, ICON_SHIELD, ICON_HOUSE, ICON_UPGRADE, ICON_PEA, ICON_ALERT } from './icons';
import { PixelIcon } from './PixelIcon';

const SLOT_LABELS: Record<string, string> = {
  head: 'Tête',
  face: 'Visage',
  neck: 'Cou',
};

interface Props {
  onClose: () => void;
}

export function ShopPanel({ onClose }: Props) {
  const { cfg, game, buyCosmetic, toggleCosmetic, buyChild, buyTurret, upgradeContainer } = useTokidachi();
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
        <p className="panel-hint" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <PixelIcon grid={ICON_TOKEN} alt="Token" /> {formatTokens(game.capacity.unlimited ? null : game.capacity.budget - game.capacity.used)}
          </span>
          {' · '}
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <PixelIcon grid={ICON_CRUMB} alt="Miettes" /> {formatCrumbs(game.wallet.crumbs)}
          </span>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        {item.currency === 'token'
                          ? <><PixelIcon grid={ICON_TOKEN} alt="" /> {formatTokens(item.cost)}</>
                          : <><PixelIcon grid={ICON_CRUMB} alt="" /> {item.cost}</>}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PixelIcon grid={ICON_SHIELD} alt="" /> Contenant à Miettes
          </h3>
          <p className="panel-hint">
            Actuel : {container.emoji} {container.label} (plafond ×{container.capMultiplier}).
            Un grand contenant stocke plus… et attire plus de pillards.
          </p>
          {nextContainer ? (
            <button className="btn-primary" onClick={upgradeContainer}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <PixelIcon grid={ICON_UPGRADE} alt="" />
                Passer au {nextContainer.emoji} {nextContainer.label} (×
                {nextContainer.capMultiplier}) —{' '}
                <PixelIcon grid={ICON_CRUMB} alt="" /> {nextContainer.cost}
              </span>
            </button>
          ) : (
            <p className="panel-hint" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <PixelIcon grid={ICON_SHIELD} alt="" /> Contenant ultime atteint !
            </p>
          )}
        </section>

        {c.containerLevel >= 3 && (
          <section className="pea-section" style={{ marginTop: '12px', padding: '10px', background: 'rgba(0,0,0,0.02)', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.08)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PixelIcon grid={ICON_PEA} alt="" /> PEA (Plan d'Épargne en Actions)
            </h3>
            <p className="panel-hint">
              Solde : <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><PixelIcon grid={ICON_CRUMB} alt="" /> {formatCrumbs(game.wallet.pea || 0)}</strong>
              <br />
              Rendement : +5%/h active (<strong>+{formatCrumbs(Math.round((game.wallet.pea || 0) * 0.05))}/h</strong>)
              <br />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--danger)', fontWeight: 'bold' }}>
                <PixelIcon grid={ICON_ALERT} alt="avertissement" /> Non récupérable !
              </span>{' '}Les miettes placées restent définitivement.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <input
                type="number"
                min="1"
                max={game.wallet.crumbs}
                placeholder="Ex: 1000"
                id="pea-deposit-amount"
                style={{ flex: 1, padding: '4px 8px', border: '2px solid var(--ink)', borderRadius: '4px', font: 'inherit' }}
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
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PixelIcon grid={ICON_HOUSE} alt="" /> Adoption
          </h3>
          <p className="panel-hint">
            Un petit au génome aléatoire : +{cfg.childProductionPerHour} Miettes/h de récolte,
            une étude en parallèle de plus… mais il mange ({cfg.childCrumbEatPerHour} Miettes/h
            et +{cfg.childMetabolismPerHour} d'appétit du foyer). Famille : {c.children.length}/
            {cfg.maxChildren}.
          </p>
          <button className="btn-primary" onClick={buyChild} disabled={houseFull}>
            {houseFull
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><PixelIcon grid={ICON_HOUSE} alt="" /> La maison est pleine !</span>
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>Adopter un petit — <PixelIcon grid={ICON_CRUMB} alt="" /> {nextChildPrice}</span>}
          </button>
        </section>

        <section>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PixelIcon grid={ICON_SHIELD} alt="" /> Tourelle anti-OVNI
          </h3>
          <p className="panel-hint">
            Niveau {c.turretLevel ?? 0}/{cfg.turret.maxLevel} — {Math.round(ufoInterceptChance(c, cfg) * 100)}%
            de chances d'intercepter l'OVNI avant qu'il n'enlève un petit.
            N'agit que si des petits ont été adoptés.
            {(c.turretLevel ?? 0) > 0 && (
              <>
                {' '}Munitions :{' '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <PixelIcon grid={ICON_CRUMB} alt="" /> {turretAmmoCost(cfg, c.turretLevel ?? 0)}
                </span>{' '}par tir, prélevées du portefeuille à chaque OVNI.
              </>
            )}
          </p>
          {(c.turretLevel ?? 0) > 0 && game.wallet.crumbs < turretAmmoCost(cfg, c.turretLevel ?? 0) && (
            <p className="panel-hint" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--danger)', fontWeight: 'bold' }}>
              <PixelIcon grid={ICON_ALERT} alt="avertissement" /> Tourelle HORS LIGNE — pas assez de Miettes pour les munitions !
            </p>
          )}
          {(c.turretLevel ?? 0) >= cfg.turret.maxLevel ? (
            <p className="panel-hint" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <PixelIcon grid={ICON_SHIELD} alt="" /> Tourelle au niveau maximum !
            </p>
          ) : (
            <button className="btn-primary" onClick={buyTurret}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <PixelIcon grid={ICON_UPGRADE} alt="" /> Améliorer —{' '}
                <PixelIcon grid={ICON_TOKEN} alt="" /> {turretCost(cfg, c.turretLevel ?? 0)}
              </span>
            </button>
          )}
        </section>

        <button className="btn-secondary" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
