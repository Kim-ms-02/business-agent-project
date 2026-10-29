import {
  LOWEST_SCORE,
  MAX_ITEM_SCORE,
  MIN_SPOKEN_SECONDS,
  SILENCE_BANDS,
  SILENCE_SECONDS,
  SPEED_BANDS,
  TIME_BANDS,
  VOLUME_BANDS,
  VOLUME_SAMPLE_SECONDS,
  type Band,
} from "./deliveryConfig";

// Pure functions only: turns a rehearsal's voice record into delivery scores.
// No browser APIs and no recorded sound, only speech times and average volumes.

export interface SpeechSegment {
  start: number;
  end: number;
}

/** What the voice tracker hands over. Times are seconds from the start of the rehearsal. */
export interface VoiceRecord {
  startedAt: number;
  endedAt: number;
  segments: SpeechSegment[];
  /** Average volume every VOLUME_SAMPLE_SECONDS, from startedAt. */
  volumes: number[];
}

export interface DeliveryInput {
  record: VoiceRecord;
  /** Syllables in the script that was read, counted with countSyllables. */
  scriptSyllables: number;
  limitSeconds: number;
  /** The speaker's answer to "대본을 끝까지 읽었나요?". Speed is only meaningful for the whole script. */
  readToEnd: boolean;
}

export interface ItemScore {
  score: number | null;
  value: number | null;
  reason: string;
}

export type DeliveryResult =
  | { measured: false; spokenSeconds: number; message: string }
  | {
      measured: true;
      spokenSeconds: number;
      speakingSpanSeconds: number;
      items: { speed: ItemScore; silence: ItemScore; volume: ItemScore; time: ItemScore };
      silences: SpeechSegment[];
      total: number;
      totalNote: string | null;
    };

export const NOT_ENOUGH_MESSAGE = "측정이 부족해요";
export const SPEED_NEEDS_WHOLE_SCRIPT = "끝까지 읽어야 말 속도를 잴 수 있어요";
export const THREE_ITEM_NOTE = "3항목 기준";
export const DESIGN_VALUE_NOTICE =
  "점수 기준선은 과학적으로 정해진 값이 아니라 이 앱이 정한 설계 값이에요. 참고로만 봐 주세요.";
export const SPEED_LIMIT_NOTICE =
  "말 속도는 대본을 그대로 읽었다고 보고 계산해요. 대본에서 벗어나 즉흥으로 말하면 말 속도가 틀릴 수 있어요.";

// Sums of many small floats drift (0.8 can come out as 0.7999…), so values are rounded before
// they are compared with the bands.
function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function bandScore(value: number, bands: Band[]): number {
  const band = bands.find((b) => b.ranges.some(([min, max]) => value >= min && value <= max));
  return band?.score ?? LOWEST_SCORE;
}

export function formatTime(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}분 ${whole % 60}초`;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Pauses longer than SILENCE_SECONDS between two stretches of speech. Quiet time before and after is ignored. */
export function findSilences(segments: SpeechSegment[]): SpeechSegment[] {
  const silences: SpeechSegment[] = [];
  for (let i = 1; i < segments.length; i++) {
    const start = segments[i - 1].end;
    const end = segments[i].start;
    if (round(end - start) > SILENCE_SECONDS) silences.push({ start, end });
  }
  return silences;
}

/** Last quarter of speaking volume divided by the first quarter, using only samples taken while speaking. */
export function volumeRatio(record: VoiceRecord): number {
  const speaking = record.volumes.filter((_, i) => {
    const t = record.startedAt + i * VOLUME_SAMPLE_SECONDS;
    return record.segments.some((s) => t >= s.start && t < s.end);
  });
  const quarter = Math.max(1, Math.floor(speaking.length / 4));
  const first = mean(speaking.slice(0, quarter));
  const last = mean(speaking.slice(-quarter));
  return first > 0 ? round(last / first) : 1;
}

export function scoreDelivery(input: DeliveryInput): DeliveryResult {
  const segments = [...input.record.segments].sort((a, b) => a.start - b.start);
  const spokenSeconds = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (round(spokenSeconds) < MIN_SPOKEN_SECONDS) {
    return { measured: false, spokenSeconds, message: NOT_ENOUGH_MESSAGE };
  }

  const record = { ...input.record, segments };
  const speakingSpanSeconds = segments[segments.length - 1].end - segments[0].start;

  let speed: ItemScore;
  if (input.readToEnd) {
    const perMinute = round((input.scriptSyllables * 60) / spokenSeconds, 2);
    speed = {
      score: bandScore(perMinute, SPEED_BANDS),
      value: perMinute,
      reason: `분당 ${Math.round(perMinute)}음절 (대본 ${Math.round(input.scriptSyllables)}음절, 말한 시간 ${formatTime(spokenSeconds)})`,
    };
  } else {
    speed = { score: null, value: null, reason: SPEED_NEEDS_WHOLE_SCRIPT };
  }

  const silences = findSilences(segments);
  const silence: ItemScore = {
    score: bandScore(silences.length, SILENCE_BANDS),
    value: silences.length,
    reason: `${SILENCE_SECONDS}초 넘게 멈춘 곳 ${silences.length}번`,
  };

  const ratio = volumeRatio(record);
  const volume: ItemScore = {
    score: bandScore(ratio, VOLUME_BANDS),
    value: ratio,
    reason: `끝부분 목소리 크기가 처음의 ${Math.round(ratio * 100)}%`,
  };

  const timeRatio = round(speakingSpanSeconds / input.limitSeconds);
  const time: ItemScore = {
    score: bandScore(timeRatio, TIME_BANDS),
    value: timeRatio,
    reason: `걸린 시간 ${formatTime(speakingSpanSeconds)} / 제한 시간 ${formatTime(input.limitSeconds)}`,
  };

  const scores = [speed, silence, volume, time].map((item) => item.score).filter((s): s is number => s !== null);
  const total = Math.round((scores.reduce((sum, s) => sum + s, 0) / (scores.length * MAX_ITEM_SCORE)) * 100);

  return {
    measured: true,
    spokenSeconds,
    speakingSpanSeconds,
    items: { speed, silence, volume, time },
    silences,
    total,
    totalNote: scores.length < 4 ? THREE_ITEM_NOTE : null,
  };
}

// ---------- Result screen text ----------

export interface DeliveryItemRow {
  label: string;
  score: string;
  reason: string;
}

export function deliveryItems(result: Extract<DeliveryResult, { measured: true }>): DeliveryItemRow[] {
  const { speed, silence, volume, time } = result.items;
  const rows: [string, ItemScore][] = [
    ["말 속도", speed],
    ["침묵", silence],
    ["목소리 크기", volume],
    ["제한 시간", time],
  ];
  return rows.map(([label, item]) => ({
    label,
    score: item.score === null ? "점수 없음" : `${item.score} / ${MAX_ITEM_SCORE}`,
    reason: item.reason,
  }));
}

export function silenceLabel(silence: SpeechSegment): string {
  const length = Math.round((silence.end - silence.start) * 10) / 10;
  return `${formatTime(silence.start)}부터 ${length}초 동안`;
}
