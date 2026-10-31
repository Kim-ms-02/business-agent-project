import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DraftProvider from "@/app/DraftProvider";
import PracticeProvider from "@/app/PracticeProvider";
import RehearsalPage from "@/app/rehearsal/page";
import RehearsalProvider, { type CoachState, type KeptRehearsal } from "@/app/RehearsalProvider";
import { DESIGN_VALUE_NOTICE, NOT_ENOUGH_MESSAGE, SPEED_LIMIT_NOTICE, THREE_ITEM_NOTE, type VoiceRecord } from "@/lib/deliveryScore";
import {
  FACE_DESIGN_NOTICE,
  FACE_NOT_ENOUGH_MESSAGE,
  FACE_PRACTICE_NOTICE,
  NO_CAMERA_NOTE,
  type FaceBaseline,
  type FaceFrame,
} from "@/lib/faceScore";
import { finishRehearsal, type RehearsalOutcome } from "@/lib/rehearsalResult";
import { reportCards, reportTop, summaryTiles } from "@/lib/rehearsalReport";
import type { DeliveryFeedback } from "@/lib/types";

// v1.1 step 5 (2): the rehearsal result layout (CLAUDE.md "사이트 구조 – 디자인"): the one thing to
// fix first (or the coach's overall comment) with four summary numbers, then three cards by area,
// then the sentences. Scores and gaze thresholds are not changed; this only places them.

const SCRIPT = "학교 급식이 많이 남아요. 그래서 설문을 해 봤어요. 결과가 아주 놀라웠어요. 다음엔 더 오래 해 볼게요.";

// 12 s of speech with a 5 s pause.
const record: VoiceRecord = {
  startedAt: 0,
  endedAt: 18,
  segments: [
    { start: 0, end: 6 },
    { start: 11, end: 17 },
  ],
  volumes: Array(180).fill(0.5),
};

const BASELINE: FaceBaseline = { yaw: 0, pitch: 0, lookDown: 0, lookAway: 0, smile: 0 };

function frames(start: number, end: number, looking: boolean): FaceFrame[] {
  const result: FaceFrame[] = [];
  for (let i = start * 10; i < end * 10; i++) {
    result.push({ t: i / 10, detected: true, yaw: 0, pitch: 0, lookDown: looking ? 0 : 0.5, lookAway: 0, smile: 0, faceWidth: 0.3 });
  }
  return result;
}

// Looking at the screen for the first half only: 50%.
const FACE = { frames: [...frames(0, 9, true), ...frames(9, 18, false)], baseline: BASELINE };
const OUTCOME: RehearsalOutcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: FACE, dictation: null }, true);
const NO_CAMERA: RehearsalOutcome = { ...OUTCOME, face: null };
const FACE_SHORT: RehearsalOutcome = {
  ...OUTCOME,
  face: { measured: false, measuredRatio: 0.3, undetectedSeconds: 12, message: FACE_NOT_ENOUGH_MESSAGE },
};
const SPEECH_SHORT: RehearsalOutcome = {
  ...OUTCOME,
  delivery: { measured: false, spokenSeconds: 6, message: NOT_ENOUGH_MESSAGE },
};

const FEEDBACK: DeliveryFeedback = {
  summary: "멈춘 곳 하나만 고치면 흐름이 좋아져요.",
  items: [
    { item: "침묵", explain: "5초 멈춘 곳이 한 번 있었어요.", tryThis: "그 문장 첫 마디를 대본에 굵게 표시해 두세요." },
    { item: "시선", explain: "화면을 본 시간이 50%였어요.", tryThis: null },
  ],
  firstFix: {
    quote: "결과가 아주 놀라웠어요.",
    quoteFound: true,
    explain: "이 문장 앞에서 5초 멈췄어요.",
    goal: "다음에는 멈춤 3초 이내",
  },
};
const NO_FIRST_FIX: DeliveryFeedback = { ...FEEDBACK, firstFix: undefined };

