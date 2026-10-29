import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answerLabel,
  checkQuotes,
  chooseReview,
  countSyllables,
  estimateSeconds,
  findShortages,
  firstSecondsText,
  isAnswered,
  normalizeReview,
  practiceQuestions,
  quoteExists,
  shouldAutoRetry,
  shortageMessage,
  splitSentences,
} from "@/lib/validate";

const script = readFileSync("tests/fixtures/sample-script.txt", "utf8");

function strength(n: number) {
  return { criterion: "흐름", quote: `잘한 인용 ${n}`, why: `잘한 이유 ${n}` };
}
function improvement(n: number) {
  return { criterion: "근거", quote: `고칠 인용 ${n}`, problem: `문제 ${n}`, tryThis: `고친 문장 ${n}` };
}
function question(type: string, n = 1) {
  return { type, quote: `질문 인용 ${n}`, question: `질문 ${n}`, goodAnswer: `좋은 답 ${n}` };
}
function fullRaw() {
  return {
    summary: "총평이에요.",
    strengths: [strength(1), strength(2)],
    improvements: [improvement(1), improvement(2), improvement(3)],
    questions: [question("근거", 1), question("선택 이유", 2), question("한계", 3)],
  };
}

describe("normalizeReview: broken responses", () => {
  it.each([null, undefined, "문자열", 42, [], true])("returns null for non-object %s", (raw) => {
    expect(normalizeReview(raw)).toBeNull();
  });

  it("returns null when the summary is missing or empty", () => {
    expect(normalizeReview({ ...fullRaw(), summary: undefined })).toBeNull();
    expect(normalizeReview({ ...fullRaw(), summary: "   " })).toBeNull();
    expect(normalizeReview({ ...fullRaw(), summary: 3 })).toBeNull();
  });

  it("keeps a valid review as it is", () => {
    expect(normalizeReview(fullRaw())).toEqual(fullRaw());
  });

  it("treats missing or non-array lists as empty", () => {
    const review = normalizeReview({ summary: "총평", strengths: "없음", improvements: null });
    expect(review).toEqual({ summary: "총평", strengths: [], improvements: [], questions: [] });
  });

  it("drops items with empty, missing, or wrong-typed fields", () => {
    const raw = fullRaw();
    raw.improvements = [
      improvement(1),
      { ...improvement(2), quote: "" },
      { ...improvement(3), problem: undefined as unknown as string },
      { ...improvement(4), tryThis: 7 as unknown as string },
      "문자열" as unknown as ReturnType<typeof improvement>,
    ];
    expect(normalizeReview(raw)!.improvements).toEqual([improvement(1)]);
  });

  it("drops items with an unknown criterion", () => {
    const raw = fullRaw();
    raw.strengths = [{ ...strength(1), criterion: "발음" }, strength(2)];
    expect(normalizeReview(raw)!.strengths).toEqual([strength(2)]);
  });

  it("trims surrounding spaces", () => {
    const raw = fullRaw();
    raw.summary = "  총평이에요.  ";
    raw.strengths[0] = { criterion: " 흐름 ", quote: " 잘한 인용 1 ", why: " 잘한 이유 1 " };
    const review = normalizeReview(raw)!;
    expect(review.summary).toBe("총평이에요.");
    expect(review.strengths[0]).toEqual(strength(1));
  });

  it("removes markdown from screen text but keeps brackets there", () => {
    const raw = fullRaw();
    raw.summary = "**총평**이에요 (짧게).";
    raw.improvements[0] = { ...improvement(1), problem: "# 근거가 _없어요_." };
    raw.questions[0] = { ...question("근거"), goodAnswer: "`출처`를 말해요 (조사 시점 포함)." };
    const review = normalizeReview(raw)!;
    expect(review.summary).toBe("총평이에요 (짧게).");
    expect(review.improvements[0].problem).toBe("근거가 없어요.");
    expect(review.questions[0].goodAnswer).toBe("출처를 말해요 (조사 시점 포함).");
  });

  it("removes markdown, symbols, and brackets from questions because they are read aloud", () => {
    const raw = fullRaw();
    raw.questions[0] = { ...question("근거"), question: "**왜** 그렇게 [정말] 하셨나요 (짧게)?" };
    expect(normalizeReview(raw)!.questions[0].question).toBe("왜 그렇게 정말 하셨나요 짧게?");
  });

  it("keeps quotes exactly as written", () => {
    const raw = fullRaw();
    raw.improvements[0] = { ...improvement(1), quote: "대본 (원문) **그대로**" };
    expect(normalizeReview(raw)!.improvements[0].quote).toBe("대본 (원문) **그대로**");
  });
});

