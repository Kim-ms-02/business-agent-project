import { describe, expect, it } from "vitest";
import {
  alignTranscript,
  dictatedTimeline,
  estimatedTimeline,
  estimatePosition,
  findDropouts,
  normalizeForMatch,
  scriptSentences,
  toSpokenKorean,
} from "@/lib/scriptPosition";
import { countSyllables } from "@/lib/validate";

// A sentence of exactly n syllables, so the arithmetic stays readable.
function sentence(n: number): string {
  return `${"가".repeat(n)}.`;
}

function script(...lengths: number[]): string {
  return lengths.map(sentence).join(" ");
}

describe("scriptSentences", () => {
  it("splits the script into sentences with their syllable counts and where each starts and ends", () => {
    expect(scriptSentences(script(5, 20, 5))).toEqual([
      { text: sentence(5), syllables: 5, from: 0, to: 5 },
      { text: sentence(20), syllables: 20, from: 5, to: 25 },
      { text: sentence(5), syllables: 5, from: 25, to: 30 },
    ]);
  });

  it("uses the same sentence split as the rest of the app, so blank lines make no sentences", () => {
    const table = scriptSentences("첫 문장이에요.\n\n\n둘째 문장이에요.\n");
    expect(table.map((s) => s.text)).toEqual(["첫 문장이에요.", "둘째 문장이에요."]);
    expect(table.map((s) => s.syllables)).toEqual([6, 7]);
  });

  it("counts only syllables, not spaces or punctuation", () => {
    expect(scriptSentences("가 나, 다!")[0].syllables).toBe(3);
  });
});

describe("scriptSentences: sentences that are hard to count", () => {
  it("counts English letters and digits one by one, the same as the syllable count", () => {
    const table = scriptSentences("AI가 92퍼센트를 맞혔어요. 다음이에요.");
    expect(table.map((s) => s.syllables)).toEqual([countSyllables("AI가 92퍼센트를 맞혔어요."), 5]);
    // A, I, 가, 9, 2, 퍼, 센, 트, 를, 맞, 혔, 어, 요
    expect(table[0].syllables).toBe(13);
  });

  it("keeps a stage direction, an ellipsis, or an emoji line in the table with no syllables", () => {
    const table = scriptSentences("시작할게요.\n(웃음)\n…\n🙂🙂\n[박수]\n끝이에요.");
    expect(table.map((s) => s.text)).toEqual(["시작할게요.", "(웃음)", "…", "🙂🙂", "[박수]", "끝이에요."]);
    expect(table.map((s) => s.syllables)).toEqual([5, 0, 0, 0, 0, 4]);
    expect(table.at(-1)).toMatchObject({ from: 5, to: 9 });
  });

  it("does not drop a last sentence without a period", () => {
    const table = scriptSentences("첫 문장이에요. 마침표 없는 마지막 문장");
    expect(table.map((s) => s.text)).toEqual(["첫 문장이에요.", "마침표 없는 마지막 문장"]);
    expect(table[1].syllables).toBe(10);
  });
});

