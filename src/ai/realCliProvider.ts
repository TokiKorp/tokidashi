import { pickCli, pickRandomQuestion, runCliQuery, shortenResponse } from './cliRunner';
import type { AIProvider, Reaction, ReactionContext } from './provider';
import { pickScriptedReaction } from '../game/reactions';
import { liveStore } from '../state/store';

export class RealCliProvider implements AIProvider {
  readonly id = 'cli';
  readonly label = 'Real CLI Provider (agy, codex, claude)';
  readonly kind = 'cli' as const;

  async generateReaction(ctx: ReactionContext): Promise<Reaction> {
    // 1. Choose CLI and get a stupid random question
    const store = liveStore();
    const selectedCli = store.getState().selectedCli;
    const cli = selectedCli === 'random' ? pickCli() : selectedCli;
    const question = pickRandomQuestion();
    
    const language = store.getState().language;
    
    // 2. Format a prompt instructing the CLI to be extremely brief and in the correct language
    const promptSuffix = language === 'fr'
      ? '(Réponds en français en 1 seule phrase très courte de maximum 12 mots)'
      : '(Please answer in English in 1 very short sentence of max 12 words)';
    const prompt = `${question} ${promptSuffix}`;
    
    // 3. Update UI/store to show that we are calling the CLI
    
    // 4. Run CLI query
    const result = await runCliQuery(cli, prompt);
    
    if (result.success && result.response) {
      // Clean and shorten response
      const shortened = shortenResponse(result.response);
      
      // Update the real token bag in store if we consumed tokens
      if (result.tokens_consumed > 0) {
        store.getState().addTokensToBag(result.tokens_consumed, result.cli_used);
      }
      
      return {
        text: `[${result.cli_used.toUpperCase()}] ${shortened}`,
        source: 'ai'
      };
    } else {
      console.warn('RealCliProvider: CLI execution failed, falling back to Local Brain', result.error);
      // Fallback to locally scripted reaction
      return {
        text: pickScriptedReaction(ctx.tier, ctx.moodBucket, ctx.stage),
        source: 'scripted'
      };
    }
  }
}
