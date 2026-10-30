import { IMPROVEMENT_COUNT, MAX_SUMMARY_SENTENCES, QUESTION_COUNT, STRENGTH_COUNT } from "./coachConfig";
import { MAX_ITEM_SCORE } from "./deliveryConfig";
import {
  CRITERIA,
  QUESTION_TYPES,
  REHEARSAL_ITEMS,
  VERDICTS,
  type AnswerEvaluation,
  type AnswerFeedback,
  type CheckedReview,
  type Criterion,
  type DeliveryFeedback,
  type DeliveryItemFeedback,
  type Improvement,
  type Question,
  type QuestionType,
  type RehearsalItem,
  type Review,
  type ReviewResult,
  type Section,
  type Shortage,
  type Strength,
  type Verdict,
} from "./types";

// Pure functions only: no network, no browser APIs.

export const REQUIRED_COUNTS: Record<Section, number> = {
  strengths: STRENGTH_COUNT,
  improvements: IMPROVEMENT_COUNT,
  questions: QUESTION_COUNT,
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

// Screen text is shown as plain text, so markdown marks would appear as-is.
const MARKDOWN = /[*#_`~]/g;
// Questions are read aloud, so brackets and other symbols are removed too.
const SPOKEN_NOISE = /[*#_`~<>[\]{}()]/g;

function cleaned(value: unknown, noise: RegExp): string | null {
  const raw = text(value);
  if (raw === null) return null;
  return text(raw.replace(noise, "").replace(/\s{2,}/g, " "));
}

function screen(value: unknown): string | null {
  return cleaned(value, MARKDOWN);
}

function spoken(value: unknown): string | null {
  return cleaned(value, SPOKEN_NOISE);
}

// The screen labels the field "이렇게 말해 보기", so the same words at the start would show twice.
const TRY_LEAD_IN = /^이렇게 말해 (?:보세요|보기)\s*[.:：,!—–-]?\s*/;

function tryThisText(value: unknown): string | null {
  const cleanedText = screen(value);
  return cleanedText === null ? null : text(cleanedText.replace(TRY_LEAD_IN, ""));
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
  const why = screen(raw.why);
  return c && quote && why ? { criterion: c, quote, why } : null;
}

function toImprovement(raw: Raw): Improvement | null {
  const c = criterion(raw.criterion);
  const quote = text(raw.quote);
  const problem = screen(raw.problem);
  const tryThis = tryThisText(raw.tryThis);
  return c && quote && problem && tryThis ? { criterion: c, quote, problem, tryThis } : null;
}

function toQuestion(raw: Raw): Question | null {
  const type = questionType(raw.type);
  const quote = text(raw.quote);
  const question = spoken(raw.question);
  const goodAnswer = screen(raw.goodAnswer);
  const avoidAnswer = screen(raw.avoidAnswer);
  return type && quote && question && goodAnswer && avoidAnswer
    ? { type, quote, question, goodAnswer, avoidAnswer }
    : null;
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

// Extra sentences are dropped from the middle so the closing encouragement survives.
function limitSummary(value: string): string {
  const sentences = splitSentences(value);
  if (sentences.length <= MAX_SUMMARY_SENTENCES) return sentences.join(" ");
  return [...sentences.slice(0, MAX_SUMMARY_SENTENCES - 1), sentences[sentences.length - 1]].join(" ");
}

/**
 * Cleans Claude's review. Returns null when the response is unusable.
 * Invalid items are dropped; extra items are cut from the front.
 */
export function normalizeReview(raw: unknown): Review | null {
  if (!isRecord(raw)) return null;
  const summary = screen(raw.summary);
  if (summary === null) return null;

  return {
    summary: limitSummary(summary),
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

// ---------- Screen flow ----------

type ReviewErrorKind = Extract<ReviewResult, { ok: false }>["kind"];

/** A broken response is asked for once more without the user pressing anything. */
export function shouldAutoRetry(kind: ReviewErrorKind, retriesSoFar: number): boolean {
  return kind === "invalid_response" && retriesSoFar === 0;
}

/** What the practice screen may show. The evaluation stays hidden until the end. */
export function practiceQuestions(review: CheckedReview): Pick<Question, "type" | "question">[] {
  return review.questions.map(({ type, question }) => ({ type, question }));
}

// ---------- Input ----------

const MAX_SCRIPT_CHARS = 20000;
const MIN_LIMIT_SECONDS = 10;
const MAX_LIMIT_SECONDS = 3600;

export function scriptError(script: string): string | null {
  const trimmed = script.trim();
  if (trimmed === "") return "대본을 입력해 주세요.";
  if (trimmed.length > MAX_SCRIPT_CHARS) return "대본이 너무 길어요. 2만 자 이하로 줄여 주세요.";
  return null;
}

/** Shared by the form and the server, so the user always sees the app's own message. */
export function inputError(script: string, limitSeconds: unknown): string | null {
  const problem = scriptError(script);
  if (problem !== null) return problem;
  if (
    typeof limitSeconds !== "number" ||
    !Number.isFinite(limitSeconds) ||
    limitSeconds < MIN_LIMIT_SECONDS ||
    limitSeconds > MAX_LIMIT_SECONDS
  ) {
    return "제한 시간을 10초에서 60분 사이로 입력해 주세요.";
  }
  return null;
}

// ---------- Answers ----------

// Skipping a question is allowed; a blank answer counts as skipped.
export function isAnswered(answer: string): boolean {
  return answer.trim() !== "";
}

export function answerLabel(answer: string): string {
  return isAnswered(answer) ? answer.trim() : "답하지 않음";
}

function verdict(value: unknown): Verdict | null {
  const raw = text(value);
  return VERDICTS.find((v) => v === raw) ?? null;
}

// Each feedback field holds one sentence, so the feedback is always three sentences.
function oneSentence(cleanedText: string | null): string | null {
  return cleanedText === null ? null : (splitSentences(cleanedText)[0] ?? null);
}

/** Cleans Claude's answer evaluations, keyed by question number (1-based). Null when unusable. */
export function normalizeAnswerFeedback(raw: unknown): Map<number, AnswerFeedback> | null {
  if (!isRecord(raw) || !Array.isArray(raw.evaluations)) return null;
  const found = new Map<number, AnswerFeedback>();
  for (const item of list(raw.evaluations)) {
    const n = item.questionNumber;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || found.has(n)) continue;
    const v = verdict(item.verdict);
    const wentWell = oneSentence(screen(item.wentWell));
    const missing = oneSentence(screen(item.missing));
    const tryThis = oneSentence(tryThisText(item.tryThis));
    if (v && wentWell && missing && tryThis) found.set(n, { verdict: v, wentWell, missing, tryThis });
  }
  return found;
}

/** One entry per question: skipped when not answered, missing when answered but not evaluated. */
export function answerEvaluations(answers: string[], found: Map<number, AnswerFeedback>): AnswerEvaluation[] {
  return answers.map((answer, i) => {
    if (!isAnswered(answer)) return { status: "skipped" };
    const feedback = found.get(i + 1);
    return feedback ? { status: "evaluated", feedback } : { status: "missing" };
  });
}

export function missingAnswerMessage(count: number): string {
  return `답변 평가를 ${count}개 받지 못했어요`;
}

export function evaluationLabel(evaluation: AnswerEvaluation): string {
  if (evaluation.status === "evaluated") return evaluation.feedback.verdict;
  return evaluation.status === "skipped" ? answerLabel("") : "평가를 받지 못했어요";
}

/** The three feedback sentences in the order the skill file writes them, with screen labels. */
export function feedbackLines(feedback: AnswerFeedback): { label: string; text: string }[] {
  return [
    { label: "좋았던 점", text: feedback.wentWell },
    { label: feedback.verdict === "좋음" ? "더 좋게 할 점" : "빠진 점", text: feedback.missing },
    { label: "이렇게 말해 보기", text: feedback.tryThis },
  ];
}

// ---------- Delivery feedback ----------

/**
 * Cleans Claude's delivery feedback. Only items that were scored are kept, in the screen's order.
 * An item with full marks gets no thing to try; any other item needs one. Null when unusable.
 */
export function normalizeDeliveryFeedback(
  raw: unknown,
  scores: ReadonlyMap<RehearsalItem, number | null>,
): DeliveryFeedback | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  const summary = oneSentence(screen(raw.summary));
  if (summary === null) return null;

  const found = new Map<RehearsalItem, DeliveryItemFeedback>();
  for (const entry of list(raw.items)) {
    const item = REHEARSAL_ITEMS.find((name) => name === text(entry.item));
    const score = item ? scores.get(item) : undefined;
    if (!item || score === undefined || score === null || found.has(item)) continue;
    const explain = oneSentence(screen(entry.explain));
    const tryThis = score === MAX_ITEM_SCORE ? null : oneSentence(tryThisText(entry.tryThis));
    if (explain === null || (score !== MAX_ITEM_SCORE && tryThis === null)) continue;
    found.set(item, { item, explain, tryThis });
  }
  return { summary, items: REHEARSAL_ITEMS.flatMap((item) => found.get(item) ?? []) };
}

export function missingDeliveryMessage(count: number): string {
  return `코치 피드백을 ${count}개 항목에서 받지 못했어요`;
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

const QUOTE_CLOSERS: Record<string, string> = { '"': '"', "“": "”", "‘": "’", "「": "」", "『": "』" };

/**
 * Splits text into sentences. A sentence ends at . ? ! followed by a space or the line end,
 * so "2.5" does not split, and nothing inside quotation marks splits.
 */
export function splitSentences(value: string): string[] {
  const sentences: string[] = [];
  for (const line of value.split(/\n+/)) {
    const chars = [...line];
    let current = "";
    let closer: string | null = null;
    chars.forEach((char, i) => {
      current += char;
      if (closer !== null) {
        if (char === closer) closer = null;
      } else if (char in QUOTE_CLOSERS) {
        closer = QUOTE_CLOSERS[char];
      } else if (/[.?!]/.test(char) && (i === chars.length - 1 || /\s/.test(chars[i + 1]))) {
        sentences.push(current);
        current = "";
      }
    });
    sentences.push(current);
  }
  return sentences.map((s) => s.trim()).filter((s) => s !== "");
}
