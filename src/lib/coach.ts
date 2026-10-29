import Anthropic from "@anthropic-ai/sdk";
import { loadSkill } from "./skill";
import { QUESTION_COUNT } from "./coachConfig";
import {
  CRITERIA,
  FEEDBACK_FIELDS,
  QUESTION_TYPES,
  VERDICTS,
  type AnswerFeedback,
  type AnswerResult,
  type CoachErrorKind,
  type Question,
  type ReviewResult,
} from "./types";
import {
  answerEvaluations,
  checkQuotes,
  chooseReview,
  estimateSeconds,
  findShortages,
  firstSecondsText,
  inputError,
  isAnswered,
  missingAnswerMessage,
  normalizeAnswerFeedback,
  normalizeReview,
  scriptError,
  shortageMessage,
} from "./validate";

// Server-only: calls Claude. The coaching wording lives in the skill file, not here.

export const DEFAULT_MODEL = "claude-sonnet-5-5";

// Claude Sonnet 5.5 rejects forced tool_choice, so the tool is offered with "auto" and
// `strict: true`, the skill file tells Claude to call it, and a reply without it is a broken response.
export const REVIEW_TOOL = {
  name: "submit_review",
  description: "발표 대본 평가 결과를 제출한다.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "strengths", "improvements", "questions"],
    properties: {
      summary: { type: "string" },
      strengths: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["criterion", "quote", "why"],
          properties: {
            criterion: { type: "string", enum: [...CRITERIA] },
            quote: { type: "string" },
            why: { type: "string" },
          },
        },
      },
      improvements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["criterion", "quote", "problem", "tryThis"],
          properties: {
            criterion: { type: "string", enum: [...CRITERIA] },
            quote: { type: "string" },
            problem: { type: "string" },
            tryThis: { type: "string" },
          },
        },
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "quote", "question", "goodAnswer", "avoidAnswer"],
          properties: {
            type: { type: "string", enum: [...QUESTION_TYPES] },
            quote: { type: "string" },
            question: { type: "string" },
            goodAnswer: { type: "string" },
            avoidAnswer: { type: "string" },
          },
        },
      },
    },
  },
} satisfies Anthropic.Tool;

export const ANSWER_TOOL = {
  name: "submit_answers",
  description: "질문 연습 답변 평가 결과를 제출한다.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["evaluations"],
    properties: {
      evaluations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["questionNumber", "verdict", ...FEEDBACK_FIELDS],
          properties: {
            questionNumber: { type: "integer" },
            verdict: { type: "string", enum: [...VERDICTS] },
            wentWell: { type: "string" },
            missing: { type: "string" },
            tryThis: { type: "string" },
          },
        },
      },
    },
  },
} satisfies Anthropic.Tool;

// ---------- Input ----------

export interface ReviewInput {
  script: string;
  topic: string;
  audience: string;
  limitSeconds: number;
}

export function parseReviewInput(body: unknown): { ok: true; input: ReviewInput } | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) return { ok: false, message: "요청 형식이 맞지 않아요." };
  const raw = body as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const script = str(raw.script);
  const error = inputError(script, raw.limitSeconds);
  if (error !== null) return { ok: false, message: error };
  const limitSeconds = raw.limitSeconds as number;

  return { ok: true, input: { script, topic: str(raw.topic), audience: str(raw.audience), limitSeconds } };
}

export interface AnswerInput {
  script: string;
  questions: Question[];
  answers: string[];
}

const MAX_ANSWER_CHARS = 5000;
const BAD_FORMAT = "요청 형식이 맞지 않아요.";

function toQuestionInput(value: unknown): Question | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const type = QUESTION_TYPES.find((t) => t === raw.type);
  const field = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "");
  const [quote, question, goodAnswer, avoidAnswer] = ["quote", "question", "goodAnswer", "avoidAnswer"].map(field);
  if (!type || !quote || !question || !goodAnswer || !avoidAnswer) return null;
  return { type, quote, question, goodAnswer, avoidAnswer };
}

export function parseAnswerInput(body: unknown): { ok: true; input: AnswerInput } | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) return { ok: false, message: BAD_FORMAT };
  const raw = body as Record<string, unknown>;

  const script = typeof raw.script === "string" ? raw.script.trim() : "";
  const problem = scriptError(script);
  if (problem !== null) return { ok: false, message: problem };

  const { questions: rawQuestions, answers } = raw;
  if (!Array.isArray(rawQuestions) || !Array.isArray(answers)) return { ok: false, message: BAD_FORMAT };
  if (rawQuestions.length === 0 || rawQuestions.length > QUESTION_COUNT || answers.length !== rawQuestions.length) {
    return { ok: false, message: BAD_FORMAT };
  }
  const questions = rawQuestions.map(toQuestionInput);
  if (questions.some((q) => q === null) || answers.some((a) => typeof a !== "string")) {
    return { ok: false, message: BAD_FORMAT };
  }
  if ((answers as string[]).some((a) => a.trim().length > MAX_ANSWER_CHARS)) {
    return { ok: false, message: "답이 너무 길어요. 5천 자 이하로 줄여 주세요." };
  }

  return { ok: true, input: { script, questions: questions as Question[], answers: answers as string[] } };
}

// Angle brackets from the user become full-width so the text cannot close our tags early.
// Quote checks ignore punctuation, so quotes still match the original script.
function inert(value: string): string {
  return value.replace(/</g, "＜").replace(/>/g, "＞");
}

