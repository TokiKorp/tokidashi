import { useEffect, useState } from 'react';
import './App.css';
import { crumbJarFull } from './game/actions';
import { eventById, skillById } from './game/config';
import { growthFactor } from './game/genome';
import { containerOf, crumbCap, crumbRatePerHour, visibleState } from './game/sim';
import { PetStage } from './render/PetStage';
import { initSessionListeners } from './state/session';
import { startGameLoop, useTokidachi } from './state/store';
import { DragBar } from './ui/Chrome';
import { DevPanel } from './ui/DevPanel';
import { FeedMenu } from './ui/FeedMenu';
import { formatActiveDuration, formatCrumbs, formatTokens } from './ui/format';
import { Gauge } from './ui/Gauge';
import { ICON_FEED, ICON_PLAY, ICON_SHOP, ICON_TREE, ICON_TOKEN, ICON_CRUMB, ICON_GEAR, ICON_BOOK } from './ui/icons';
import { PixelIcon } from './ui/PixelIcon';
import { ReportModal } from './ui/ReportModal';
import { AdoptScreen, DeathScreen } from './ui/Screens';
import { ShopPanel } from './ui/ShopPanel';
import { SkillPanel } from './ui/SkillPanel';
import { CloudPanel } from './ui/CloudPanel';
import { TRANSLATIONS } from './ui/translations';

type OpenPanel = 'feed' | 'skills' | 'shop' | 'dev' | 'cloud' | null;

export default function App() {
  const store = useTokidachi();
  const { loaded, game, cfg, locked, reaction, notice, report, language } = store;
  const t = TRANSLATIONS[language];
  const [panel, setPanel] = useState<OpenPanel>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hudVisible, setHudVisible] = useState(
    () => localStorage.getItem('tokidachi-hud') === 'visible',
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
          skills={c.skills.filter(sp => sp.state === 'owned').map(sp => sp.skillId)}
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
        <div className="minimal-menu-container" style={{ position: 'absolute', bottom: '12px', right: '12px', zIndex: 100 }}>
          <button
            className="btn-primary"
            style={{ width: '36px', height: '36px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4em', border: '3px solid var(--ink)', boxShadow: 'var(--shadow)', cursor: 'pointer', background: 'var(--gold)' }}
            onClick={() => setMenuOpen(!menuOpen)}
            title="Menu Tokidachi"
          >
            ☰
          </button>
          
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '44px',
                right: 0,
                background: 'var(--bg-panel)',
                border: '3px solid var(--ink)',
                borderRadius: '8px',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                boxShadow: 'var(--shadow)',
                minWidth: '150px'
              }}
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                className="btn-secondary btn-mini"
                style={{ textAlign: 'left', display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 10px', font: 'inherit' }}
                onClick={() => {
                  toggleHud();
                  setMenuOpen(false);
                }}
              >
                <PixelIcon grid={ICON_TREE} alt="" /> Afficher HUD
              </button>
              <button
                className="btn-secondary btn-mini"
                style={{ textAlign: 'left', display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 10px', font: 'inherit' }}
                onClick={() => {
                  setPanel('feed');
                  setMenuOpen(false);
                }}
              >
                <PixelIcon grid={ICON_FEED} alt="" /> Nourrir
              </button>
              <button
                className="btn-secondary btn-mini"
                style={{ textAlign: 'left', display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 10px', font: 'inherit' }}
                onClick={() => {
                  store.play();
                  setMenuOpen(false);
                }}
              >
                <PixelIcon grid={ICON_PLAY} alt="" /> Jouer
              </button>
              <button
                className="btn-secondary btn-mini"
                style={{ textAlign: 'left', display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 10px', font: 'inherit' }}
                onClick={() => {
                  setPanel('skills');
                  setMenuOpen(false);
                }}
              >
                <PixelIcon grid={ICON_TREE} alt="" /> Compétences
              </button>
              <button
                className="btn-secondary btn-mini"
                style={{ textAlign: 'left', display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 10px', font: 'inherit' }}
                onClick={() => {
                  setPanel('shop');
                  setMenuOpen(false);
                }}
              >
                <PixelIcon grid={ICON_SHOP} alt="" /> Boutique
              </button>
              <button
                className="btn-secondary btn-mini"
                style={{ textAlign: 'left', display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 10px', font: 'inherit' }}
                onClick={() => {
                  setPanel('dev');
                  setMenuOpen(false);
                }}
              >
                <PixelIcon grid={ICON_GEAR} alt="" /> Paramètres
              </button>
            </div>
          )}
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
          <button className="btn-toggle" title={t.cloud_panel} onClick={() => setPanel('cloud')}>
            ☁
          </button>
          <button className="btn-toggle" title={t.settings_panel} onClick={() => setPanel('dev')}>
            ⚙
          </button>
          <button className="btn-toggle" title={t.hide_hud} onClick={toggleHud}>
            ▾
          </button>
        </DragBar>

        <div className="wallet-bar" title={t.wallet_tooltip}>
          <span className="wallet-item" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon grid={ICON_TOKEN} alt="Token" /> {tokenLeft !== null ? formatTokens(tokenLeft) : '∞'}
          </span>
          <span className="wallet-separator">·</span>
          <span className="wallet-item" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon grid={ICON_CRUMB} alt="Miettes" /> {formatCrumbs(game.wallet.crumbs)}
          </span>
        </div>

        {c.stage !== 'egg' && (
          <>
            <section className="gauges">
              <Gauge label="Satiété" value={c.satiety} tone="satiety" />
              <Gauge label="Vitalité" value={c.vitality} tone="vitality" />
              <Gauge label="Humeur" value={c.mood} tone="mood" />
            </section>

            {learningDef && learning && (
              <p className="status-line" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <PixelIcon grid={ICON_BOOK} alt="" size={13} /> Étudie « {learningDef.label} » —{' '}
                {Math.floor((learning.trainedSeconds / learningDef.trainSeconds) * 100)}%
              </p>
            )}

            {jarCap > 0 && (
              <button
                className="jar"
                onClick={store.collect}
                disabled={c.pendingCrumbs < 1}
                title={`Contenant : ${containerOf(c, cfg).label} (améliorable à la Boutique)`}
              >
                {containerOf(c, cfg).emoji} {formatCrumbs(c.pendingCrumbs)}/{formatCrumbs(jarCap)}{' '}
                Miettes · +{Math.round(crumbRatePerHour(c, cfg))}/h
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
          <span>{formatActiveDuration(c.activeSeconds)} {t.active_lifetime}</span>
          <span title={language === 'fr' ? 'Croissance calée sur les jetons mangés' : 'Growth factor based on tokens eaten'} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon grid={ICON_TOKEN} alt="" size={11} /> {formatTokens(Math.floor(c.tokensEaten))} ({t.growth} : {Math.round(growthFactor(c.tokensEaten) * 100)}%)
          </span>
          {cfg.simSpeed !== 1 && <span className="badge-dev">×{cfg.simSpeed}</span>}
        </footer>
      </section>

      {panel === 'feed' && <FeedMenu onClose={() => setPanel(null)} />}
      {panel === 'skills' && <SkillPanel onClose={() => setPanel(null)} />}
      {panel === 'shop' && <ShopPanel onClose={() => setPanel(null)} />}
      {panel === 'dev' && <DevPanel onClose={() => setPanel(null)} />}
      {panel === 'cloud' && <CloudPanel onClose={() => setPanel(null)} />}
      {report && <ReportModal report={report} />}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