describe("estimatePosition", () => {
  it("moves through the sentences at a steady pace when the speaker reads steadily", () => {
    // 30 syllables in 30 seconds of speech: one syllable a second.
    const table = scriptSentences(script(10, 10, 10));
    const segments = [{ start: 0, end: 30 }];
    expect([5, 9.9, 10, 15, 25].map((t) => estimatePosition(t, segments, table))).toEqual([0, 0, 1, 1, 2]);
  });

  it("stays on the last sentence at and after the end", () => {
    const table = scriptSentences(script(10, 10, 10));
    const segments = [{ start: 0, end: 30 }];
    expect(estimatePosition(30, segments, table)).toBe(2);
    expect(estimatePosition(45, segments, table)).toBe(2);
  });

  it("is at the first sentence before the first word", () => {
    const table = scriptSentences(script(10, 10));
    expect(estimatePosition(1, [{ start: 3, end: 23 }], table)).toBe(0);
  });

  it("does not move during a 5-second pause", () => {
    // Speech 0–10 s and 15–35 s: 30 seconds of speech for 30 syllables.
    const table = scriptSentences(script(10, 10, 10));
    const segments = [
      { start: 0, end: 10 },
      { start: 15, end: 35 },
    ];
    const during = [10.5, 12, 14.9].map((t) => estimatePosition(t, segments, table));
    expect(during).toEqual([1, 1, 1]);
    // After the pause it picks up where it stopped: 25 s is 20 seconds of speech, the start of sentence 3.
    expect(estimatePosition(24.9, segments, table)).toBe(1);
    expect(estimatePosition(25, segments, table)).toBe(2);
  });

  it("stays inside a sentence when the pause comes in the middle of it", () => {
    const table = scriptSentences(script(10, 10));
    const segments = [
      { start: 0, end: 4 },
      { start: 9, end: 25 },
    ];
    expect([4, 6, 8.9].map((t) => estimatePosition(t, segments, table))).toEqual([0, 0, 0]);
  });

  it("spends longer on longer sentences", () => {
    // 5, 20, and 5 syllables read steadily over 30 seconds.
    const table = scriptSentences(script(5, 20, 5));
    const segments = [{ start: 0, end: 30 }];
    expect([4.9, 5, 24.9, 25].map((t) => estimatePosition(t, segments, table))).toEqual([0, 1, 1, 2]);
  });

  it("follows the script's pace, not one syllable a second", () => {
    // 30 syllables in 10 seconds of speech: three syllables a second.
    const table = scriptSentences(script(10, 10, 10));
    expect([3.3, 3.4, 6.7].map((t) => estimatePosition(t, [{ start: 0, end: 10 }], table))).toEqual([0, 1, 2]);
  });

  it("is always the only sentence when there is one", () => {
    const table = scriptSentences(sentence(12));
    expect([0, 5, 12, 20].map((t) => estimatePosition(t, [{ start: 0, end: 12 }], table))).toEqual([0, 0, 0, 0]);
  });

  it("cannot say anything when nothing was spoken", () => {
    const table = scriptSentences(script(10, 10));
    expect(estimatePosition(5, [], table)).toBeNull();
    expect(estimatePosition(5, [{ start: 3, end: 3 }], table)).toBeNull();
  });

  it("follows the syllable count through English letters and digits", () => {
    // "AI가 92퍼센트." counts 8 syllables, then 8 more: 16 in 16 seconds.
    const table = scriptSentences("AI가 92퍼센트. 가가가가가가가가.");
    expect(table.map((s) => s.syllables)).toEqual([8, 8]);
    expect([7.9, 8].map((t) => estimatePosition(t, [{ start: 0, end: 16 }], table))).toEqual([0, 1]);
  });

  it("never lands on a sentence without syllables, and keeps the other sentences' numbers", () => {
    const table = scriptSentences(`${sentence(10)}\n(웃음)\n…\n${sentence(10)}`);
    const segments = [{ start: 0, end: 20 }];
    expect([5, 10, 15, 20].map((t) => estimatePosition(t, segments, table))).toEqual([0, 3, 3, 3]);
  });

  it("reaches a last sentence without a period", () => {
    const table = scriptSentences(`${sentence(10)} ${"가".repeat(10)}`);
    expect(estimatePosition(15, [{ start: 0, end: 20 }], table)).toBe(1);
  });

  it("cannot say anything for a script without syllables", () => {
    expect(estimatePosition(5, [{ start: 0, end: 10 }], scriptSentences(""))).toBeNull();
    expect(estimatePosition(5, [{ start: 0, end: 10 }], scriptSentences("... !!!"))).toBeNull();
  });
});