describe("normalizeReview: summary length", () => {
  it("keeps the first 3 sentences and the last one (encouragement) when longer than 4", () => {
    const raw = {
      ...fullRaw(),
      summary: "강점이에요. 먼저 고칠 점이에요. 마무리도 약해요. 덧붙인 설명이에요. 잘하고 있어요.",
    };
    expect(normalizeReview(raw)!.summary).toBe("강점이에요. 먼저 고칠 점이에요. 마무리도 약해요. 잘하고 있어요.");
  });

  it("drops every middle sentence after the third, however long the summary is", () => {
    const raw = { ...fullRaw(), summary: "하나예요. 둘이에요. 셋이에요. 넷이에요. 다섯이에요. 여섯이에요. 격려예요." };
    expect(normalizeReview(raw)!.summary).toBe("하나예요. 둘이에요. 셋이에요. 격려예요.");
  });

  it("leaves a summary of 4 sentences or fewer as it is", () => {
    const four = "강점이에요. 먼저 고칠 점이에요. 마무리도 약해요. 잘하고 있어요.";
    expect(normalizeReview({ ...fullRaw(), summary: four })!.summary).toBe(four);
    expect(normalizeReview({ ...fullRaw(), summary: "강점이에요. 잘하고 있어요." })!.summary).toBe(
      "강점이에요. 잘하고 있어요.",
    );
  });

  it("never cuts the summary in the middle of a quotation", () => {
    const raw = {
      ...fullRaw(),
      summary: '강점이에요. 결과에 숫자가 없어요. 마지막도 "이상입니다. 감사합니다."로 끝나요. 덧붙인 설명이에요. 잘하고 있어요.',
    };
    expect(normalizeReview(raw)!.summary).toBe(
      '강점이에요. 결과에 숫자가 없어요. 마지막도 "이상입니다. 감사합니다."로 끝나요. 잘하고 있어요.',
    );
  });

  it("counts sentences on separate lines and joins them with spaces", () => {
    const raw = { ...fullRaw(), summary: "하나예요.\n둘이에요.\n셋이에요.\n넷이에요.\n격려예요." };
    expect(normalizeReview(raw)!.summary).toBe("하나예요. 둘이에요. 셋이에요. 격려예요.");
  });
});

describe("normalizeReview: counts", () => {
  it("cuts extra items from the front: 2 strengths and 3 improvements", () => {
    const raw = fullRaw();
    raw.strengths = [strength(1), strength(2), strength(3), strength(4)];
    raw.improvements = [1, 2, 3, 4, 5].map(improvement);
    const review = normalizeReview(raw)!;
    expect(review.strengths).toEqual([strength(1), strength(2)]);
    expect(review.improvements).toEqual([improvement(1), improvement(2), improvement(3)]);
  });

  it("keeps one question per type, in the order 근거, 선택 이유, 한계", () => {
    const raw = fullRaw();
    raw.questions = [question("한계", 1), question("근거", 2), question("근거", 3), question("선택 이유", 4)];
    const types = normalizeReview(raw)!.questions.map((q) => q.type);
    expect(types).toEqual(["근거", "선택 이유", "한계"]);
    expect(new Set(types).size).toBe(types.length);
    expect(normalizeReview(raw)!.questions[0].question).toBe("질문 2");
  });

  it("drops questions with an unknown type", () => {
    const raw = fullRaw();
    raw.questions = [question("근거"), question("감상"), question("한계")];
    expect(normalizeReview(raw)!.questions.map((q) => q.type)).toEqual(["근거", "한계"]);
  });
});

