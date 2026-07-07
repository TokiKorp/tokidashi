import { isTauri } from '../state/persist';

export const STUPID_QUESTIONS = [
  "Why do we park on driveways and drive on parkways?",
  "If a tomato is a fruit, is ketchup a smoothie?",
  "Do fish ever get thirsty?",
  "Why is abbreviation such a long word?",
  "If nothing sticks to Teflon, how does Teflon stick to the pan?",
  "Do birds think humans are weird because we don't have wings?",
  "If a cat always lands on its feet and buttered toast always lands butter-side down, what happens if you strap toast to a cat's back?",
  "Why do they call it a building if it's already built?",
  "What do sheep count when they can't sleep?",
  "Why is there a light in the fridge but not in the freezer?",
  "If gravity is always pulling us down, why do we call it antigravity?",
  "If the universe is expanding, what is it expanding into?",
  "Why is the word tongue so hard to spell?",
  "What happens if you turn on the headlights of a car at the speed of light?",
  "If hot air rises, why is it cold on mountaintops?",
  "Can you blow a bubble with beef-flavored bubble gum?",
  "Why does round pizza come in a square box?",
  "Do penguins have knees?",
  "If turtle shells are part of their skeleton, can they crawl out of them?",
  "Why do we say 'heads up' when we want people to duck?",
  "If a word is misspelled in the dictionary, how would we know?",
  "Is a hot dog a sandwich?",
  "Why do we buy garbage bags just to throw them away?",
  "Why is lemon juice mostly artificial flavor, but dishwashing liquid contains real lemons?",
  "If you describe something as indescribable, haven't you already described it?",
  "Do cows lose their voices when they moo too much?",
  "If a clone of you committed a crime, would you go to jail?",
  "Why does wood burn but diamonds do not, if both are carbon?",
  "Why is the speed of light the speed limit of the universe?",
  "If you try to fail and succeed, which one did you do?"
];

export interface CliResult {
  response: string;
  cli_used: string;
  tokens_consumed: number;
  success: boolean;
  error?: string;
}

export async function runCliQuery(cliName: string, prompt: string): Promise<CliResult> {
  try {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CliResult>('run_cli_command', { cliName, prompt });
    } else {
      const res = await fetch('/api/run-cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliName, prompt })
      });
      return await res.json() as CliResult;
    }
  } catch (err: any) {
    return {
      response: '',
      cli_used: cliName,
      tokens_consumed: 0,
      success: false,
      error: err.message || String(err)
    };
  }
}

export function pickRandomQuestion(): string {
  const idx = Math.floor(Math.random() * STUPID_QUESTIONS.length);
  return STUPID_QUESTIONS[idx];
}

export function pickCli(): string {
  const clis = ['agy', 'codex', 'claude'];
  const idx = Math.floor(Math.random() * clis.length);
  return clis[idx];
}

export function shortenResponse(text: string): string {
  if (!text) return "...";
  
  // Clean up markdown, extra quotes, backticks
  let cleaned = text
    .replace(/[*_`#]/g, '')
    .replace(/["']/g, '')
    .trim();
  
  // If there are multiple sentences, take the first one
  const sentences = cleaned.split(/[.!?]\s+/);
  let first = sentences[0];
  if (!first) return cleaned;
  
  // Restore ending punctuation if it was stripped
  if (!/[.!?]$/.test(first)) {
    first += ".";
  }
  
  // Truncate to a reasonable length for the pixel art bubble
  if (first.length > 70) {
    first = first.substring(0, 67) + "...";
  }
  
  return first;
}