describe("toSpokenKorean", () => {
  it.each([
    ["0", "영"],
    ["7", "칠"],
    ["10", "십"],
    ["11", "십일"],
    ["87", "팔십칠"],
    ["100", "백"],
    ["105", "백오"],
    ["1000", "천"],
    ["2025", "이천이십오"],
    ["3005", "삼천오"],
    ["10000", "만"],
    ["120000", "십이만"],
    ["100000000", "일억"],
    ["120000000", "일억이천만"],
  ])("reads the number %s as %s", (number, spoken) => {
    expect(toSpokenKorean(number)).toBe(spoken);
  });

  it("reads numbers inside a sentence and keeps the rest", () => {
    expect(toSpokenKorean("학생 87명에게")).toBe("학생 팔십칠명에게");
  });

  it("reads percents and decimal points", () => {
    expect(toSpokenKorean("71%")).toBe("칠십일 퍼센트");
    expect(toSpokenKorean("71 %가")).toBe("칠십일 퍼센트가");
    expect(toSpokenKorean("3.4배")).toBe("삼 점 사배");
    expect(toSpokenKorean("0.5")).toBe("영 점 오");
    expect(toSpokenKorean("3.14")).toBe("삼 점 일사");
  });

  it("ignores thousands commas", () => {
    expect(toSpokenKorean("120,000명")).toBe("십이만명");
    expect(toSpokenKorean("1,500원")).toBe("천오백원");
  });

  it("reads numbers mixed with Korean units", () => {
    expect(toSpokenKorean("2만 8천 원")).toBe("이만 팔천 원");
    expect(toSpokenKorean("1만 명")).toBe("만 명");
    expect(toSpokenKorean("1천 개")).toBe("천 개");
    expect(toSpokenKorean("3억")).toBe("삼억");
  });

  it("reads all-capital words of up to four letters by letter name", () => {
    expect(toSpokenKorean("AI가")).toBe("에이아이가");
    expect(toSpokenKorean("KTX를 타고")).toBe("케이티엑스를 타고");
    expect(toSpokenKorean("A안과 B안")).toBe("에이안과 비안");
  });

  it("reads short English words by letter name whatever their case, since dictation may write ai or Ai", () => {
    expect(toSpokenKorean("ai가")).toBe("에이아이가");
    expect(toSpokenKorean("Ai가")).toBe("에이아이가");
    expect(normalizeForMatch("Ai가 알려 줘요")).toBe(normalizeForMatch("에이아이가 알려 줘요"));
    expect(normalizeForMatch("AI가")).toBe(normalizeForMatch("ai가"));
  });

  it("leaves English said as a word as it is", () => {
    expect(toSpokenKorean("Google 검색")).toBe("Google 검색");
    expect(toSpokenKorean("iPhone")).toBe("iPhone");
    expect(toSpokenKorean("UNESCO")).toBe("UNESCO");
  });
});

describe("normalizeForMatch", () => {
  it("keeps only letters, so spacing and punctuation do not matter", () => {
    expect(normalizeForMatch("안녕하세요, 저는 김민지 입니다!")).toBe("안녕하세요저는김민지입니다");
  });

  it("reads numbers and capital abbreviations the same way on both sides", () => {
    expect(normalizeForMatch("학생 87명")).toBe(normalizeForMatch("학생 팔십칠 명"));
    expect(normalizeForMatch("AI가")).toBe(normalizeForMatch("에이아이가"));
  });

  it("drops hesitation sounds said on their own, but not words that contain them", () => {
    expect(normalizeForMatch("음 그 결과 어 음식물")).toBe("그결과음식물");
    expect(normalizeForMatch("으음, 어어 좋아요")).toBe("좋아요");
  });

  it("keeps English words in lower case", () => {
    expect(normalizeForMatch("Google 검색")).toBe("google검색");
  });
});

describe("findDropouts", () => {
  it("finds a stretch where the speaker kept talking but dictation sent nothing for more than 5 seconds", () => {
    expect(findDropouts([1, 2, 3, 15], [{ start: 0, end: 20 }], 20)).toEqual([{ start: 3, end: 15 }]);
  });

  it("does not count silence, only speaking time, inside the stretch", () => {
    const segments = [
      { start: 0, end: 3 },
      { start: 9, end: 12 },
    ];
    expect(findDropouts([2, 12], segments, 12)).toEqual([]);
  });

  it("needs more than exactly 5 seconds of speech", () => {
    expect(findDropouts([0, 10], [{ start: 0, end: 5 }], 10)).toEqual([]);
  });

  it("finds dropouts at the start and at the end", () => {
    expect(findDropouts([], [{ start: 0, end: 8 }], 8)).toEqual([{ start: 0, end: 8 }]);
    expect(findDropouts([1], [{ start: 0, end: 10 }], 10)).toEqual([{ start: 1, end: 10 }]);
  });
});