describe("summary numbers", () => {
  it("shows the four numbers: delivery score, face score, pauses, and screen time", () => {
    expect(summaryTiles(OUTCOME)).toEqual([
      { label: "말투 점수", value: String((OUTCOME.delivery as { total: number }).total), note: null },
      { label: "얼굴 행동 점수 · 참고용", value: String((OUTCOME.face as { total: number }).total), note: null },
      { label: "3초 넘게 멈춘 곳", value: "1", note: null },
      { label: "화면을 본 시간", value: "50%", note: null },
    ]);
  });

  it("says 카메라 꺼짐 in both face numbers when the camera was off", () => {
    const tiles = summaryTiles(NO_CAMERA);
    expect([tiles[1].value, tiles[3].value]).toEqual(["카메라 꺼짐", "카메라 꺼짐"]);
  });

  it("says 측정이 부족해요 instead of a number when the face was not measured enough", () => {
    const tiles = summaryTiles(FACE_SHORT);
    expect([tiles[1].value, tiles[3].value]).toEqual([FACE_NOT_ENOUGH_MESSAGE, FACE_NOT_ENOUGH_MESSAGE]);
  });

  it("says 측정이 부족해요 for the delivery score and pauses when speech was too short", () => {
    const tiles = summaryTiles(SPEECH_SHORT);
    expect([tiles[0].value, tiles[2].value]).toEqual([NOT_ENOUGH_MESSAGE, NOT_ENOUGH_MESSAGE]);
  });

  it("marks a delivery score made from three items", () => {
    const threeItems = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation: null }, false);
    expect(summaryTiles(threeItems)[0].note).toBe(THREE_ITEM_NOTE);
  });
});

describe("cards by area", () => {
  const cards = reportCards(OUTCOME, FEEDBACK);

  it("has three cards with the items in their own card", () => {
    expect(cards.map((c) => [c.title, c.items.map((i) => i.label)])).toEqual([
      ["전달 · 말 속도", ["말 속도", "제한 시간"]],
      ["전달 · 침묵과 목소리", ["침묵", "목소리 크기"]],
      ["시선과 자세", ["시선", "표정", "고개 움직임", "화면 안 자세"]],
    ]);
  });

  it("says why each area matters, and keeps the practice-only notice on the face card", () => {
    expect(cards.map((c) => c.why)).toEqual([
      "권장 범위는 분당 250~330음절이에요.",
      "3초 넘게 멈추면 듣는 사람이 흐름을 놓쳐요.",
      FACE_PRACTICE_NOTICE,
    ]);
  });

  it("gives each item its score and reason as measured", () => {
    const silence = cards[1].items[0];
    expect(silence.score).toMatch(/^\d \/ 4$/);
    expect(silence.reason).toBe("3초 넘게 멈춘 곳 1번");
    expect(cards[2].items[0].reason).toBe("화면을 본 시간 50%");
  });

  it("puts the coach's explanation and next try under the matching item only", () => {
    expect(cards[1].items[0]).toMatchObject({
      explain: "5초 멈춘 곳이 한 번 있었어요.",
      tryThis: "그 문장 첫 마디를 대본에 굵게 표시해 두세요.",
    });
    expect(cards[2].items[0]).toMatchObject({ explain: "화면을 본 시간이 50%였어요.", tryThis: null });
    expect(cards[0].items[0]).toMatchObject({ explain: null, tryThis: null });
  });

  it("has no coach words before the coach answers", () => {
    for (const card of reportCards(OUTCOME, null)) for (const item of card.items) expect(item.explain).toBeNull();
  });

  it("explains a missing face card instead of scores", () => {
    expect(reportCards(NO_CAMERA, null)[2]).toMatchObject({ items: [], message: NO_CAMERA_NOTE });
    expect(reportCards(FACE_SHORT, null)[2]).toMatchObject({ items: [], message: FACE_NOT_ENOUGH_MESSAGE });
  });

  it("explains missing delivery cards when speech was too short", () => {
    const [speed, silence] = reportCards(SPEECH_SHORT, null);
    expect(speed).toMatchObject({ items: [], message: NOT_ENOUGH_MESSAGE });
    expect(silence).toMatchObject({ items: [], message: NOT_ENOUGH_MESSAGE });
  });
});

