export const CRITERIA = ["흐름", "근거", "분명한 말", "듣는 사람과 시간"] as const;
export type Criterion = (typeof CRITERIA)[number];

// Order matters: questions are always asked in this order.
export const QUESTION_TYPES = ["근거", "다른 설명", "개념과 범위"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface Strength {
  criterion: Criterion;
  quote: string;
  why: string;
}

export interface Improvement {
  criterion: Criterion;
  quote: string;
  problem: string;
  tryThis: string;
}

export interface Question {
  type: QuestionType;
  quote: string;
  question: string;
  goodAnswer: string;
  avoidAnswer: string;
}

export interface Review {
  summary: string;
  strengths: Strength[];
  improvements: Improvement[];
  questions: Question[];
}

export type Checked<T> = T & { quoteFound: boolean };

export interface CheckedReview {
  summary: string;
  strengths: Checked<Strength>[];
  improvements: Checked<Improvement>[];
  questions: Checked<Question>[];
}

export type Section = "strengths" | "improvements" | "questions";

export interface Shortage {
  section: Section;
  found: number;
  expected: number;
}

export type CoachErrorKind = "no_key" | "auth" | "network" | "busy" | "invalid_response" | "refused" | "unknown";

// Answers

export const VERDICTS = ["좋음", "보완 필요", "부족"] as const;
export type Verdict = (typeof VERDICTS)[number];

// One field per feedback sentence: what went well, what is missing, and one sentence to try.
export const FEEDBACK_FIELDS = ["wentWell", "missing", "tryThis"] as const;

export interface AnswerFeedback {
  verdict: Verdict;
  wentWell: string;
  missing: string;
  tryThis: string;
}

// "missing" means the question was answered but no evaluation came back for it.
export type AnswerEvaluation =
  | { status: "evaluated"; feedback: AnswerFeedback }
  | { status: "skipped" }
  | { status: "missing" };

export type AnswerResult =
  | { ok: true; evaluations: AnswerEvaluation[]; notices: string[] }
  | { ok: false; kind: CoachErrorKind | "bad_input"; message: string };

export type ReviewResult =
  | { ok: true; review: CheckedReview; notices: string[]; estimatedSeconds: number }
  | { ok: false; kind: CoachErrorKind | "bad_input"; message: string };

// Rehearsal delivery feedback

// The four delivery items, in the order the result screen shows them.
export const DELIVERY_ITEMS = ["말 속도", "침묵", "목소리 크기", "제한 시간"] as const;
export type DeliveryItem = (typeof DELIVERY_ITEMS)[number];

/** What the screen sends for coach feedback: scores, reason numbers, and silence times only. */
export interface DeliverySummary {
  total: number;
  items: { item: DeliveryItem; score: number | null; reason: string }[];
  silences: { start: number; end: number }[];
}

// tryThis is null for an item with full marks: it only gets a sentence about keeping it up.
export interface DeliveryItemFeedback {
  item: DeliveryItem;
  explain: string;
  tryThis: string | null;
}

export interface DeliveryFeedback {
  summary: string;
  items: DeliveryItemFeedback[];
}

export type DeliveryFeedbackResult =
  | { ok: true; feedback: DeliveryFeedback; notices: string[] }
  | { ok: false; kind: CoachErrorKind | "bad_input"; message: string };
