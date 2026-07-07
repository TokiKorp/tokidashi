// Registre des providers. MVP : mode DEV seul. Prochains candidats (GDD §13) :
// Gemini free tier, Ollama local, puis provider payant opt-in (clé d'API +
// budget de capacité auto-imposé).

import { DevProvider } from './devProvider';
import { RealCliProvider } from './realCliProvider';
import type { AIProvider } from './provider';

const providers: AIProvider[] = [new DevProvider(), new RealCliProvider()];

export function listProviders(): AIProvider[] {
  return providers;
}

export function providerById(id: string): AIProvider {
  return providers.find((p) => p.id === id) ?? providers[0];
}

export type { AIProvider, Reaction, ReactionContext } from './provider';