describe("findShortages and shortageMessage", () => {
  it("reports nothing when every count is met", () => {
    expect(findShortages(normalizeReview(fullRaw())!)).toEqual([]);
  });

  it("reports each section that has too few items", () => {
    const raw = fullRaw();
    raw.improvements = [improvement(1), improvement(2)];
    raw.questions = [question("근거")];
    expect(findShortages(normalizeReview(raw)!)).toEqual([
      { section: "improvements", found: 2, expected: 3 },
      { section: "questions", found: 1, expected: 3 },
    ]);
  });

  it("explains a shortage in plain words", () => {
    expect(shortageMessage({ section: "improvements", found: 2, expected: 3 })).toBe("고칠 점을 2개만 찾았어요");
    expect(shortageMessage({ section: "strengths", found: 1, expected: 2 })).toBe("잘한 점을 1개만 찾았어요");
    expect(shortageMessage({ section: "questions", found: 0, expected: 3 })).toBe("예상 질문을 찾지 못했어요");
  });
});

describe("chooseReview: retry once when short", () => {
  const full = normalizeReview(fullRaw())!;
  const short = { ...full, improvements: full.improvements.slice(0, 1) };
  const lessShort = { ...full, improvements: full.improvements.slice(0, 2) };

  it("uses the retry when it is complete", () => {
    expect(chooseReview(short, full)).toBe(full);
  });

  it("keeps whichever has more items when both are short", () => {
    expect(chooseReview(short, lessShort)).toBe(lessShort);
    expect(chooseReview(lessShort, short)).toBe(lessShort);
  });

  it("keeps the first when the retry is broken", () => {
    expect(chooseReview(short, null)).toBe(short);
  });
});

describe("shouldAutoRetry", () => {
  it("asks once more by itself only for a broken response", () => {
    expect(shouldAutoRetry("invalid_response", 0)).toBe(true);
    expect(shouldAutoRetry("invalid_response", 1)).toBe(false);
  });

  it.each(["no_key", "auth", "network", "busy", "refused", "unknown", "bad_input"] as const)(
    "leaves %s to the try-again button",
    (kind) => {
      expect(shouldAutoRetry(kind, 0)).toBe(false);
    },
  );
});

describe("practiceQuestions", () => {
  it("gives the practice screen only the question type and text, in order", () => {
    const checked = checkQuotes(normalizeReview(fullRaw())!, script);
    expect(practiceQuestions(checked)).toEqual([
      { type: "근거", question: "질문 1" },
      { type: "선택 이유", question: "질문 2" },
      { type: "한계", question: "질문 3" },
    ]);
  });
});

describe("answers", () => {
  it("treats blank answers as skipped", () => {
    expect(isAnswered("저울로 쟀어요.")).toBe(true);
    expect(isAnswered("   ")).toBe(false);
  });

  it("labels a skipped answer for the screen", () => {
    expect(answerLabel("  저울로 쟀어요.  ")).toBe("저울로 쟀어요.");
    expect(answerLabel("")).toBe("답하지 않음");
  });
});

