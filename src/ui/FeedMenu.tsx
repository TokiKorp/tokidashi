// Menu de nourrissage (GDD §5.2) — coût affiché sans ambiguïté : les TOKEN
// sont ta capacité, les Miettes sont à lui. Transparence totale (GDD §12).
// Les prix affichés intègrent les remises de compétences (Fin gourmet).

import { foodAffordable } from '../game/actions';
import { effectiveFoodCost, skillModifiers } from '../game/sim';
import { useTokidachi } from '../state/store';
import { formatTokens } from './format';
import { ICON_TOKEN, ICON_CRUMB, ICON_ALERT } from './icons';
import { PixelIcon } from './PixelIcon';

interface Props {
  onClose: () => void;
}

export function FeedMenu({ onClose }: Props) {
  const { cfg, game, feed } = useTokidachi();
  const c = game.companion;
  if (!c) return null;
  const mods = skillModifiers(c, cfg);

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>Nourrir</h2>
        <ul className="food-list">
          {cfg.foods.map((food) => {
            const affordable = foodAffordable(c, food, game.wallet, game.capacity, cfg);
            const heat = c.foodHeat[food.id] ?? 0;
            const cost = effectiveFoodCost(food, mods, heat);
            const surged = heat > 0.25;
            const satiety =
              food.currency === 'token'
                ? Math.round(food.satiety * mods.tokenSatiety)
                : food.satiety;
            return (
              <li key={food.id}>
                <button
                  className="food-btn"
                  disabled={!affordable}
                  onClick={() => {
                    void feed(food.id);
                    onClose();
                  }}
                >
                  <span className="food-emoji">{food.emoji}</span>
                  <span className="food-name">{food.label}</span>
                  <span className="food-effect">
                    +{satiety} satiété
                    {food.mood ? ` · +${food.mood} humeur` : ''}
                    {food.vitality ? ` · +${food.vitality} vitalité` : ''}
                  </span>
                  <span
                    className={`food-cost cost-${food.currency} ${surged ? 'cost-surged' : ''}`}
                    title={surged ? 'Prix gonflé par tes achats récents — il redescendra' : undefined}
                  >
                    {surged && <PixelIcon grid={ICON_ALERT} alt="prix gonflé" />}
                    {food.currency === 'token'
                      ? <><PixelIcon grid={ICON_TOKEN} alt="Token" /> {formatTokens(cost)} TOKEN</>
                      : <><PixelIcon grid={ICON_CRUMB} alt="Miettes" /> {cost}</>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button className="btn-secondary" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
