import { describe, expect, it } from "vitest";
import { estimatePosition, scriptSentences } from "@/lib/scriptPosition";
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