/** The user message: data only, with the script inside tags. */
export function buildReviewMessage(input: ReviewInput): string {
  return [
    `주제: ${inert(input.topic) || "입력 안 함"}`,
    `듣는 사람: ${inert(input.audience) || "입력 안 함"}`,
    `제한 시간: ${input.limitSeconds}초`,
    `예상 발표 시간: ${estimateSeconds(input.script)}초`,
    `<first_30_seconds>\n${inert(firstSecondsText(input.script, 30))}\n</first_30_seconds>`,
    `<script>\n${inert(input.script)}\n</script>`,
  ].join("\n");
}

/** The user message for answer evaluation: only answered questions, each answer inside tags. */
export function buildAnswerMessage(input: AnswerInput): string {
  const blocks = input.questions.flatMap((q, i) => {
    const answer = input.answers[i];
    if (!isAnswered(answer)) return [];
    return [
      [
        `질문 ${i + 1}`,
        `종류: ${q.type}`,
        `질문: ${inert(q.question)}`,
        `겨냥한 대본 문장: ${inert(q.quote)}`,
        `좋은 답의 방향: ${inert(q.goodAnswer)}`,
        `피할 답: ${inert(q.avoidAnswer)}`,
        `<answer>\n${inert(answer.trim())}\n</answer>`,
      ].join("\n"),
    ];
  });
  return [...blocks, `<script>\n${inert(input.script)}\n</script>`].join("\n\n");
}

// ---------- Errors ----------

export const ERROR_MESSAGES: Record<CoachErrorKind, string> = {
  no_key: "API 키가 설정되지 않았어요. .env.local 파일에 키를 넣고 서버를 다시 켜 주세요.",
  auth: "API 키가 맞지 않아요. 키를 다시 확인해 주세요.",
  network: "인터넷 연결이 불안정해요. 연결을 확인하고 다시 시도해 주세요.",
  busy: "코치 서버가 지금 바빠요. 잠시 뒤에 다시 시도해 주세요.",
  invalid_response: "코치의 답이 정해진 형식에 맞지 않았어요. 다시 시도해 주세요.",
  refused: "이 대본은 평가하지 못했어요. 내용을 확인하고 다시 시도해 주세요.",
  unknown: "알 수 없는 문제가 생겼어요. 다시 시도해 주세요.",
};

export class InvalidResponseError extends Error {}
class RefusedError extends Error {}

export function classifyError(error: unknown): CoachErrorKind {
  if (error instanceof InvalidResponseError) return "invalid_response";
  if (error instanceof RefusedError) return "refused";
  if (error instanceof Anthropic.APIConnectionError) return "network";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return "auth";
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) return "busy";
  return "unknown";
}

// ---------- Call ----------

export type CreateMessage = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

export function createMessageWithClient(): CreateMessage {
  const client = new Anthropic();
  return (params) => client.messages.create(params);
}

export function coachModel(): string {
  return process.env.COACH_MODEL?.trim() || DEFAULT_MODEL;
}

async function requestReview(input: ReviewInput, create: CreateMessage, model: string) {
  const response = await create({
    model,
    max_tokens: 16000,
    system: loadSkill(),
    tools: [REVIEW_TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: buildReviewMessage(input) }],
  });
  if (response.stop_reason === "refusal") throw new RefusedError();

  const call = response.content.find((block) => block.type === "tool_use" && block.name === REVIEW_TOOL.name);
  const review = call && "input" in call ? normalizeReview(call.input) : null;
  if (review === null) throw new InvalidResponseError("missing or unusable review tool call");
  return review;
}

/** Reviews a script. Asks once more when items are missing, then shows what it has. */
export async function reviewScript(input: ReviewInput, create: CreateMessage, model: string): Promise<ReviewResult> {
  let review;
  try {
    review = await requestReview(input, create, model);
  } catch (error) {
    const kind = classifyError(error);
    return { ok: false, kind, message: ERROR_MESSAGES[kind] };
  }

  if (findShortages(review).length > 0) {
    const retry = await requestReview(input, create, model).catch(() => null);
    review = chooseReview(review, retry);
  }

  return {
    ok: true,
    review: checkQuotes(review, input.script),
    notices: findShortages(review).map(shortageMessage),
    estimatedSeconds: estimateSeconds(input.script),
  };
}

async function requestAnswerFeedback(input: AnswerInput, create: CreateMessage, model: string) {
  const response = await create({
    model,
    max_tokens: 16000,
    system: loadSkill(),
    tools: [ANSWER_TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: buildAnswerMessage(input) }],
  });
  if (response.stop_reason === "refusal") throw new RefusedError();

  const call = response.content.find((block) => block.type === "tool_use" && block.name === ANSWER_TOOL.name);
  const found = call && "input" in call ? normalizeAnswerFeedback(call.input) : null;
  if (found === null) throw new InvalidResponseError("missing or unusable answer tool call");
  return found;
}

/** Evaluates all answers in one call. Skipped questions are not sent; missing results are asked for once more. */
export async function evaluateAnswers(input: AnswerInput, create: CreateMessage, model: string): Promise<AnswerResult> {
  if (!input.answers.some(isAnswered)) {
    return { ok: true, evaluations: answerEvaluations(input.answers, new Map()), notices: [] };
  }

  let found: Map<number, AnswerFeedback>;
  try {
    found = await requestAnswerFeedback(input, create, model);
  } catch (error) {
    const kind = classifyError(error);
    return { ok: false, kind, message: ERROR_MESSAGES[kind] };
  }

  const countMissing = () => answerEvaluations(input.answers, found).filter((e) => e.status === "missing").length;
  if (countMissing() > 0) {
    const retry = await requestAnswerFeedback(input, create, model).catch(() => null);
    // Results from the first call win; the retry only fills the gaps.
    if (retry) found = new Map([...retry, ...found]);
  }

  const missing = countMissing();
  return {
    ok: true,
    evaluations: answerEvaluations(input.answers, found),
    notices: missing > 0 ? [missingAnswerMessage(missing)] : [],
  };
}
