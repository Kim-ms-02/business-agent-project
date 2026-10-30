import type { SpeechSegment } from "./deliveryScore";
import { countSyllables, splitSentences } from "./validate";

// Pure functions only: where in the script the speaker was during a rehearsal (v0.4).
// Without dictation the position is an estimate from speaking time alone: the speaker is taken to
// read the whole script at one steady pace while talking, and not to move on while silent.

export interface ScriptSentence {
  text: string;
  syllables: number;
  /** Syllables before this sentence. */
  from: number;
  /** Syllables up to the end of this sentence (from + syllables). */
  to: number;
}

// A sentence that is only a bracketed note, like "(웃음)" or "[박수]", is a stage direction: it stays in
// the table, so the screen can show every sentence in order, but has no syllables and is never a position.
const STAGE_DIRECTION = /^(?:\([^()]*\)|\[[^[\]]*\])$/;

/** The script split into sentences the same way as the rest of the app, with syllable positions. */
export function scriptSentences(script: string): ScriptSentence[] {
  let from = 0;
  return splitSentences(script).map((text) => {
    const syllables = STAGE_DIRECTION.test(text) ? 0 : countSyllables(text);
    const sentence = { text, syllables, from, to: from + syllables };
    from += syllables;
    return sentence;
  });
}

function spokenUntil(t: number, segments: SpeechSegment[]): number {
  return segments.reduce((sum, s) => sum + Math.max(0, Math.min(t, s.end) - s.start), 0);
}

// Speaking time times the pace drifts in the last digits (9.9999…), which would land a syllable
// on the wrong side of a sentence edge.
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Index of the sentence being read at time t (seconds from the start of the rehearsal), or null when
 * nothing was spoken or the script has no syllables. During a pause it stays where the speaker stopped;
 * a pause that falls exactly between two sentences counts as before the next one.
 */
export function estimatePosition(t: number, segments: SpeechSegment[], sentences: ScriptSentence[]): number | null {
  const totalSyllables = sentences.at(-1)?.to ?? 0;
  const totalSpoken = spokenUntil(Infinity, segments);
  if (totalSyllables === 0 || totalSpoken <= 0) return null;

  const read = round((spokenUntil(t, segments) * totalSyllables) / totalSpoken);
  const index = sentences.findIndex((s) => read >= s.from && read < s.to);
  if (index !== -1) return index;
  // At or past the end: the last sentence that has syllables.
  return sentences.findLastIndex((s) => s.syllables > 0);
}