describe("alignTranscript", () => {
  const LINES = [
    "안녕하세요, 저는 김민지입니다.",
    "오늘은 잔반 줄이기 앱을 소개하겠습니다.",
    "학생 87명에게 설문을 했습니다.",
    "AI가 먹을 양을 미리 알려 줍니다.",
    "그 결과 음식물 쓰레기가 많이 줄었습니다.",
    "감사합니다.",
  ];
  const table = scriptSentences(LINES.join(" "));
  const chunks = (...texts: string[]) => texts.map((text, i) => ({ text, at: i * 5 + 4 }));
  const all = (status: string) => LINES.map(() => status);

  it("matches a script read as it is", () => {
    const result = alignTranscript(table, chunks(...LINES), []);
    expect(result.sentences).toEqual(all("read"));
    expect(result.matches.map((m) => [m.chunk, m.first, m.last])).toEqual(LINES.map((_, i) => [i, i, i]));
  });

  it("ignores different spacing and missing sentence ends", () => {
    const heard = chunks(
      "안녕하세요저는 김민지 입니다",
      "오늘은 잔반줄이기 앱을 소개하겠습니다",
      ...LINES.slice(2, 5),
      "감사 합니다",
    );
    expect(alignTranscript(table, heard, []).sentences).toEqual(all("read"));
  });

  it("matches numbers dictated as Korean words, and as digits", () => {
    const words = chunks(...LINES.slice(0, 2), "학생 팔십칠 명에게 설문을 했습니다", ...LINES.slice(3));
    const digits = chunks(...LINES.slice(0, 2), "학생 87명에게 설문을 했습니다", ...LINES.slice(3));
    expect(alignTranscript(table, words, []).sentences).toEqual(all("read"));
    expect(alignTranscript(table, digits, []).sentences).toEqual(all("read"));
  });

  it("matches English abbreviations dictated in Korean", () => {
    const heard = chunks(...LINES.slice(0, 3), "에이아이가 먹을 양을 미리 알려 줍니다", ...LINES.slice(4));
    expect(alignTranscript(table, heard, []).sentences).toEqual(all("read"));
  });

  it("matches a sentence with hesitation sounds in it", () => {
    const heard = chunks(...LINES.slice(0, 4), "음 그 결과 어 음식물 쓰레기가 으음 많이 줄었습니다", "감사합니다");
    expect(alignTranscript(table, heard, []).sentences).toEqual(all("read"));
  });

  it("matches one dictation result that covers two sentences", () => {
    const heard = chunks("안녕하세요 저는 김민지입니다 오늘은 잔반 줄이기 앱을 소개하겠습니다", ...LINES.slice(2));
    const result = alignTranscript(table, heard, []);
    expect(result.sentences).toEqual(all("read"));
    expect(result.matches[0]).toMatchObject({ chunk: 0, first: 0, last: 1 });
  });

  it("puts together one sentence dictated in two pieces", () => {
    const heard = chunks(...LINES.slice(0, 2), "학생 팔십칠 명에게", "설문을 했습니다", ...LINES.slice(3));
    expect(alignTranscript(table, heard, []).sentences).toEqual(all("read"));
  });

  it("does not count a sentence when less than half of it was matched", () => {
    const heard = chunks(LINES[0], "오늘은 잔반", ...LINES.slice(2));
    expect(alignTranscript(table, heard, []).sentences[1]).toBe("missed");
  });

  it("leaves a skipped sentence unread", () => {
    const heard = chunks(...LINES.slice(0, 2), ...LINES.slice(3));
    expect(alignTranscript(table, heard, []).sentences).toEqual(["read", "read", "missed", "read", "read", "read"]);
  });

  it("follows the speaker back to an earlier sentence read again", () => {
    const heard = chunks(LINES[0], LINES[1], LINES[2], LINES[1], LINES[2], ...LINES.slice(3));
    const result = alignTranscript(table, heard, []);
    expect(result.sentences).toEqual(all("read"));
    expect(result.matches[3]).toMatchObject({ first: 1, last: 1 });
  });

  it("does not move for improvised words that are not in the script", () => {
    const heard = chunks(LINES[0], "제가 어제 점심을 먹다가 생각한 건데요", ...LINES.slice(1));
    const result = alignTranscript(table, heard, []);
    expect(result.sentences).toEqual(all("read"));
    expect(result.matches.map((m) => m.chunk)).not.toContain(1);
  });

  it("does not let a very short piece jump ahead", () => {
    // "감사" alone would match the last sentence and leave the rest out of reach.
    const heard = chunks(LINES[0], "감사", ...LINES.slice(1));
    expect(alignTranscript(table, heard, []).sentences).toEqual(all("read"));
  });

  it("matches with at least 60% of the letters right, and not below", () => {
    const short = scriptSentences("가나다라마바사아자차. 카타파하거너더러머버.");
    // Ten letters: four wrong is 60% right, five wrong is 50%.
    expect(alignTranscript(short, [{ text: "가나다라마흏흏흏흏차", at: 3 }], []).sentences[0]).toBe("read");
    expect(alignTranscript(short, [{ text: "가나다라흏흏흏흏흏차", at: 3 }], []).sentences[0]).toBe("missed");
  });

  it("marks sentences said while dictation had stopped as unknown, not unread", () => {
    const heard = [
      { text: LINES[0], at: 3 },
      { text: LINES[1], at: 8 },
      { text: LINES[4], at: 25 },
    ];
    expect(alignTranscript(table, heard, [{ start: 10, end: 20 }]).sentences).toEqual([
      "read",
      "read",
      "unknown",
      "unknown",
      "read",
      "missed",
    ]);
    expect(alignTranscript(table, heard, []).sentences).toEqual(["read", "read", "missed", "missed", "read", "missed"]);
  });

  it("marks the rest as unknown when dictation stopped before the end", () => {
    const heard = [
      { text: LINES[0], at: 3 },
      { text: LINES[1], at: 8 },
      { text: LINES[2], at: 13 },
    ];
    expect(alignTranscript(table, heard, [{ start: 14, end: 40 }]).sentences).toEqual([
      "read",
      "read",
      "read",
      "unknown",
      "unknown",
      "unknown",
    ]);
  });

  it("marks the start as unknown when dictation began late", () => {
    const heard = [{ text: LINES[2], at: 20 }, ...LINES.slice(3).map((text, i) => ({ text, at: 25 + i * 5 }))];
    const result = alignTranscript(table, heard, [{ start: 0, end: 18 }]);
    expect(result.sentences.slice(0, 2)).toEqual(["unknown", "unknown"]);
  });

  it("matches an abbreviation dictated in lower case", () => {
    const heard = chunks(...LINES.slice(0, 3), "ai가 먹을 양을 미리 알려 줍니다", ...LINES.slice(4));
    expect(alignTranscript(table, heard, []).sentences).toEqual(all("read"));
  });

  it("gives stage directions their own status, so they are never unread", () => {
    const withNote = scriptSentences(`${LINES[0]}\n(웃음)\n${LINES[1]}`);
    expect(alignTranscript(withNote, chunks(LINES[0], LINES[1]), []).sentences).toEqual(["read", "blank", "read"]);
  });
});

