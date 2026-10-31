import type { SpeechSegment } from "./deliveryScore";
import {
  DICTATION_GAP_SECONDS,
  MATCH_MIN_SIMILARITY,
  MIN_MATCH_LETTERS,
  MISSES_BEFORE_FULL_SEARCH,
  READ_MIN_COVERAGE,
  SEARCH_AHEAD_SENTENCES,
  SEARCH_BACK_SENTENCES,
} from "./sectionConfig";
import { countSyllables, splitSentences } from "./validate";

// Pure functions only: where in the script the speaker was during a rehearsal (v0.4).
// Without dictation the position is an estimate from speaking time alone: the speaker is taken to
// read the whole script at one steady pace while talking, and not to move on while silent.
// With dictation the dictated text is matched against the script, sentence by sentence.

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

// ---------- Reading numbers and abbreviations ----------

// Dictation writes numbers and English either way ("87명" or "팔십칠 명", "AI" or "에이아이"), so both
// the script and the dictated text are turned into how they are read before they are compared.
// Numbers are read the Sino-Korean way (87 → 팔십칠); native readings like "세 개" will not match exactly.

const DIGITS = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL_UNITS = ["", "십", "백", "천"];
const LARGE_UNITS = ["", "만", "억", "조"];

function digitByDigit(digits: string): string {
  return [...digits].map((d) => DIGITS[Number(d)]).join("");
}

/** Up to four digits without leading zeros: 1 before 십, 백, 천 is not read (십, not 일십). */
function readGroup(digits: string): string {
  return [...digits]
    .map((d, i) => {
      const digit = Number(d);
      const place = digits.length - 1 - i;
      if (digit === 0) return "";
      return (digit === 1 && place > 0 ? "" : DIGITS[digit]) + SMALL_UNITS[place];
    })
    .join("");
}

function readInteger(digits: string): string {
  if (/^0+$/.test(digits)) return "영";
  // Codes like 007, and numbers too long for 조, are read one digit at a time.
  if (digits.startsWith("0") || digits.length > 16) return digitByDigit(digits);
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 4) groups.unshift(digits.slice(Math.max(0, end - 4), end));
  return groups
    .map((group, i) => {
      const unit = LARGE_UNITS[groups.length - 1 - i];
      const value = Number(group);
      if (value === 0) return "";
      // 10000 is read 만, not 일만; 100000000 is still 일억.
      if (value === 1 && unit === "만") return "만";
      return readGroup(String(value)) + unit;
    })
    .join("");
}

// 120,000 or 87, then an optional decimal part and percent sign.
const NUMBER = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s*%)?/g;
// "1만", "1천": the 1 is not read before a Korean unit, just as in 만 명.
const UNIT_AFTER_ONE = /^[십백천만]/;

// English words of up to four letters are taken as abbreviations read letter by letter (AI, KTX), whatever
// their case, since dictation may write "ai" or "Ai" for what the script has as "AI". Longer words
// (Google, iPhone, UNESCO) are taken as words and left as they are. A short word read as a word
// (NASA, Zoom, app) is misread; matching allows for a few such letters.
const ABBREVIATION = /(?<![A-Za-z])[A-Za-z]{1,4}(?![A-Za-z])/g;
const LETTER_NAMES: Record<string, string> = {
  A: "에이", B: "비", C: "씨", D: "디", E: "이", F: "에프", G: "지", H: "에이치", I: "아이",
  J: "제이", K: "케이", L: "엘", M: "엠", N: "엔", O: "오", P: "피", Q: "큐", R: "알",
  S: "에스", T: "티", U: "유", V: "브이", W: "더블유", X: "엑스", Y: "와이", Z: "제트",
};

/** Numbers, percents, decimals, and short abbreviations written out the way they are read. */
export function toSpokenKorean(text: string): string {
  const numbers = text.replace(NUMBER, (match, whole: string, fraction?: string, percent?: string, offset = 0) => {
    const digits = whole.replace(/,/g, "");
    const next = text.slice(offset + match.length);
    let spoken = digits === "1" && !fraction && !percent && UNIT_AFTER_ONE.test(next) ? "" : readInteger(digits);
    if (fraction) spoken += ` 점 ${digitByDigit(fraction)}`;
    if (percent) spoken += " 퍼센트";
    return spoken;
  });
  return numbers.replace(ABBREVIATION, (letters) => [...letters].map((l) => LETTER_NAMES[l.toUpperCase()]).join(""));
}

// Hesitation sounds said on their own ("음", "어", "으음", "어어"). Other fillers like "그" or "약간"
// are also real words in scripts, so they stay; matching allows for a few extra letters.
const HESITATION = /^(?:으*음+|어+)$/;

/** Only the letters to compare: read-out numbers and abbreviations, no spaces, punctuation, or hesitations. */
export function normalizeForMatch(text: string): string {
  return toSpokenKorean(text)
    .split(/\s+/)
    .filter((word) => !HESITATION.test(word.replace(/[^\p{L}]/gu, "")))
    .join("")
    .toLowerCase()
    .replace(/[^가-힣a-z]/g, "");
}

