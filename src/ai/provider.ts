// Interface AIProvider (GDD §5.3) — la source des réactions au nourrissage est
// branchable : mode DEV (simulé), provider gratuit (Gemini free, Ollama…), ou
// provider forfaitaire payant (opt-in explicite, GDD §12).
//
// Le modèle de jeu ne change pas selon le provider : une jauge de capacité en
// TOKEN + une génération de réaction courte. En mode DEV la jauge est simulée
// et vit dans la sauvegarde ; un provider réel exposera la sienne.

import type { Currency, StageCode } from '../game/types';
import type { MoodBucket, ReactionTier } from '../game/reactions';

export interface ReactionContext {
  stage: StageCode;
  mood: number;
  moodBucket: MoodBucket;
  vitality: number;
  satietyBefore: number;
  foodLabel: string;
  satietyRestored: number;
  tier: ReactionTier;
  currency: Currency;
  cost: number;
  companionName: string;
}

export interface Reaction {
  text: string;
  /** 'ai' = généré par un appel réel ; 'scripted' = Cerveau local (GDD §6.6). */
  source: 'ai' | 'scripted';
}

export type ProviderKind = 'dev' | 'free' | 'paid';

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  readonly kind: ProviderKind;
  /**
   * Génère la réaction au repas. Ne doit JAMAIS rejeter : en cas d'erreur
   * (réseau, quota), replier sur le Cerveau local — le jeu ne casse pas
   * faute d'IA (GDD §6.6, repli gracieux).
   */
  generateReaction(ctx: ReactionContext): Promise<Reaction>;
}