describe("alignTranscript: finding the place again", () => {
  const LONG = [
    "안녕하세요 발표를 시작하겠습니다.",
    "저희 팀은 학교 식당 문제를 골랐습니다.",
    "점심시간마다 남는 음식이 너무 많았습니다.",
    "그래서 학생들에게 직접 물어보았습니다.",
    "대부분은 양을 고를 수 없어서라고 답했습니다.",
    "저희는 미리 양을 고르는 방법을 생각했습니다.",
    "식당 아주머니들도 이 생각을 반겨 주셨습니다.",
    "두 주 동안 일 학년 교실에서 시험해 보았습니다.",
    "버려지는 밥의 무게를 매일 저울로 쟀습니다.",
    "결과를 그래프로 정리해 보여 드리겠습니다.",
    "첫 주보다 둘째 주에 훨씬 적게 버렸습니다.",
    "다만 날씨나 메뉴의 영향도 있었을 수 있습니다.",
    "다음에는 더 오래 시험해 보려고 합니다.",
    "들어 주셔서 고맙습니다.",
  ];
  const longTable = scriptSentences(LONG.join(" "));
  const heard = (...indexes: (number | string)[]) =>
    indexes.map((i, n) => ({ text: typeof i === "number" ? LONG[i] : i, at: n * 5 + 4 }));

  it("searches the whole script after three misses in a row, so a skipped paragraph is not the end", () => {
    // After sentence 2 the speaker jumps to sentence 10: seven sentences skipped, beyond the five looked at.
    const result = alignTranscript(longTable, heard(0, 1, 9, 10, 11, 12, 13), []);
    expect(result.sentences.slice(11)).toEqual(["read", "read", "read"]);
    expect(result.sentences.slice(2, 9)).toEqual(Array(7).fill("missed"));
    expect(result.matches.find((m) => m.first === 11)).toBeDefined();
  });

  it("does not search the whole script after only two misses", () => {
    // Improvised words, then sentence 10: only the second miss, so sentence 10 is not found yet.
    const result = alignTranscript(longTable, heard(0, "제가 어제 겪은 일인데요 정말 웃겼어요", 9, 10), []);
    expect(result.sentences[9]).toBe("missed");
    expect(result.sentences[10]).toBe("read");
  });

  it("starts counting misses again after a match", () => {
    const result = alignTranscript(
      longTable,
      heard(0, "제가 어제 겪은 일인데요 정말 웃겼어요", "그 친구가 계속 웃어서 저도 웃었어요", 1, 9),
      [],
    );
    expect(result.sentences[1]).toBe("read");
    expect(result.sentences[9]).toBe("missed");
  });
});

