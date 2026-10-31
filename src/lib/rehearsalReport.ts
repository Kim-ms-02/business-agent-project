import { SILENCE_SECONDS, SPEED_BANDS } from "./deliveryConfig";
import { deliveryItems } from "./deliveryScore";
import { FACE_PRACTICE_NOTICE, NO_CAMERA_NOTE, faceItems } from "./faceScore";
import type { RehearsalOutcome } from "./rehearsalResult";
import type { QuarterPace } from "./sentenceMarks";
import type { DeliveryFeedback, FirstFix, RehearsalItem } from "./types";

// Where each part of a rehearsal result goes on the result screen (v1.1). Scores and reasons come
// from the scoring files as they are; this file only groups and orders them.

export const CAMERA_OFF_LABEL = "카메라 꺼짐";

/** One of the four summary numbers at the top of the result. */
export interface SummaryTile {
  label: string;
  /** The number as shown, or why there is none. */
  value: string;
  note: string | null;
}

export function summaryTiles(outcome: RehearsalOutcome): SummaryTile[] {
  const { delivery, face } = outcome;
  const faceValue = (measured: (f: Extract<typeof face, { measured: true }>) => string): string =>
    face === null ? CAMERA_OFF_LABEL : face.measured ? measured(face) : face.message;
  return [
    {
      label: "말투 점수",
      value: delivery.measured ? String(delivery.total) : delivery.message,
      note: delivery.measured ? delivery.totalNote : null,
    },
    { label: "얼굴 행동 점수 · 참고용", value: faceValue((f) => String(f.total)), note: null },
    {
      label: `${SILENCE_SECONDS}초 넘게 멈춘 곳`,
      value: delivery.measured ? String(delivery.silences.length) : delivery.message,
      note: null,
    },
    { label: "화면을 본 시간", value: faceValue((f) => `${Math.round(f.items.gaze.value * 100)}%`), note: null },
  ];
}

/** One scored item in a card, with the coach's words for it once they arrive. */
export interface ReportItem {
  label: RehearsalItem;
  score: string;
  reason: string;
  explain: string | null;
  tryThis: string | null;
  unverified: boolean;
}

export interface ReportCard {
  title: string;
  why: string;
  items: ReportItem[];
  /** Why the card has no items (speech too short, camera off, face not measured enough). */
  message: string | null;
}

const [SPEED_LOW, SPEED_HIGH] = SPEED_BANDS[0].ranges[0];

const CARDS: { title: string; why: string; items: RehearsalItem[] }[] = [
  { title: "전달 · 말 속도", why: `권장 범위는 분당 ${SPEED_LOW}~${SPEED_HIGH}음절이에요.`, items: ["말 속도", "제한 시간"] },
  {
    title: "전달 · 침묵과 목소리",
    why: `${SILENCE_SECONDS}초 넘게 멈추면 듣는 사람이 흐름을 놓쳐요.`,
    items: ["침묵", "목소리 크기"],
  },
  { title: "시선과 자세", why: FACE_PRACTICE_NOTICE, items: ["시선", "표정", "고개 움직임", "화면 안 자세"] },
];

export function reportCards(outcome: RehearsalOutcome, feedback: DeliveryFeedback | null): ReportCard[] {
  const { delivery, face } = outcome;
  const rows = [...(delivery.measured ? deliveryItems(delivery) : []), ...(face?.measured ? faceItems(face) : [])];
  const missing = (item: RehearsalItem): string | null => {
    const isFace = CARDS[2].items.includes(item);
    if (!isFace) return delivery.measured ? null : delivery.message;
    return face === null ? NO_CAMERA_NOTE : face.measured ? null : face.message;
  };

  return CARDS.map((card) => {
    const message = missing(card.items[0]);
    const items =
      message !== null
        ? []
        : card.items.map((label): ReportItem => {
            const row = rows.find((r) => r.label === label)!;
            const coach = feedback?.items.find((i) => i.item === label);
            return {
              label,
              score: row.score,
              reason: row.reason,
              explain: coach?.explain ?? null,
              tryThis: coach?.tryThis ?? null,
              unverified: coach?.unverified ?? false,
            };
          });
    return { title: card.title, why: card.why, items, message };
  });
}

/** What the result starts with: the one thing to fix first, else the coach's overall comment. */
export type ReportTop =
  | { kind: "firstFix"; fix: FirstFix; summary: string | null }
  | { kind: "summary"; summary: string }
  | { kind: "none" };

export function reportTop(feedback: DeliveryFeedback | null): ReportTop {
  if (!feedback) return { kind: "none" };
  const summary = feedback.summary || null;
  if (feedback.firstFix) return { kind: "firstFix", fix: feedback.firstFix, summary };
  return summary ? { kind: "summary", summary } : { kind: "none" };
}

/** One quarter of the script on the speed chart. */
export interface PacePoint {
  x: number;
  /** Null when the quarter was not spoken: no point is drawn. */
  y: number | null;
  pace: number | null;
  outside: "빠름" | "느림" | null;
  label: string;
  sentences: string;
}

export interface PaceChart {
  width: number;
  height: number;
  points: PacePoint[];
  /** The 4-point speed range; edges count as inside, like the score bands. */
  band: { low: number; high: number; top: number; bottom: number };
  y: (pace: number) => number;
  description: string;
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 96;
const CHART_PADDING = 8;
// Room above and below the band, so a quarter just outside it still looks outside.
const CHART_MARGIN = 60;

/** The quarter speeds (dictation on only) as chart points, with the recommended band. */
export function paceChart(quarters: QuarterPace[]): PaceChart {
  const paces = quarters.map((q) => q.pace).filter((pace): pace is number => pace !== null);
  // Every quarter stays on the chart, however fast or slow.
  const min = Math.min(SPEED_LOW - CHART_MARGIN, ...paces);
  const max = Math.max(SPEED_HIGH + CHART_MARGIN, ...paces);
  const y = (pace: number) => CHART_PADDING + ((max - pace) / (max - min)) * (CHART_HEIGHT - 2 * CHART_PADDING);

  const points = quarters.map((quarter, i): PacePoint => {
    const { pace } = quarter;
    const outside = pace === null ? null : pace > SPEED_HIGH ? "빠름" : pace < SPEED_LOW ? "느림" : null;
    const name = `${i + 1}구간`;
    return {
      x: ((i + 0.5) * CHART_WIDTH) / quarters.length,
      y: pace === null ? null : y(pace),
      pace,
      outside,
      label: pace === null ? `${name} 말하지 않음` : `${name} ${pace}${outside ? ` · ${outside}` : ""}`,
      sentences:
        quarter.first === quarter.last ? `${quarter.first + 1}번 문장` : `${quarter.first + 1}~${quarter.last + 1}번 문장`,
    };
  });

  const spoken = points.map((p, i) =>
    p.pace === null ? `${i + 1}구간 말하지 않음` : `${i + 1}구간 ${p.pace}${p.outside ? ` ${p.outside}` : ""}`,
  );
  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    points,
    band: { low: SPEED_LOW, high: SPEED_HIGH, top: y(SPEED_HIGH), bottom: y(SPEED_LOW) },
    y,
    description: `구간별 분당 음절: ${spoken.join(", ")}. 권장 범위 ${SPEED_LOW}~${SPEED_HIGH}`,
  };
}