describe("what comes first", () => {
  it("is the one thing to fix first, with the overall comment under it", () => {
    expect(reportTop(FEEDBACK)).toEqual({ kind: "firstFix", fix: FEEDBACK.firstFix, summary: FEEDBACK.summary });
  });

  it("is the coach's overall comment when there is no first fix", () => {
    expect(reportTop(NO_FIRST_FIX)).toEqual({ kind: "summary", summary: FEEDBACK.summary });
  });

  it("is nothing until the coach answers", () => {
    expect(reportTop(null)).toEqual({ kind: "none" });
  });
});

describe("result screen", () => {
  function render(outcome: RehearsalOutcome, coach: CoachState): string {
    const kept: KeptRehearsal = { outcome, coach };
    return renderToStaticMarkup(
      createElement(
        DraftProvider,
        { initial: { script: SCRIPT, topic: "", audience: "", limitMinutes: "1" } },
        createElement(PracticeProvider, null, createElement(RehearsalProvider, { initial: kept }, createElement(RehearsalPage))),
      ),
    );
  }

  function headings(html: string): string[] {
    return [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, ""));
  }

  const done: CoachState = { name: "done", feedback: FEEDBACK, notices: [] };

  it("goes: first fix, summary numbers, three cards, sentences", () => {
    const html = render(OUTCOME, done);
    expect(headings(html)).toEqual(["가장 먼저 고칠 한 가지", "전달 · 말 속도", "전달 · 침묵과 목소리", "시선과 자세", "문장별로 보기"]);
    const summary = html.indexOf('aria-label="요약"');
    expect(summary).toBeGreaterThan(html.indexOf("가장 먼저 고칠 한 가지"));
    expect(summary).toBeLessThan(html.indexOf("전달 · 말 속도"));
  });

  it("starts with the overall comment when there is no first fix", () => {
    const html = render(OUTCOME, { name: "done", feedback: NO_FIRST_FIX, notices: [] });
    expect(headings(html)[0]).toBe("코치 총평");
    expect(html).toContain(FEEDBACK.summary);
  });

  it("shows the coach's state at the top while waiting", () => {
    const html = render(OUTCOME, { name: "loading", retrying: false });
    expect(headings(html)[0]).toBe("코치 피드백");
    expect(html).toContain("피드백 준비 중이에요");
  });

  it("puts each coach explanation in its card, with 다음에 해 볼 것", () => {
    const html = render(OUTCOME, done);
    const at = html.indexOf("5초 멈춘 곳이 한 번 있었어요.");
    expect(at).toBeGreaterThan(html.indexOf("전달 · 침묵과 목소리"));
    expect(at).toBeLessThan(html.indexOf("시선과 자세"));
    expect(html).toContain("다음에 해 볼 것");
  });

  it("writes every summary number in words, with 카메라 꺼짐 when the camera was off", () => {
    const html = render(NO_CAMERA, done);
    const summary = html.slice(html.indexOf('aria-label="요약"'));
    expect(summary).toContain("말투 점수");
    expect(summary.match(/카메라 꺼짐/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the notices", () => {
    const html = render(OUTCOME, done);
    for (const notice of [FACE_PRACTICE_NOTICE, FACE_DESIGN_NOTICE, DESIGN_VALUE_NOTICE, SPEED_LIMIT_NOTICE]) {
      expect(html).toContain(notice);
    }
    expect(html).toContain("코치는 점수를 바꾸지 않고, 앱이 잰 숫자만 보고 풀어 줘요.");
  });
});
