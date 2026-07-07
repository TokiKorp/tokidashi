import { useEffect, useState } from 'react';
import './App.css';
import { crumbJarFull } from './game/actions';
import { eventById, skillById } from './game/config';
import { growthFactor } from './game/genome';
import { crumbCap, crumbRatePerHour, visibleState } from './game/sim';
import { PetStage } from './render/PetStage';
import { initSessionListeners } from './state/session';
import { startGameLoop, useTokidachi } from './state/store';
import { DragBar } from './ui/Chrome';
import { DevPanel } from './ui/DevPanel';
import { FeedMenu } from './ui/FeedMenu';
import { formatActiveDuration, formatCrumbs, formatTokens } from './ui/format';
import { Gauge } from './ui/Gauge';
import { ICON_FEED, ICON_PLAY, ICON_SHOP, ICON_TREE } from './ui/icons';
import { PixelIcon } from './ui/PixelIcon';
import { ReportModal } from './ui/ReportModal';
import { AdoptScreen, DeathScreen } from './ui/Screens';
import { ShopPanel } from './ui/ShopPanel';
import { SkillPanel } from './ui/SkillPanel';

type OpenPanel = 'feed' | 'skills' | 'shop' | 'dev' | null;

export default function App() {
  const store = useTokidachi();
  const { loaded, game, cfg, locked, reaction, notice, report } = store;
  const [panel, setPanel] = useState<OpenPanel>(null);
  const [hudVisible, setHudVisible] = useState(
    () => localStorage.getItem('tokidachi-hud') !== 'hidden',
  );

  const toggleHud = () => {
    setHudVisible((v) => {
      localStorage.setItem('tokidachi-hud', v ? 'hidden' : 'visible');
      return !v;
    });
  };

  useEffect(() => {
    void store.init();
    startGameLoop();
    void initSessionListeners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La bulle de réaction s'efface seule, le toast d'erreur aussi.
  useEffect(() => {
    if (reaction?.text) {
      const t = setTimeout(() => store.dismissReaction(), 6000);
      return () => clearTimeout(t);
    }
  }, [reaction?.text, reaction?.seq]);

  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => store.dismissNotice(), 3500);
      return () => clearTimeout(t);
    }
  }, [notice]);

  if (!loaded) {
    return (
      <div className="screen">
        <div className="screen-card">Tokidachi se réveille…</div>
      </div>
    );
  }

  const c = game.companion;
  if (!c) return <AdoptScreen />;
  if (c.dead) return <DeathScreen />;

  const vs = visibleState(c, cfg);
  const tokenLeft = game.capacity.unlimited
    ? null
    : game.capacity.budget - game.capacity.used;
  const learning = c.skills.find((sp) => sp.state === 'learning');
  const learningDef = learning ? skillById(cfg, learning.skillId) : undefined;
  const jarCap = crumbCap(c, cfg);

  return (
    <div className="app">
      <main className="stage-area">
        <PetStage
          state={vs}
          stage={c.stage}
          genome={c.genome}
          growth={growthFactor(c.tokensEaten)}
          pendingCrumbs={c.pendingCrumbs}
          cosmetics={c.cosmetics.equipped}
          children={c.children}
          threatId={c.activeEvent?.eventId ?? null}
          onDefend={store.defend}
          onCollect={c.pendingCrumbs >= 1 ? store.collect : undefined}
          onTap={c.stage === 'egg' ? store.tapEgg : undefined}
        />
        {reaction && (
          <div className="bubble" key={reaction.seq}>
            {reaction.text ?? '…'}
          </div>
        )}
        {c.activeEvent && (() => {
          const def = eventById(cfg, c.activeEvent.eventId);
          const total = c.activeEvent.expiresAtActive - c.activeEvent.startedAtActive;
          const left = Math.max(0, c.activeEvent.expiresAtActive - c.activeSeconds);
          return (
            <button className="event-threat" onClick={store.defend} title="Clique pour le chasser !">
              <span className="event-label">
                {def?.label} — chasse-le !
                <span className="event-timer">
                  <span style={{ width: `${(left / total) * 100}%` }} />
                </span>
              </span>
            </button>
          );
        })()}
        {locked && <div className="frozen-overlay">💤 Session verrouillée — gelé</div>}
        {c.stage === 'egg' && (
          <p className="egg-hint">
            Tapote l'œuf pour l'encourager ({c.eggTaps}/{cfg.eggTapsToHatch})
          </p>
        )}
      </main>

      {!hudVisible && (
        <div className="minibar">
          <span className="drag-grip" data-tauri-drag-region>⠿</span>
          <span className="minibar-stats">
            🍽️ {Math.round(c.satiety)} · 😊 {Math.round(c.mood)}
          </span>
          <button className="btn-toggle" title="Afficher les contrôles" onClick={toggleHud}>
            ▴
          </button>
        </div>
      )}

      <section className="hud" hidden={!hudVisible}>
        <DragBar
          title={
            <>
              {c.name} <small>· {cfg.stages[c.stage].label}</small>
            </>
          }
        >
          <span className="wallet" title="🪙 ta capacité IA (DEV : simulée) · 🍞 ses Miettes à lui">
            🪙 {formatTokens(tokenLeft)} · 🍞 {formatCrumbs(game.wallet.crumbs)}
          </span>
          <button className="btn-toggle" title="Réglages" onClick={() => setPanel('dev')}>
            ⚙
          </button>
          <button className="btn-toggle" title="Masquer les contrôles" onClick={toggleHud}>
            ▾
          </button>
        </DragBar>

        {c.stage !== 'egg' && (
          <>
            <section className="gauges">
              <Gauge label="Satiété" value={c.satiety} tone="satiety" />
              <Gauge label="Vitalité" value={c.vitality} tone="vitality" />
              <Gauge label="Humeur" value={c.mood} tone="mood" />
            </section>

            {learningDef && learning && (
              <p className="status-line">
                📖 Étudie « {learningDef.label} » —{' '}
                {Math.floor((learning.trainedSeconds / learningDef.trainSeconds) * 100)}%
              </p>
            )}

            {jarCap > 0 && (
              <button className="jar" onClick={store.collect} disabled={c.pendingCrumbs < 1}>
                🫙 {formatCrumbs(c.pendingCrumbs)}/{formatCrumbs(jarCap)} Miettes · +
                {Math.round(crumbRatePerHour(c, cfg))}/h
                {crumbJarFull(c, cfg) ? ' — plein !' : ''}
                {c.pendingCrumbs >= 1 ? ' (ramasser)' : ''}
              </button>
            )}

            <nav className="actions">
              <button className="btn-primary btn-icon" title="Nourrir" onClick={() => setPanel('feed')}>
                <PixelIcon grid={ICON_FEED} alt="Nourrir" />
              </button>
              <button className="btn-primary btn-icon" title="Jouer" onClick={store.play}>
                <PixelIcon grid={ICON_PLAY} alt="Jouer" />
              </button>
              <button
                className="btn-primary btn-icon"
                title="Arbre de compétences"
                onClick={() => setPanel('skills')}
              >
                <PixelIcon grid={ICON_TREE} alt="Arbre de compétences" />
              </button>
              <button className="btn-primary btn-icon" title="Boutique" onClick={() => setPanel('shop')}>
                <PixelIcon grid={ICON_SHOP} alt="Boutique" />
              </button>
            </nav>
          </>
        )}

        <footer className="statusbar">
          <span>{formatActiveDuration(c.activeSeconds)} de vie active</span>
          <span title="TOKEN mangés sur sa vie — il s'engraisse sans limite">
            🍔 {formatTokens(Math.floor(c.tokensEaten))}
          </span>
          {cfg.simSpeed !== 1 && <span className="badge-dev">×{cfg.simSpeed}</span>}
        </footer>
      </section>

      {panel === 'feed' && <FeedMenu onClose={() => setPanel(null)} />}
      {panel === 'skills' && <SkillPanel onClose={() => setPanel(null)} />}
      {panel === 'shop' && <ShopPanel onClose={() => setPanel(null)} />}
      {panel === 'dev' && <DevPanel onClose={() => setPanel(null)} />}
      {report && <ReportModal report={report} />}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
