// Persistance locale offline-first. MVP milestone 1 : tauri-plugin-store (JSON).
// Migration vers SQLite (tauri-plugin-sql) prévue quand le LedgerEntry arrivera
// (GDD §11). Fallback localStorage pour le dev navigateur (vite sans coque).

import type { GameState } from '../game/types';

export interface SaveData {
  version: 1;
  game: GameState;
  providerId: string;
  selectedCli?: 'random' | 'agy' | 'codex' | 'claude';
  devMode?: boolean;
  notificationsEnabled?: boolean;
  notifyThingsDone?: boolean;
  notifyNeedsAttention?: boolean;
  savedAtIso: string;
  backupId?: string;
  cloudSyncEnabled?: boolean;
  cloudServerUrl?: string;
  language?: 'fr' | 'en';
}

const STORE_FILE = 'tokidachi.json';
const STORE_KEY = 'save';
const LOCAL_KEY = 'tokidachi-save';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function loadSave(): Promise<SaveData | null> {
  try {
    if (isTauri()) {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: false, defaults: {} });
      const data = await store.get<SaveData>(STORE_KEY);
      return data ?? null;
    }
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch (err) {
    console.error('Tokidachi: échec de chargement de la sauvegarde', err);
    return null;
  }
}

export async function writeSave(data: SaveData): Promise<void> {
  try {
    if (isTauri()) {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: false, defaults: {} });
      await store.set(STORE_KEY, data);
      await store.save();
    } else {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    }

    // Background cloud sync
    if (data.cloudSyncEnabled && data.backupId && data.cloudServerUrl) {
      const url = `${data.cloudServerUrl.replace(/\/$/, '')}/api/sync`;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupId: data.backupId,
          saveData: data,
          submitToLeaderboard: true,
        }),
      }).catch((err) => {
        console.warn('Tokidachi: background cloud sync failed', err);
      });
    }
  } catch (err) {
    console.error('Tokidachi: échec de sauvegarde', err);
  }
}

export async function clearSave(): Promise<void> {
  try {
    if (isTauri()) {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: false, defaults: {} });
      await store.delete(STORE_KEY);
      await store.save();
    } else {
      localStorage.removeItem(LOCAL_KEY);
    }
  } catch (err) {
    console.error('Tokidachi: échec de la remise à zéro', err);
  }
}
