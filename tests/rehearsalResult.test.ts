import { describe, expect, it } from "vitest";
import type { VoiceRecord } from "@/lib/deliveryScore";
import type { FaceBaseline, FaceFrame } from "@/lib/faceScore";
import {
  basisLabel,
  dictatedSyllables,
  DICTATION_OPTION_LABEL,
  dictationOptionShown,
  FILLER_ACCURACY_NOTE,
  finishRehearsal,
  needsReadToEnd,
  NO_DICTATION_PACE_NOTE,
  NO_DICTATION_SENTENCES_NOTE,
  sectionForCoach,
} from "@/lib/rehearsalResult";

// v0.4 steps 4–5: what the rehearsal result screen computes once "끝" is pressed.

const LINES = ["학교 급식이 많이 남아요.", "그래서 설문을 해 봤어요.", "결과가 아주 놀라웠어요.", "다음엔 더 오래 해 볼게요."];
const SCRIPT = LINES.join(" ");

// 12 s of speech with a 5 s pause before the third sentence.
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
    result.push({
      t: i / 10,
      detected: true,
      yaw: 0,
      pitch: 0,
      lookDown: looking ? 0 : 0.5,
      lookAway: 0,
      smile: 0,
      faceWidth: 0.3,
    });
  }
  return result;
}

const UA = {
  chrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  safari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0",
  whale:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Whale/3.28.0.0 Safari/537.36",
  opera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0",
};

describe("dictationOptionShown", () => {
  it("shows the dictation option in Chrome and Edge when dictation works there", () => {
    expect(dictationOptionShown(UA.chrome, true)).toBe(true);
    expect(dictationOptionShown(UA.edge, true)).toBe(true);
  });

  it("hides it in other browsers, even ones that have some dictation", () => {
    expect(dictationOptionShown(UA.safari, true)).toBe(false);
    expect(dictationOptionShown(UA.firefox, false)).toBe(false);
    expect(dictationOptionShown(UA.whale, true)).toBe(false);
    expect(dictationOptionShown(UA.opera, true)).toBe(false);
  });

  it("hides it in Chrome when dictation is not available", () => {
    expect(dictationOptionShown(UA.chrome, false)).toBe(false);
  });

  it("says the voice goes to Google's server", () => {
    expect(DICTATION_OPTION_LABEL).toBe("받아쓰기 켜기 (더 정확해요, 목소리가 구글 서버로 전송돼요)");
  });
});

describe("dictatedSyllables", () => {
  it("counts the syllables actually said, reading numbers out", () => {
    // 학생 2 + 백이십명에게 6 + 물었어요 4
    expect(dictatedSyllables([{ text: "학생 120명에게 물었어요", at: 3 }])).toBe(12);
    expect(dictatedSyllables(LINES.map((text, i) => ({ text, at: i })))).toBe(40);
  });
});

describe("needsReadToEnd", () => {
  it("asks whether the script was read to the end only without usable dictation", () => {
    expect(needsReadToEnd(null)).toBe(true);
    expect(needsReadToEnd({ chunks: [{ text: LINES[0], at: 6 }], activity: [6] })).toBe(false);
    expect(needsReadToEnd({ chunks: [], activity: [] })).toBe(true);
  });
});

describe("finishRehearsal with dictation off", () => {
  it("scores speed from the script and places sentences approximately", () => {
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation: null }, true);
    expect(outcome.dictationUsed).toBe(false);
    expect(outcome.delivery.measured && outcome.delivery.items.speed.reason).toContain("대본 40음절");
    expect(outcome.section.approximate).toBe(true);
    expect(outcome.section.marks?.[2]).toEqual([{ kind: "pause", seconds: [5] }]);
  });

  it("gives no sentence marks when the script was not read to the end", () => {
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation: null }, false);
    expect(outcome.section.marks).toBeNull();
  });

  it("marks low gaze per sentence with the camera on", () => {
    const face = { frames: [...frames(0, 6, true), ...frames(6, 11, true), ...frames(11, 17, false)], baseline: BASELINE };
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face, dictation: null }, true);
    expect(outcome.face?.measured).toBe(true);
    expect(outcome.section.marks?.[3]).toEqual([{ kind: "lowGaze" }]);
  });
});

describe("finishRehearsal with dictation on", () => {
  const dictation = {
    chunks: [
      { text: `음 ${LINES[0]}`, at: 6 },
      { text: LINES[2], at: 14 },
      { text: LINES[3], at: 17 },
    ],
    activity: [3, 6, 12, 14, 16, 17],
  };
  const dictatedRecord: VoiceRecord = {
    ...record,
    segments: [
      { start: 0, end: 6 },
      { start: 11, end: 14 },
      { start: 14, end: 17 },
    ],
  };

  it("scores speed from the dictated syllables without asking about reading to the end", () => {
    // 음 1 + 30 script syllables = 31 in 12 s = 155 a minute.
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record: dictatedRecord, face: null, dictation }, null);
    expect(outcome.dictationUsed).toBe(true);
    expect(outcome.delivery.measured && outcome.delivery.items.speed).toMatchObject({
      value: 155,
      reason: "분당 155음절 (받아쓴 글 31음절, 말한 시간 0분 12초)",
    });
  });

  it("marks sentences from what was heard, with quarter paces and fillers", () => {
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record: dictatedRecord, face: null, dictation }, null);
    expect(outcome.section.approximate).toBe(false);
    expect(outcome.section.marks?.[1]).toEqual([{ kind: "skipped" }]);
    expect(outcome.section.quarters?.map((q) => q.pace)).toEqual([100, null, 200, 200]);
    expect(outcome.section.fillers?.words["음"]).toBe(1);
  });

  it("falls back to the estimate when dictation sent nothing", () => {
    const outcome = finishRehearsal(
      { script: SCRIPT, limitSeconds: 60, record, face: null, dictation: { chunks: [], activity: [] } },
      true,
    );
    expect(outcome.dictationUsed).toBe(false);
    expect(outcome.section.approximate).toBe(true);
  });
});

describe("sectionForCoach", () => {
  it("sends only the marked sentences and the quarter paces, with the script", () => {
    const dictation = {
      chunks: [
        { text: LINES[0], at: 6 },
        { text: LINES[2], at: 14 },
        { text: LINES[3], at: 17 },
      ],
      activity: [6, 14, 17],
    };
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation }, null);
    const summary = sectionForCoach(SCRIPT, outcome.section);
    expect(summary?.script).toBe(SCRIPT);
    expect(summary?.approximate).toBe(false);
    expect(summary?.marks.map((m) => m.sentence)).toEqual([1, 2]);
    expect(summary?.quarters).toHaveLength(4);
    expect(JSON.stringify(summary)).not.toContain("activity");
  });

  it("sends nothing when there are no sentence marks to show", () => {
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation: null }, false);
    expect(sectionForCoach(SCRIPT, outcome.section)).toBeUndefined();
  });
});

describe("result screen words", () => {
  it("says how the sentence places were found", () => {
    expect(basisLabel(true)).toBe("대략");
    expect(basisLabel(false)).toBe("받아쓰기 기준");
  });

  it("has the two notes for dictation off, and the low accuracy note for fillers", () => {
    expect(NO_DICTATION_PACE_NOTE).toBe("받아쓰기를 켜면 구간별 말 속도와 빠른 문장을 볼 수 있어요");
    expect(NO_DICTATION_SENTENCES_NOTE).toBe("받아쓰기를 켜면 끝까지 읽지 않아도 문장별로 볼 수 있어요");
    expect(FILLER_ACCURACY_NOTE).toBe("정확도 낮음");
  });
});
