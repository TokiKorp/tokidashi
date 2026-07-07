// Mode DEV (GDD §5.3, défaut au premier lancement) : aucune requête réseau,
// réactions tirées du Cerveau local avec une petite latence simulée pour que
// l'UI (bulle « … ») se comporte comme avec un vrai provider.

import { pickScriptedReaction } from '../game/reactions';
import type { AIProvider, Reaction, ReactionContext } from './provider';

export class DevProvider implements AIProvider {
  readonly id = 'dev';
  readonly label = 'Mode DEV (simulé, zéro coût)';
  readonly kind = 'dev' as const;

  async generateReaction(ctx: ReactionContext): Promise<Reaction> {
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 400));
    return {
      text: pickScriptedReaction(ctx.tier, ctx.moodBucket, ctx.stage),
      source: 'scripted',
    };
  }
}