// ---------- Matching dictation to the script ----------

export interface TranscriptChunk {
  text: string;
  /** Seconds from the start of the rehearsal when dictation sent this piece. */
  at: number;
}

export interface TimeWindow {
  start: number;
  end: number;
}

function spokenBetween(start: number, end: number, segments: SpeechSegment[]): number {
  return segments.reduce((sum, s) => sum + Math.max(0, Math.min(end, s.end) - Math.max(start, s.start)), 0);
}

/**
 * Stretches where the speaker talked for more than DICTATION_GAP_SECONDS but dictation sent nothing.
 * `activity` holds the times dictation sent anything, finished or not.
 */
export function findDropouts(activity: number[], segments: SpeechSegment[], endedAt: number): TimeWindow[] {
  const times = [0, ...[...activity].sort((a, b) => a - b), endedAt];
  return times.slice(1).flatMap((end, i) => {
    const start = times[i];
    return round(spokenBetween(start, end, segments)) > DICTATION_GAP_SECONDS ? [{ start, end }] : [];
  });
}

/** Read; not read; not known because dictation had stopped; or a stage direction with nothing to read. */
export type SentenceReading = "read" | "missed" | "unknown" | "blank";

export interface ChunkMatch {
  /** Index of the dictated piece. */
  chunk: number;
  /** First and last sentence the piece matched. */
  first: number;
  last: number;
  /** Letters matched in each sentence from first to last, for sharing out the piece's speaking time. */
  letters: number[];
}

/**
 * The part of `text` closest to `heard`, allowing any start and end (edit distance with free ends).
 * Ties go to the earliest end.
 */
function closestPart(heard: string, text: string): { distance: number; start: number; end: number } {
  let previous = Array.from({ length: text.length + 1 }, () => 0);
  let previousStart = Array.from({ length: text.length + 1 }, (_, j) => j);
  for (let i = 1; i <= heard.length; i++) {
    const current = [i];
    const currentStart = [0];
    for (let j = 1; j <= text.length; j++) {
      const options: [number, number][] = [
        [previous[j - 1] + (heard[i - 1] === text[j - 1] ? 0 : 1), previousStart[j - 1]],
        [previous[j] + 1, previousStart[j]],
        [current[j - 1] + 1, currentStart[j - 1]],
      ];
      const [distance, start] = options.reduce((best, option) => (option[0] < best[0] ? option : best));
      current.push(distance);
      currentStart.push(start);
    }
    previous = current;
    previousStart = currentStart;
  }
  let end = 0;
  for (let j = 1; j <= text.length; j++) if (previous[j] < previous[end]) end = j;
  return { distance: previous[end], start: previousStart[end], end };
}

function overlaps(windows: TimeWindow[], start: number, end: number): boolean {
  return windows.some((w) => w.start < end && w.end > start);
}

/**
 * Which sentences were read, from dictated pieces in the order they came. Each piece is looked for from
 * one sentence before the current position to five after it, and moves the position to where it ended.
 * After MISSES_BEFORE_FULL_SEARCH pieces in a row match nothing there, the piece is looked for in the whole
 * script. When a piece fits equally well behind and ahead (the same sentence twice), the nearest one ahead wins.
 * Sentences passed over while dictation was down (`dropouts`) are unknown rather than missed.
 */
