import { describe, expect, it } from "vitest";
import type { FaceBaseline, FaceFrame } from "@/lib/faceScore";
import type { ScriptSentence, SentenceReading, TimeWindow } from "@/lib/scriptPosition";
import { scriptSentences } from "@/lib/scriptPosition";
import { countFillers, markSentences, quarterPaces, sectionFeedback } from "@/lib/sentenceMarks";

// Sentences with just the syllable counts the arithmetic needs; the text is never read here.
function table(...syllables: number[]): ScriptSentence[] {
  let from = 0;
  return syllables.map((n, i) => {
    const s = { text: `문장 ${i + 1}`, syllables: n, from, to: from + n };
    from += n;
    return s;
  });
}

const span = (start: number, end: number): TimeWindow[] => [{ start, end }];

const BASELINE: FaceBaseline = { yaw: 0, pitch: 0, lookDown: 0, lookAway: 0, smile: 0 };

// Ten frames a second from start (inclusive) to end (exclusive), looking at the screen or down at paper.
function frames(start: number, end: number, looking: boolean, detected = true): FaceFrame[] {
  const result: FaceFrame[] = [];
  for (let i = Math.round(start * 10); i < Math.round(end * 10); i++) {
    result.push({
      t: i / 10,
      detected,
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

const base = { readings: null, overallPace: null, face: null };

describe("markSentences: pauses", () => {
  it("marks a pause before the sentence where speech started again", () => {
    const marks = markSentences({
      ...base,
      sentences: table(10, 10),
      segments: [
        { start: 0, end: 5 },
        { start: 10, end: 15 },
      ],
      timeline: [span(0, 5), span(10, 15)],
    });
    expect(marks[0]).toEqual([]);
    expect(marks[1]).toEqual([{ kind: "pause", seconds: [5] }]);
  });

  it("marks a pause in the middle of a sentence on that sentence", () => {
    const marks = markSentences({
      ...base,
      sentences: table(10, 10),
      segments: [
        { start: 0, end: 3 },
        { start: 8, end: 15 },
      ],
      timeline: [
        [
          { start: 0, end: 3 },
          { start: 8, end: 10 },
        ],
        span(10, 15),
      ],
    });
    expect(marks[0]).toEqual([{ kind: "pause", seconds: [5] }]);
    expect(marks[1]).toEqual([]);
  });

  it("does not mark a pause of exactly three seconds", () => {
    const marks = markSentences({
      ...base,
      sentences: table(10, 10),
      segments: [
        { start: 0, end: 5 },
        { start: 8, end: 13 },
      ],
      timeline: [span(0, 5), span(8, 13)],
    });
    expect(marks.flat()).toEqual([]);
  });

  it("puts two pauses in one sentence into one mark, in the order they happened", () => {
    const marks = markSentences({
      ...base,
      sentences: table(30, 10),
      segments: [
        { start: 0, end: 2 },
        { start: 6, end: 8 },
        { start: 13, end: 15 },
        { start: 15, end: 20 },
      ],
      timeline: [
        [
          { start: 0, end: 2 },
          { start: 6, end: 8 },
          { start: 13, end: 15 },
        ],
        span(15, 20),
      ],
    });
    expect(marks[0]).toEqual([{ kind: "pause", seconds: [4, 5] }]);
    expect(marks[1]).toEqual([]);
  });

  it("does not mark a pause followed by improvised speech, since no sentence was being read", () => {
    const marks = markSentences({
      ...base,
      sentences: table(10, 10),
      segments: [
        { start: 0, end: 5 },
        { start: 10, end: 13 },
        { start: 13.5, end: 20 },
      ],
      timeline: [span(0, 5), span(13.5, 20)],
    });
    expect(marks.flat()).toEqual([]);
  });
});

describe("markSentences: low gaze", () => {
  const sentences = table(10, 10);
  const segments = [{ start: 0, end: 10 }];

  it("marks a sentence read while looking down", () => {
    const marks = markSentences({
      ...base,
      sentences,
      segments,
      timeline: [span(0, 5), span(5, 10)],
      face: { frames: [...frames(0, 5, true), ...frames(5, 10, false)], baseline: BASELINE },
    });
    expect(marks[0]).toEqual([]);
    expect(marks[1]).toEqual([{ kind: "lowGaze" }]);
  });

  it("needs at least ten frames with a face (one second) to judge a sentence", () => {
    const judge = (seconds: number) =>
      markSentences({
        ...base,
        sentences,
        segments,
        timeline: [span(0, 5), span(5, 5 + seconds)],
        face: { frames: [...frames(0, 5, true), ...frames(5, 5 + seconds, false)], baseline: BASELINE },
      })[1];
    expect(judge(0.9)).toEqual([]);
    expect(judge(1)).toEqual([{ kind: "lowGaze" }]);
  });

  it("does not count frames without a face", () => {
    const marks = markSentences({
      ...base,
      sentences,
      segments,
      timeline: [span(0, 5), span(5, 10)],
      face: { frames: [...frames(5, 9.5, false, false), ...frames(9.5, 10, false)], baseline: BASELINE },
    });
    expect(marks[1]).toEqual([]);
  });

  it("does not mark a sentence looked at exactly half the time", () => {
    const marks = markSentences({
      ...base,
      sentences,
      segments,
      timeline: [span(0, 5), span(5, 10)],
      face: { frames: [...frames(5, 7.5, true), ...frames(7.5, 10, false)], baseline: BASELINE },
    });
    expect(marks[1]).toEqual([]);
  });

  it("gives no gaze marks without the camera", () => {
    const marks = markSentences({ ...base, sentences, segments, timeline: [span(0, 5), span(5, 10)] });
    expect(marks.flat()).toEqual([]);
  });
});

describe("markSentences: fast sentences (dictation on)", () => {
  const segments = [{ start: 0, end: 30 }];
  const read = (n: number): SentenceReading[] => Array(n).fill("read");

  it("marks a sentence at least 1.2 times the rehearsal pace and over 330 syllables a minute", () => {
    // 25 syllables in 5 s = 300; 40 in 6 s = 400. Rehearsal pace 300, so 1.2 times is 360.
    const marks = markSentences({
      ...base,
      sentences: table(25, 40),
      segments,
      timeline: [span(0, 5), span(5, 11)],
      readings: read(2),
      overallPace: 300,
    });
    expect(marks[0]).toEqual([]);
    expect(marks[1]).toEqual([{ kind: "fast", pace: 400 }]);
  });

  it("counts exactly 1.2 times as fast", () => {
    // 30 syllables in 5 s = 360 = 1.2 × 300.
    const marks = markSentences({
      ...base,
      sentences: table(30),
      segments,
      timeline: [span(0, 5)],
      readings: read(1),
      overallPace: 300,
    });
    expect(marks[0]).toEqual([{ kind: "fast", pace: 360 }]);
  });

  it("does not count exactly 330 syllables a minute as fast", () => {
    // 33 syllables in 6 s = 330, well over 1.2 × 250 but not over 330.
    const marks = markSentences({
      ...base,
      sentences: table(33),
      segments,
      timeline: [span(0, 6)],
      readings: read(1),
      overallPace: 250,
    });
    expect(marks[0]).toEqual([]);
  });

  it("judges a sentence spoken for exactly five seconds, but not a shorter one, since dictation times can be 1–2 s off", () => {
    // 50 syllables in 5 s = 600; 49 in 4.9 s would be 600 too, but is too short to trust.
    const marks = markSentences({
      ...base,
      sentences: table(50, 49),
      segments,
      timeline: [span(0, 5), span(5, 9.9)],
      readings: read(2),
      overallPace: 300,
    });
    expect(marks[0]).toEqual([{ kind: "fast", pace: 600 }]);
    expect(marks[1]).toEqual([]);
  });

  it("gives no fast marks with dictation off", () => {
    const marks = markSentences({ ...base, sentences: table(50), segments, timeline: [span(0, 5)] });
    expect(marks[0]).toEqual([]);
  });
});

describe("markSentences: skipped and unread sentences (dictation on)", () => {
  const sentences = table(10, 10, 10, 10, 10, 10);
  const timeline = [span(0, 2), [], span(2, 4), [], [], []];
  const segments = [{ start: 0, end: 4 }];

  it("tells a sentence skipped in the middle from the unread end", () => {
    const marks = markSentences({
      ...base,
      sentences,
      segments,
      timeline,
      readings: ["read", "missed", "read", "missed", "missed", "missed"],
      overallPace: 300,
    });
    expect(marks.map((m) => m.map((mark) => mark.kind))).toEqual([[], ["skipped"], [], ["unread"], ["unread"], ["unread"]]);
  });

  it("marks nothing for sentences dictation did not hear, or stage directions", () => {
    const marks = markSentences({
      ...base,
      sentences,
      segments,
      timeline,
      readings: ["read", "unknown", "read", "blank", "read", "unknown"],
      overallPace: 300,
    });
    expect(marks.flat()).toEqual([]);
  });

  it("marks every sentence unread when none was read", () => {
    const marks = markSentences({
      ...base,
      sentences: table(10, 10),
      segments: [],
      timeline: [[], []],
      readings: ["missed", "missed"],
      overallPace: 300,
    });
    expect(marks).toEqual([[{ kind: "unread" }], [{ kind: "unread" }]]);
  });

  it("gives no skipped or unread marks with dictation off", () => {
    const marks = markSentences({ ...base, sentences, segments, timeline });
    expect(marks.flat()).toEqual([]);
  });
});

describe("quarterPaces", () => {
  it("splits the script into four by syllables, at sentence edges", () => {
    // Running totals 10, 20, 45, 50, 60, 80; quarter points 20, 40, 60.
    const sentences = table(10, 10, 25, 5, 10, 20);
    const quarters = quarterPaces(sentences, Array(6).fill("read"), sentences.map(() => []));
    expect(quarters.map((q) => [q.first, q.last])).toEqual([
      [0, 1],
      [2, 2],
      [3, 4],
      [5, 5],
    ]);
  });

  it("gives each quarter its syllables over its speaking time", () => {
    const sentences = table(10, 10, 10, 10);
    const quarters = quarterPaces(sentences, Array(4).fill("read"), [span(0, 2), span(2, 4), span(4, 7), span(7, 8)]);
    expect(quarters.map((q) => q.pace)).toEqual([300, 300, 200, 600]);
  });

  it("leaves skipped sentences out of a quarter's pace", () => {
    const sentences = table(10, 10, 10, 10, 10, 10, 10, 10);
    const readings: SentenceReading[] = ["read", "missed", "read", "read", "read", "read", "read", "read"];
    const timeline = [span(0, 2), [], span(2, 4), span(4, 6), span(6, 8), span(8, 10), span(10, 12), span(12, 14)];
    const first = quarterPaces(sentences, readings, timeline)[0];
    expect(first).toMatchObject({ first: 0, last: 1, syllables: 10, spokenSeconds: 2, pace: 300 });
  });

  it("gives no pace to a quarter that was not spoken", () => {
    const sentences = table(10, 10, 10, 10);
    const quarters = quarterPaces(sentences, ["read", "read", "read", "missed"], [span(0, 2), span(2, 4), span(4, 6), []]);
    expect(quarters[3].pace).toBeNull();
  });

  it("makes fewer quarters when the script has fewer than four sentences", () => {
    const sentences = table(10, 10);
    const quarters = quarterPaces(sentences, ["read", "read"], [span(0, 2), span(2, 4)]);
    expect(quarters.map((q) => [q.first, q.last])).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});

describe("countFillers", () => {
  it("counts only the five filler words, said as a word on their own", () => {
    const count = countFillers(["음 그 결과 그런데 어", "약간 그니까 음, 어떻게"]);
    expect(count.words).toEqual({ 음: 2, 어: 1, 그: 1, 그니까: 1, 약간: 1 });
    expect(count.total).toBe(6);
  });

  it("counts nothing in a transcript without fillers", () => {
    expect(countFillers(["저희는 급식 문제를 골랐어요"])).toEqual({
      total: 0,
      words: { 음: 0, 어: 0, 그: 0, 그니까: 0, 약간: 0 },
    });
  });
});

describe("sectionFeedback", () => {
  const LINES = ["학교 급식이 많이 남아요.", "그래서 설문을 해 봤어요.", "결과가 아주 놀라웠어요.", "다음엔 더 오래 해 볼게요."];
  const sentences = scriptSentences(LINES.join(" "));
  // 40 syllables over 12 s of speech with a 5 s pause before sentence 3.
  const segments = [
    { start: 0, end: 6 },
    { start: 11, end: 17 },
  ];

  it("with dictation off, marks sentences as approximate, without fast marks or quarter paces", () => {
    const result = sectionFeedback({ sentences, segments, face: null, readToEnd: true, dictation: null });
    expect(result.approximate).toBe(true);
    expect(result.marks?.[2]).toEqual([{ kind: "pause", seconds: [5] }]);
    expect(result.marks?.flat().some((m) => m.kind === "fast")).toBe(false);
    expect(result.quarters).toBeNull();
    expect(result.fillers).toBeNull();
  });

  it("with dictation off and the script not read to the end, gives no sentence marks", () => {
    const result = sectionFeedback({ sentences, segments, face: null, readToEnd: false, dictation: null });
    expect(result.marks).toBeNull();
  });

  it("with dictation on, uses what was heard: skipped sentences, quarter paces, and fillers", () => {
    const chunks = [
      { text: `음 ${LINES[0]}`, at: 6 },
      { text: LINES[2], at: 14 },
      { text: LINES[3], at: 17 },
    ];
    const segments = [
      { start: 0, end: 6 },
      { start: 11, end: 14 },
      { start: 14, end: 17 },
    ];
    const result = sectionFeedback({
      sentences,
      segments,
      face: null,
      readToEnd: false,
      dictation: { chunks, dropouts: [], overallPace: 160 },
    });
    expect(result.approximate).toBe(false);
    expect(result.marks?.[1]).toEqual([{ kind: "skipped" }]);
    expect(result.marks?.[2]).toEqual([{ kind: "pause", seconds: [5] }]);
    expect(result.quarters?.map((q) => q.pace)).toEqual([100, null, 200, 200]);
    expect(result.fillers?.total).toBe(1);
  });
});
