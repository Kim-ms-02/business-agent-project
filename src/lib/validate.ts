import {
  CRITERIA,
  QUESTION_TYPES,
  type CheckedReview,
  type Criterion,
  type Improvement,
  type Question,
  type QuestionType,
  type Review,
  type Section,
  type Shortage,
  type Strength,
} from "./types";

// Pure functions only: no network, no browser APIs.

export const REQUIRED_COUNTS: Record<Section, number> = {
  strengths: 2,
  improvements: 3,
  questions: 3,
};

const SECTION_LABELS: Record<Section, string> = {
  strengths: "잘한 점",
  improvements: "고칠 점",
  questions: "예상 질문",
};

// ---------- Review cleanup ----------

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Everything except quotes is read aloud, so markdown marks and brackets are removed.
const SPOKEN_NOISE = /[*#_`~>[\]{}()]/g;

function spoken(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) return null;
  return text(raw.replace(SPOKEN_NOISE, "").replace(/\s{2,}/g, " "));
}

function criterion(value: unknown): Criterion | null {
  const raw = text(value);
  return CRITERIA.find((c) => c === raw) ?? null;
}

function questionType(value: unknown): QuestionType | null {
  const raw = text(value);
  return QUESTION_TYPES.find((t) => t === raw) ?? null;
}

function list(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function toStrength(raw: Raw): Strength | null {
  const c = criterion(raw.criterion);
  const quote = text(raw.quote);
  const why = spoken(raw.why);
  return c && quote && why ? { criterion: c, quote, why } : null;
}

function toImprovement(raw: Raw): Improvement | null {
  const c = criterion(raw.criterion);
  const quote = text(raw.quote);
  const problem = spoken(raw.problem);
  const tryThis = spoken(raw.tryThis);
  return c && quote && problem && tryThis ? { criterion: c, quote, problem, tryThis } : null;
}

function toQuestion(raw: Raw): Question | null {
  const type = questionType(raw.type);
  const quote = text(raw.quote);
  const question = spoken(raw.question);
  const goodAnswer = spoken(raw.goodAnswer);
  return type && quote && question && goodAnswer ? { type, quote, question, goodAnswer } : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

// Keeps the first question of each type and puts them in the fixed order.
function oneQuestionPerType(questions: Question[]): Question[] {
  return QUESTION_TYPES.map((type) => questions.find((q) => q.type === type)).filter(
    (q): q is Question => q !== undefined,
  );
}

/**
 * Cleans Claude's review. Returns null when the response is unusable.
 * Invalid items are dropped; extra items are cut from the front.
 */
export function normalizeReview(raw: unknown): Review | null {
  if (!isRecord(raw)) return null;
  const summary = spoken(raw.summary);
  if (summary === null) return null;

  return {
    summary,
    strengths: list(raw.strengths).map(toStrength).filter(isPresent).slice(0, REQUIRED_COUNTS.strengths),
    improvements: list(raw.improvements)
      .map(toImprovement)
      .filter(isPresent)
      .slice(0, REQUIRED_COUNTS.improvements),
    questions: oneQuestionPerType(list(raw.questions).map(toQuestion).filter(isPresent)),
  };
}

// ---------- Counts ----------

export function findShortages(review: Review): Shortage[] {
  return (Object.keys(REQUIRED_COUNTS) as Section[])
    .map((section) => ({ section, found: review[section].length, expected: REQUIRED_COUNTS[section] }))
    .filter((s) => s.found < s.expected);
}

export function shortageMessage(shortage: Shortage): string {
  const label = SECTION_LABELS[shortage.section];
  return shortage.found === 0 ? `${label}을 찾지 못했어요` : `${label}을 ${shortage.found}개만 찾았어요`;
}

function itemCount(review: Review): number {
  return review.strengths.length + review.improvements.length + review.questions.length;
}

/** After one retry for a short review, picks the review to show. */
export function chooseReview(first: Review, retry: Review | null): Review {
  if (retry === null) return first;
  if (findShortages(retry).length === 0) return retry;
  return itemCount(retry) > itemCount(first) ? retry : first;
}

// ---------- Quote check ----------

// Quotes shorter than this (after removing spaces and punctuation) match too easily to count as evidence.
const MIN_QUOTE_CHARS = 5;

function letters(value: string): string {
  return value.replace(/[^\p{L}\p{N}]/gu, "");
}

/** True when the quote appears in the script, ignoring spacing and punctuation. */
export function quoteExists(script: string, quote: string): boolean {
  const needle = letters(quote);
  return needle.length >= MIN_QUOTE_CHARS && letters(script).includes(needle);
}

export function checkQuotes(review: Review, script: string): CheckedReview {
  const mark = <T extends { quote: string }>(item: T) => ({ ...item, quoteFound: quoteExists(script, item.quote) });
  return {
    summary: review.summary,
    strengths: review.strengths.map(mark),
    improvements: review.improvements.map(mark),
    questions: review.questions.map(mark),
  };
}

// ---------- Speaking time ----------

// Assumption: everyone speaks 300 syllables per minute. Real speed differs per person, so the
// estimated time and the "first 30 seconds" cut can be off. v0.2 replaces this with measured speed.
// Also listed as a known limit for the README.
export const SYLLABLES_PER_MINUTE = 300;

// One Korean syllable, one Latin letter, or one digit counts as one syllable.
// English is overcounted or undercounted ("API" is 3 here but 4 when spoken).
const SYLLABLE = /[가-힣A-Za-z0-9]/;

export function countSyllables(value: string): number {
  let count = 0;
  for (const char of value) if (SYLLABLE.test(char)) count++;
  return count;
}

export function estimateSeconds(value: string): number {
  return Math.round((countSyllables(value) / SYLLABLES_PER_MINUTE) * 60);
}

/** The opening part of the script that takes about `seconds` to say, under the 300-per-minute assumption. */
export function firstSecondsText(value: string, seconds: number): string {
  const limit = (seconds * SYLLABLES_PER_MINUTE) / 60;
  let count = 0;
  let end = 0;
  for (const char of value) {
    end += char.length;
    if (SYLLABLE.test(char) && ++count >= limit) return value.slice(0, end);
  }
  return value;
}

// ---------- Read-aloud ----------

/** Splits text into sentences for speech. A period inside a number ("2.5") does not end a sentence. */
export function splitSentences(value: string): string[] {
  return value
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.?!])\s+/))
    .map((s) => s.trim())
    .filter((s) => s !== "");
}