export function alignTranscript(
  sentences: ScriptSentence[],
  chunks: TranscriptChunk[],
  dropouts: TimeWindow[],
): { sentences: SentenceReading[]; matches: ChunkMatch[] } {
  const letters = sentences.map((s) => (s.syllables === 0 ? "" : normalizeForMatch(s.text)));
  const starts: number[] = [];
  letters.reduce((position, l) => {
    starts.push(position);
    return position + l.length;
  }, 0);
  const script = letters.join("");
  const covered = new Uint8Array(script.length);
  const sentenceAt = (index: number) =>
    letters.findIndex((l, i) => l.length > 0 && index >= starts[i] && index < starts[i] + l.length);

  const unknown = new Set<number>();
  const matches: ChunkMatch[] = [];
  let readUpTo = -1;
  let lastMatchedAt = 0;
  let misses = 0;

  // The closest part of sentences first..last, as letter positions in the whole script.
  const closestIn = (heard: string, first: number, last: number) => {
    const offset = starts[first];
    const part = closestPart(heard, script.slice(offset, starts[last] + letters[last].length));
    return { distance: part.distance, from: offset + part.start, to: offset + part.end };
  };
  // Looks from `back` sentences before the cursor to `ahead` after it, but takes the part from the cursor
  // on unless the part behind is strictly closer.
  const search = (heard: string, cursor: number, back: number, ahead: number) => {
    const last = Math.min(sentences.length - 1, cursor + ahead);
    const forward = closestIn(heard, cursor, last);
    const whole = closestIn(heard, Math.max(0, cursor - back), last);
    return whole.distance < forward.distance ? whole : forward;
  };
  const fits = (heard: string, part: { distance: number; from: number; to: number }) =>
    part.to > part.from && round(1 - part.distance / heard.length) >= MATCH_MIN_SIMILARITY;

  const markPassedOver = (until: number) => {
    for (let i = readUpTo + 1; i < until; i++) unknown.add(i);
  };

  chunks.forEach((chunk, index) => {
    const heard = normalizeForMatch(chunk.text);
    if (heard.length < MIN_MATCH_LETTERS || script.length === 0) return;

    const cursor = Math.max(0, readUpTo);
    let part = search(heard, cursor, SEARCH_BACK_SENTENCES, SEARCH_AHEAD_SENTENCES);
    if (!fits(heard, part) && misses + 1 >= MISSES_BEFORE_FULL_SEARCH) {
      part = search(heard, cursor, sentences.length, sentences.length);
    }
    if (!fits(heard, part)) {
      misses += 1;
      return;
    }
    misses = 0;

    const { from, to } = part;
    covered.fill(1, from, to);
    const first = sentenceAt(from);
    const last = sentenceAt(to - 1);
    if (overlaps(dropouts, lastMatchedAt, chunk.at)) markPassedOver(first);
    const matched = [];
    for (let i = first; i <= last; i++) {
      matched.push(Math.min(to, starts[i] + letters[i].length) - Math.max(from, starts[i]));
    }
    matches.push({ chunk: index, first, last, letters: matched });
    readUpTo = last;
    lastMatchedAt = chunk.at;
  });
  if (overlaps(dropouts, lastMatchedAt, Infinity)) markPassedOver(sentences.length);

  const readings = letters.map((l, i): SentenceReading => {
    if (l.length === 0) return "blank";
    const share = covered.subarray(starts[i], starts[i] + l.length).reduce((sum, c) => sum + c, 0) / l.length;
    if (share >= READ_MIN_COVERAGE) return "read";
    return unknown.has(i) ? "unknown" : "missed";
  });
  return { sentences: readings, matches };
}

// ---------- When each sentence was read ----------

/**
 * Clock times for speaking time `from` to `to`, counted along `segments` (in order): seconds of speech
 * become stretches of the rehearsal clock, skipping the pauses in between.
 */
function spokenToClock(segments: SpeechSegment[], from: number, to: number): TimeWindow[] {
  const spans: TimeWindow[] = [];
  let spoken = 0;
  for (const s of segments) {
    const length = s.end - s.start;
    const start = round(s.start + Math.max(0, from - spoken));
    const end = round(s.start + Math.min(length, to - spoken));
    if (end > start) spans.push({ start, end });
    spoken += length;
  }
  return spans;
}

function clip(segments: SpeechSegment[], start: number, end: number): SpeechSegment[] {
  return segments
    .map((s) => ({ start: Math.max(start, s.start), end: Math.min(end, s.end) }))
    .filter((s) => s.end > s.start);
}

/**
 * Without dictation: the stretches of the rehearsal when each sentence was being read, taking the whole
 * script to be read at one steady pace while speaking (the same estimate as estimatePosition).
 */
export function estimatedTimeline(sentences: ScriptSentence[], segments: SpeechSegment[]): TimeWindow[][] {
  const ordered = [...segments].sort((a, b) => a.start - b.start);
  const totalSyllables = sentences.at(-1)?.to ?? 0;
  const totalSpoken = spokenUntil(Infinity, ordered);
  if (totalSyllables === 0 || totalSpoken <= 0) return sentences.map(() => []);
  const perSyllable = totalSpoken / totalSyllables;
  return sentences.map((s) =>
    s.syllables === 0 ? [] : spokenToClock(ordered, round(s.from * perSyllable), round(s.to * perSyllable)),
  );
}

/**
 * With dictation: each matched piece stands for the speech between the piece before it and itself.
 * That speech is shared out over the sentences the piece matched, by matched letters. Speech in pieces
 * that matched nothing (improvised) belongs to no sentence; a sentence read twice gets both stretches.
 */
export function dictatedTimeline(
  sentences: ScriptSentence[],
  chunks: TranscriptChunk[],
  matches: ChunkMatch[],
  segments: SpeechSegment[],
): TimeWindow[][] {
  const ordered = [...segments].sort((a, b) => a.start - b.start);
  const timeline: TimeWindow[][] = sentences.map(() => []);
  for (const match of matches) {
    const speech = clip(ordered, chunks[match.chunk - 1]?.at ?? 0, chunks[match.chunk].at);
    const spoken = spokenUntil(Infinity, speech);
    const total = match.letters.reduce((sum, n) => sum + n, 0);
    if (spoken <= 0 || total === 0) continue;
    let before = 0;
    match.letters.forEach((n, i) => {
      const from = round((before / total) * spoken);
      before += n;
      timeline[match.first + i].push(...spokenToClock(speech, from, round((before / total) * spoken)));
    });
  }
  return timeline;
}
