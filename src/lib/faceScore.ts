import type { Band } from "./deliveryConfig";
import {
  EXPRESSION_BANDS,
  EXPRESSION_LOWEST_SCORE,
  FACE_SAMPLE_SECONDS,
  FACE_WIDTH_MAX,
  FACE_WIDTH_MIN,
  FRAMING_BANDS,
  FRAMING_LOWEST_SCORE,
  GAZE_BANDS,
  GAZE_LOWEST_SCORE,
  HEAD_BANDS,
  HEAD_LOWEST_SCORE,
  HEAD_MIN_FRAMES,
  HEAD_WINDOW_SECONDS,
  LOOK_MAX_EYE_AWAY,
  LOOK_MAX_EYE_DOWN,
  LOOK_MAX_PITCH,
  LOOK_MAX_YAW,
  LOW_GAZE_RATIO,
  LOW_GAZE_WINDOW_SECONDS,
  MAX_FACE_ITEM_SCORE,
  MIN_MEASURED_RATIO,
  SMILE_MIN,
} from "./faceConfig";

// Pure functions only: turns a rehearsal's face frame record into face behavior scores.
// No browser APIs and no MediaPipe, and no pictures or landmark points, only the values below.

/** One measurement, about every FACE_SAMPLE_SECONDS. Angles are degrees; eye and smile values are 0–1. */
export interface FaceFrame {
  t: number;
  detected: boolean;
  yaw: number;
  pitch: number;
  lookDown: number;
  lookAway: number;
  smile: number;
  /** Face width divided by frame width. */
  faceWidth: number;
}

export interface FaceItemScore {
  score: number;
  value: number;
  reason: string;
}

export interface TimeWindow {
  start: number;
  end: number;
}

export type FaceResult =
  | { measured: false; measuredRatio: number; undetectedSeconds: number; message: string }
  | {
      measured: true;
      measuredRatio: number;
      undetectedSeconds: number;
      items: { gaze: FaceItemScore; expression: FaceItemScore; head: FaceItemScore; framing: FaceItemScore };
      lowGazeWindows: TimeWindow[];
      total: number;
    };

export const FACE_NOT_ENOUGH_MESSAGE = "측정이 부족해요";

// Ratios built from many floats drift (0.7 can come out as 0.6999…), so values are rounded before
// they are compared with the bands.
function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function bandScore(value: number, bands: Band[], lowest: number): number {
  const band = bands.find((b) => b.ranges.some(([min, max]) => value >= min && value <= max));
  return band?.score ?? lowest;
}

function ratio<T>(items: T[], test: (item: T) => boolean): number {
  return items.length === 0 ? 0 : round(items.filter(test).length / items.length);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function isLookingAtScreen(frame: FaceFrame): boolean {
  return (
    Math.abs(frame.yaw) < LOOK_MAX_YAW &&
    Math.abs(frame.pitch) < LOOK_MAX_PITCH &&
    frame.lookDown < LOOK_MAX_EYE_DOWN &&
    frame.lookAway < LOOK_MAX_EYE_AWAY
  );
}

function isWellFramed(frame: FaceFrame): boolean {
  return frame.faceWidth >= FACE_WIDTH_MIN && frame.faceWidth <= FACE_WIDTH_MAX;
}

/** Groups frames into windows of `seconds`, keyed by the window's start time. */
function windows(frames: FaceFrame[], seconds: number): Map<number, FaceFrame[]> {
  const groups = new Map<number, FaceFrame[]>();
  for (const frame of frames) {
    const start = Math.floor(round(frame.t / seconds, 6)) * seconds;
    const group = groups.get(start);
    if (group) group.push(frame);
    else groups.set(start, [frame]);
  }
  return groups;
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

/** Average spread of the left-right head angle within each second. */
export function headMovement(frames: FaceFrame[]): number {
  const spreads = [...windows(frames, HEAD_WINDOW_SECONDS).values()]
    .filter((group) => group.length >= HEAD_MIN_FRAMES)
    .map((group) => standardDeviation(group.map((f) => f.yaw)));
  return spreads.length === 0 ? 0 : round(spreads.reduce((sum, s) => sum + s, 0) / spreads.length);
}

/** 10-second stretches where the speaker looked at the screen in less than half of the measured frames. */
export function lowGazeWindows(frames: FaceFrame[], endsAt: number): TimeWindow[] {
  return [...windows(frames, LOW_GAZE_WINDOW_SECONDS).entries()]
    .filter(([, group]) => ratio(group, isLookingAtScreen) < LOW_GAZE_RATIO)
    .map(([start]) => ({ start: round(start), end: round(Math.min(start + LOW_GAZE_WINDOW_SECONDS, endsAt)) }))
    .sort((a, b) => a.start - b.start);
}

export function scoreFace(frames: FaceFrame[]): FaceResult {
  const found = frames.filter((f) => f.detected);
  const measuredRatio = ratio(frames, (f) => f.detected);
  const undetectedSeconds = round((frames.length - found.length) * FACE_SAMPLE_SECONDS);
  if (found.length === 0 || measuredRatio < MIN_MEASURED_RATIO) {
    return { measured: false, measuredRatio, undetectedSeconds, message: FACE_NOT_ENOUGH_MESSAGE };
  }

  const gazeRatio = ratio(found, isLookingAtScreen);
  const gaze: FaceItemScore = {
    score: bandScore(gazeRatio, GAZE_BANDS, GAZE_LOWEST_SCORE),
    value: gazeRatio,
    reason: `화면을 본 시간 ${percent(gazeRatio)}`,
  };

  const smileRatio = ratio(found, (f) => f.smile > SMILE_MIN);
  const expression: FaceItemScore = {
    score: bandScore(smileRatio, EXPRESSION_BANDS, EXPRESSION_LOWEST_SCORE),
    value: smileRatio,
    reason: `웃는 표정 ${percent(smileRatio)}`,
  };

  const spread = headMovement(found);
  const head: FaceItemScore = {
    score: bandScore(spread, HEAD_BANDS, HEAD_LOWEST_SCORE),
    value: spread,
    reason: `1초마다 고개 좌우 움직임 평균 ${round(spread, 1)}도`,
  };

  const framedRatio = ratio(found, isWellFramed);
  const framing: FaceItemScore = {
    score: bandScore(framedRatio, FRAMING_BANDS, FRAMING_LOWEST_SCORE),
    value: framedRatio,
    reason: `얼굴이 화면 안 알맞은 크기였던 시간 ${percent(framedRatio)}`,
  };

  const items = { gaze, expression, head, framing };
  const sum = Object.values(items).reduce((total, item) => total + item.score, 0);
  const endsAt = frames[frames.length - 1].t + FACE_SAMPLE_SECONDS;

  return {
    measured: true,
    measuredRatio,
    undetectedSeconds,
    items,
    lowGazeWindows: lowGazeWindows(found, endsAt),
    total: Math.round((sum / (Object.keys(items).length * MAX_FACE_ITEM_SCORE)) * 100),
  };
}
