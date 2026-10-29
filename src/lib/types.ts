export const CRITERIA = ["흐름", "근거", "분명한 말", "듣는 사람과 시간"] as const;
export type Criterion = (typeof CRITERIA)[number];

// Order matters: questions are always asked in this order.
export const QUESTION_TYPES = ["근거", "선택 이유", "한계"] as const;
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

export type ReviewResult =
  | { ok: true; review: CheckedReview; notices: string[]; estimatedSeconds: number }
  | { ok: false; kind: CoachErrorKind | "bad_input"; message: string };
