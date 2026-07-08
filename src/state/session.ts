// Détection de présence (GDD §6.1) : verrouillage/déverrouillage de session
// → événement émis par la coque Rust (poll CGSession côté macOS) → gel/dégel
// de la simulation.

import { isTauri } from './persist';
import { liveStore } from './store';

export const LOCK_EVENT = 'tokidachi://lock-state';

export async function initSessionListeners(): Promise<void> {
  // Garde sur window : le module peut être ré-exécuté à chaud (HMR) sans que
  // les anciens listeners soient retirés — on ne câble qu'une fois.
  const g = window as unknown as { __tokidachiSessionWired?: boolean };
  if (g.__tokidachiSessionWired) return;
  g.__tokidachiSessionWired = true;

  const store = () => liveStore().getState();

  if (isTauri()) {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<boolean>(LOCK_EVENT, (event) => {
      store().setLocked(event.payload);
    });
  }
}
