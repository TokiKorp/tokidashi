// Rapport de retour (GDD §7) : « depuis la dernière fois : +X Miettes, … ».

import { skillById } from '../game/config';
import type { SimEvent } from '../game/types';
import { useTokidachi, type ReturnReport } from '../state/store';
import { formatActiveDuration, signed } from './format';

function eventLine(e: SimEvent, cfgLookup: (id: string) => string): string | null {
  switch (e.type) {
    case 'skill-learned':
      return `Il a fini d'apprendre « ${cfgLookup(String(e.data?.skillId))} » 🎓`;
    case 'skill-upgraded':
      return `« ${cfgLookup(String(e.data?.skillId))} » passe au niveau ${e.data?.level} ⭐`;
    case 'evolved':
      return 'Il a évolué ! ✨';
    case 'got-sick':
      return 'Il est tombé malade 🤒';
    case 'recovered':
      return 'Il a guéri 💚';
    case 'got-hungry':
      return 'Il a eu un petit creux';
    case 'crumb-cap-reached':
      return 'Son pot de Miettes est plein — pense à le ramasser';
    case 'auto-fed':
      return "Il s'est nourri tout seul 🥣";
    case 'auto-collected':
      return 'Le Majordome a ramassé le pot 🫙';
    case 'event-lost':
      return 'Un pillard a frappé pendant ton absence 😿';
    case 'event-defended':
      return 'Il a repoussé une menace 🛡️';
    case 'event-boon':
      return 'Une bonne surprise est passée par là ✨';
    default:
      return null;
  }
}

export function ReportModal({ report }: { report: ReturnReport }) {
  const { cfg, dismissReport } = useTokidachi();
  const lookup = (id: string) => skillById(cfg, id)?.label ?? id;
  const lines = [...new Set(report.events.map((e) => eventLine(e, lookup)).filter(Boolean))] as string[];

  return (
    <div className="panel-backdrop" onClick={dismissReport}>
      <div className="panel report" onClick={(e) => e.stopPropagation()}>
        <h2>Pendant ton absence…</h2>
        <p className="panel-hint">
          {formatActiveDuration(report.activeSecondsAway)} de vie active
        </p>
        <ul className="report-list">
          <li>🍞 Miettes : {signed(report.crumbsDelta)}</li>
          <li>🍽️ Satiété : {signed(report.satietyDelta)}</li>
          <li>😊 Humeur : {signed(report.moodDelta)}</li>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <button className="btn-primary" onClick={dismissReport}>Me revoilà !</button>
      </div>
    </div>
  );
}