describe("alignTranscript: the same sentence twice", () => {
  const TWICE = [
    "감사합니다.",
    "오늘 발표를 시작하겠습니다.",
    "첫째로 문제를 말씀드리겠습니다.",
    "둘째로 해결 방법을 보여 드리겠습니다.",
    "감사합니다.",
  ];
  const twiceTable = scriptSentences(TWICE.join(" "));
  const heard = (...texts: string[]) => texts.map((text, n) => ({ text, at: n * 5 + 4 }));

  it("matches the first one at the start", () => {
    const result = alignTranscript(twiceTable, heard(TWICE[0]), []);
    expect(result.matches[0]).toMatchObject({ first: 0, last: 0 });
  });

  it("matches the nearest one ahead of the current place, not the one behind", () => {
    const result = alignTranscript(twiceTable, heard(TWICE[0], TWICE[1], "감사합니다"), []);
    expect(result.matches[2]).toMatchObject({ first: 4, last: 4 });
  });

  it("marks both as read when the script is read through", () => {
    expect(alignTranscript(twiceTable, heard(...TWICE), []).sentences).toEqual(TWICE.map(() => "read"));
  });
});

describe("sentence timelines", () => {
  const TEN = ["학교 급식이 많이 남아요.", "그래서 설문을 해 봤어요.", "결과가 아주 놀라웠어요."];
  const tenTable = scriptSentences(TEN.join(" "));

  it("estimates when each sentence was read at one steady pace", () => {
    const two = scriptSentences(TEN.slice(0, 2).join(" "));
    expect(estimatedTimeline(two, [{ start: 0, end: 10 }])).toEqual([[{ start: 0, end: 5 }], [{ start: 5, end: 10 }]]);
  });

  it("splits a sentence around a pause in the middle of it", () => {
    const timeline = estimatedTimeline(tenTable, [
      { start: 0, end: 6 },
      { start: 10, end: 16 },
    ]);
    expect(timeline).toEqual([
      [{ start: 0, end: 4 }],
      [
        { start: 4, end: 6 },
        { start: 10, end: 12 },
      ],
      [{ start: 12, end: 16 }],
    ]);
  });

  it("gives stage directions and a rehearsal with no speech no time", () => {
    const withNote = scriptSentences(`${TEN[0]} (웃음) ${TEN[1]}`);
    expect(estimatedTimeline(withNote, [{ start: 0, end: 10 }])[1]).toEqual([]);
    expect(estimatedTimeline(tenTable, [])).toEqual([[], [], []]);
  });

  it("times each sentence by the speech before its dictated piece", () => {
    const chunks = [
      { text: TEN[0], at: 5 },
      { text: TEN[1], at: 10 },
    ];
    const segments = [
      { start: 0, end: 4.5 },
      { start: 5.5, end: 9.5 },
    ];
    const { matches } = alignTranscript(tenTable, chunks, []);
    expect(dictatedTimeline(tenTable, chunks, matches, segments)).toEqual([
      [{ start: 0, end: 4.5 }],
      [{ start: 5.5, end: 9.5 }],
      [],
    ]);
  });

  it("splits one piece over two sentences by their letters", () => {
    const chunks = [{ text: `${TEN[0]} ${TEN[1]}`, at: 10 }];
    const { matches } = alignTranscript(tenTable, chunks, []);
    expect(dictatedTimeline(tenTable, chunks, matches, [{ start: 0, end: 10 }]).slice(0, 2)).toEqual([
      [{ start: 0, end: 5 }],
      [{ start: 5, end: 10 }],
    ]);
  });

  it("leaves improvised speech out of every sentence, and keeps both times of a sentence read twice", () => {
    const chunks = [
      { text: TEN[0], at: 5 },
      { text: "제가 어제 겪은 일인데요 정말 웃겼어요", at: 10 },
      { text: TEN[0], at: 15 },
    ];
    const segments = [
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
    ];
    const { matches } = alignTranscript(tenTable, chunks, []);
    expect(dictatedTimeline(tenTable, chunks, matches, segments)).toEqual([
      [
        { start: 0, end: 4 },
        { start: 10, end: 14 },
      ],
      [],
      [],
    ]);
  });
});