describe("quoteExists", () => {
  it("finds an exact sentence", () => {
    expect(quoteExists(script, "그 결과 음식물 쓰레기가 많이 줄었습니다.")).toBe(true);
  });

  it("finds part of a sentence", () => {
    expect(quoteExists(script, "음식물 쓰레기가 많이 줄었습니다")).toBe(true);
  });

  it("ignores spacing and line breaks", () => {
    expect(quoteExists(script, "그 결과  음식물\n쓰레기가 많이줄었습니다.")).toBe(true);
  });

  it("ignores punctuation differences", () => {
    expect(quoteExists(script, "앱은 플러터로 만들었고 서버는 파이어베이스를 썼습니다")).toBe(true);
    expect(quoteExists(script, "“그 결과 음식물 쓰레기가 많이 줄었습니다!”")).toBe(true);
  });

  it("rejects a sentence that is not in the script", () => {
    expect(quoteExists(script, "음식물 쓰레기가 30% 줄었습니다.")).toBe(false);
  });

  it("rejects quotes that are empty or too short to mean anything", () => {
    expect(quoteExists(script, "")).toBe(false);
    expect(quoteExists(script, " . ")).toBe(false);
    expect(quoteExists(script, "앱")).toBe(false);
  });
});

describe("checkQuotes", () => {
  it("marks each quote as found or not found", () => {
    const raw = fullRaw();
    raw.strengths[0].quote = "저희는 이 앱을 학교 식당에서 2주 동안 시범 운영했습니다.";
    raw.improvements[0].quote = "대본에 없는 문장이에요.";
    raw.questions[0].quote = "이상입니다. 감사합니다.";
    const checked = checkQuotes(normalizeReview(raw)!, script);
    expect(checked.strengths[0].quoteFound).toBe(true);
    expect(checked.improvements[0].quoteFound).toBe(false);
    expect(checked.questions[0].quoteFound).toBe(true);
  });
});

describe("speaking time (300 syllables per minute assumption)", () => {
  it("counts each Korean syllable, letter, and digit as one", () => {
    expect(countSyllables("안녕하세요.")).toBe(5);
    expect(countSyllables("REST API 2주")).toBe(9);
    expect(countSyllables("")).toBe(0);
  });

  it("estimates seconds from syllables", () => {
    expect(estimateSeconds("가".repeat(300))).toBe(60);
    expect(estimateSeconds(script)).toBe(88);
    expect(estimateSeconds("")).toBe(0);
  });

  it("cuts the first 30 seconds at 150 syllables", () => {
    const text = "가".repeat(100) + ". " + "나".repeat(100);
    const cut = firstSecondsText(text, 30);
    expect(countSyllables(cut)).toBe(150);
    expect(cut).toBe("가".repeat(100) + ". " + "나".repeat(50));
  });

  it("returns the whole text when it is shorter than the cut", () => {
    expect(firstSecondsText("짧은 대본이에요.", 30)).toBe("짧은 대본이에요.");
  });

  it("cuts the sample script inside the second paragraph", () => {
    const cut = firstSecondsText(script, 30);
    expect(cut.startsWith("안녕하세요.")).toBe(true);
    expect(cut.endsWith("요즘 음식물 쓰레기는 정말 심각")).toBe(true);
  });
});

describe("splitSentences", () => {
  it("splits on sentence endings", () => {
    expect(splitSentences("안녕하세요. 반가워요! 왜 그런가요?")).toEqual(["안녕하세요.", "반가워요!", "왜 그런가요?"]);
  });

  it("splits on line breaks and drops empty pieces", () => {
    expect(splitSentences("첫 줄\n\n둘째 줄.  ")).toEqual(["첫 줄", "둘째 줄."]);
  });

  it("does not split inside numbers", () => {
    expect(splitSentences("2.5초 동안 멈췄어요. 다시 해요.")).toEqual(["2.5초 동안 멈췄어요.", "다시 해요."]);
  });

  it("does not split inside quotation marks", () => {
    expect(splitSentences('마지막도 "이상입니다. 감사합니다."로 끝나요. 다음 문장이에요.')).toEqual([
      '마지막도 "이상입니다. 감사합니다."로 끝나요.',
      "다음 문장이에요.",
    ]);
    expect(splitSentences("“많이 줄었다.”만 있어요. 숫자를 넣어요.")).toEqual(["“많이 줄었다.”만 있어요.", "숫자를 넣어요."]);
  });

  it("returns nothing for empty text", () => {
    expect(splitSentences("  ")).toEqual([]);
  });
});
