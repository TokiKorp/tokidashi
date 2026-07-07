// Banque de réactions scriptées — le « Cerveau local » (GDD §6.6).
// Sert de mode DEV et de repli gracieux : le jeu ne casse jamais faute d'IA.
//
// Garde-fou éthique (GDD §12) : la déception est une VANNE, jamais un chantage
// affectif. Aucune ligne ne reproche au joueur de ne pas dépenser plus.

import type { StageCode } from './types';

/** Tranche de quantité — le ressort comique principal (GDD §6.6). */
export type ReactionTier = 'ridicule' | 'normal' | 'feast';
export type MoodBucket = 'grumpy' | 'neutral' | 'happy';

export function reactionTier(satietyRestored: number): ReactionTier {
  if (satietyRestored <= 15) return 'ridicule';
  if (satietyRestored < 70) return 'normal';
  return 'feast';
}

export function moodBucket(mood: number): MoodBucket {
  if (mood < 35) return 'grumpy';
  if (mood <= 70) return 'neutral';
  return 'happy';
}

/** Le blob babille, l'enfant parle (GDD §6.6 : « un bébé babille, un adulte ironise »). */
type Voice = 'babble' | 'talk';

function voiceOf(stage: StageCode): Voice {
  return stage === 'blob' ? 'babble' : 'talk';
}

const BANK: Record<Voice, Record<ReactionTier, Record<MoodBucket, string[]>>> = {
  babble: {
    ridicule: {
      grumpy: ['Bwé… ?', 'Gnnn. Miam ?', 'Pfff-bloup.'],
      neutral: ['Bloup ? Cé tou ?', 'Miam. Pouic.', 'Gnap ! …gnap ?'],
      happy: ['Pouic ! Titi miam !', 'Nyam ! Ankor ?', 'Hihi, mini-miam !'],
    },
    normal: {
      grumpy: ['Gnam. Bof-bloup.', 'Miam… (grmbl)', 'Nyam. Voala.'],
      neutral: ['Nyam nyam !', 'Gloup ! Merchi !', 'Miam-bloup !'],
      happy: ['Nyaaaam ! ♥', 'Gloup gloup ! Youpi !', 'Miam ! Toki kontan !'],
    },
    feast: {
      grumpy: ['Oooh. Gro miam. …merchi.', 'Bloup?! Tou ça ?!', 'Gnam gnam gnam !!'],
      neutral: ['OUAAAH ! Gro gro miam !', 'Bloup-bloup !! Ventre rond !', 'Gnap gnap !! Boum, plein !'],
      happy: ['BANQUET !!! ♥♥', 'Toki va sploser !!', 'Nyaaaaam !!! Mersiii !!'],
    },
  },
  talk: {
    ridicule: {
      grumpy: ["Sérieux ? C'est tout ?", 'Une miette. Une. Je note.', "J'ai connu des famines plus généreuses."],
      neutral: ["C'est un amuse-bouche, j'imagine ?", 'Mm. Entrée dégustation, donc.', "Merci ! …il y a une suite ?"],
      happy: ["Héhé, un p'tit encas ! J'aime bien.", 'Miniature mais mignon, comme moi !', "Une bouchée ! Chic, un jeu de piste."],
    },
    normal: {
      grumpy: ["Bon. C'est mangeable. Merci.", "Ça ira. J'avais pire en tête.", 'Merci… je garde ma rancune pour plus tard.'],
      neutral: ["Merci ! Pile ce qu'il fallait.", 'Miam, honnête et efficace.', "Voilà un vrai repas. J'approuve."],
      happy: ["Délicieux ! T'es le meilleur !", 'Miam !! Je reprends des forces !', "Parfait ! Je sens que je vais briller aujourd'hui."],
    },
    feast: {
      grumpy: ["…D'accord. Là tu marques des points.", "Un festin ? Bon. Je révise mon jugement.", "J'étais grognon. J'étais. Passé."],
      neutral: ['UN FESTIN ?! Quelle occasion !', "Je vais avoir besoin d'une sieste après ça.", "Tout ça ? Pour moi ? J'en pleurerais."],
      happy: ["JE VAIS EXPLOSER ! (de joie)", 'Coma alimentaire imminent. Aucun regret.', "C'est le plus beau jour de ma vie de pixel !!"],
    },
  },
};

/**
 * Pioche une réplique scriptée (tranche × humeur × voix du stade).
 * `rng` injectable pour les tests.
 */
export function pickScriptedReaction(
  tier: ReactionTier,
  bucket: MoodBucket,
  stage: StageCode,
  rng: () => number = Math.random,
): string {
  const lines = BANK[voiceOf(stage)][tier][bucket];
  return lines[Math.floor(rng() * lines.length) % lines.length];
}
