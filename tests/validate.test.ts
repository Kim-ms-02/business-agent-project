import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answerEvaluations,
  answerLabel,
  checkQuotes,
  chooseReview,
  countSyllables,
  evaluationLabel,
  feedbackLines,
  estimateSeconds,
  findShortages,
  guidanceCount,
  firstSecondsText,
  inputError,
  isAnswered,
  missingAnswerMessage,
  normalizeAnswerFeedback,
  normalizeReview,
  practiceQuestions,
  quoteExists,
  shouldAutoRetry,
  shortageMessage,
  splitSentences,
  tryThisGuidance,
} from "@/lib/validate";

const script = readFileSync("tests/fixtures/sample-script.txt", "utf8");

function strength(n: number) {
  return { criterion: "흐름", quote: `잘한 인용 ${n}`, why: `잘한 이유 ${n}` };
}
function improvement(n: number) {
  return { criterion: "근거", quote: `고칠 인용 ${n}`, problem: `문제 ${n}`, tryThis: `고친 문장 ${n}` };
}
function question(type: string, n = 1) {
  return { type, quote: `질문 인용 ${n}`, question: `질문 ${n}`, goodAnswer: `좋은 답 ${n}`, avoidAnswer: `피할 답 ${n}` };
}
function fullRaw() {
  return {
    summary: "총평이에요.",
    strengths: [strength(1), strength(2)],
    improvements: [improvement(1), improvement(2), improvement(3)],
    questions: [question("근거", 1), question("다른 설명", 2), question("개념과 범위", 3)],
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
    raw.questions[0] = {
      ...question("근거"),
      goodAnswer: "`출처`를 말해요 (조사 시점 포함).",
      avoidAnswer: "**다들 좋다고 했어요**처럼 느낌만 말하기.",
    };
    const review = normalizeReview(raw)!;
    expect(review.summary).toBe("총평이에요 (짧게).");
    expect(review.improvements[0].problem).toBe("근거가 없어요.");
    expect(review.questions[0].goodAnswer).toBe("출처를 말해요 (조사 시점 포함).");
    expect(review.questions[0].avoidAnswer).toBe("다들 좋다고 했어요처럼 느낌만 말하기.");
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

  it("keeps one question per type, in the order 근거, 다른 설명, 개념과 범위", () => {
    const raw = fullRaw();
    raw.questions = [question("개념과 범위", 1), question("근거", 2), question("근거", 3), question("다른 설명", 4)];
    const types = normalizeReview(raw)!.questions.map((q) => q.type);
    expect(types).toEqual(["근거", "다른 설명", "개념과 범위"]);
    expect(new Set(types).size).toBe(types.length);
    expect(normalizeReview(raw)!.questions[0].question).toBe("질문 2");
  });

  it("drops questions with an unknown type", () => {
    const raw = fullRaw();
    raw.questions = [question("근거"), question("선택 이유"), question("개념과 범위")];
    expect(normalizeReview(raw)!.questions.map((q) => q.type)).toEqual(["근거", "개념과 범위"]);
  });

  it("drops a question without an answer to avoid", () => {
    const raw = fullRaw();
    raw.questions[1] = { ...question("다른 설명"), avoidAnswer: "  " };
    expect(normalizeReview(raw)!.questions.map((q) => q.type)).toEqual(["근거", "개념과 범위"]);
  });
});

describe("try-this lead-in", () => {
  // The screen already labels the field "이렇게 말해 보기", so the same words in front repeat it.
  const withTry = (tryThis: string) => {
    const raw = fullRaw();
    raw.improvements[0] = { ...improvement(1), tryThis };
    return normalizeReview(raw)!.improvements;
  };

  it.each([
    "이렇게 말해 보세요. 저희는 2주 동안 시범 운영했습니다.",
    "이렇게 말해 보세요: 저희는 2주 동안 시범 운영했습니다.",
    "이렇게 말해 보기: 저희는 2주 동안 시범 운영했습니다.",
    "  이렇게 말해 보세요 —  저희는 2주 동안 시범 운영했습니다.",
  ])("removes the lead-in from an improvement (%s)", (tryThis) => {
    expect(withTry(tryThis)[0].tryThis).toBe("저희는 2주 동안 시범 운영했습니다.");
  });

  it("keeps the words when they are part of the sentence itself", () => {
    expect(withTry("첫 문장을 이렇게 말해 보세요.")[0].tryThis).toBe("첫 문장을 이렇게 말해 보세요.");
  });

  it("drops an improvement whose try-this is only the lead-in", () => {
    expect(withTry("이렇게 말해 보세요.")).toHaveLength(2);
  });

  it("removes the lead-in from answer feedback before keeping one sentence", () => {
    const found = normalizeAnswerFeedback({
      evaluations: [
        {
          questionNumber: 1,
          verdict: "보완 필요",
          wentWell: "숫자를 댔어요.",
          missing: "출처가 빠졌어요.",
          tryThis: "이렇게 말해 보세요. 출처는 학과 설문입니다. 둘째 문장.",
        },
      ],
    })!;
    expect(found.get(1)?.tryThis).toBe("출처는 학과 설문입니다.");
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

describe("tryThisGuidance: try-this lines must be words the speaker can say", () => {
  it.each([
    "시범 운영 전과 후에 실제로 잰 음식물 쓰레기 양을 숫자로 넣어서, 2주 동안 얼마에서 얼마로 줄었다고 말해 보세요.",
    "이 문장에 실제로 줄어든 양을 숫자로 넣어 보세요.",
    "혜택이 아까워서라고 답한 사람의 실제 비율을 숫자로 넣고, 이렇게 말해 보세요. 이 응답은 손실 회피와 잘 맞습니다.",
    "그리고 이렇게 덧붙여 보세요. 우리 학과 설문 평균을 전국에 적용한 어림값입니다.",
    "전자 교재를 쓰는 과목을 뺀 학생만 따로 봐도 구매비가 줄었는지 확인해 보세요.",
    "기술 용어는 줄이고 이렇게 하는 일로 말해 보세요.",
  ])("finds instructions in %s", (text) => {
    expect(tryThisGuidance(text)).toBe(true);
  });

  it.each([
    "시범 운영 2주 동안 음식물 쓰레기가 앱을 쓰기 전보다 줄었습니다.",
    "여러분도 지금 휴대폰을 열어 보세요.",
    "두 구만 비교한 결과라서 쉼터가 환자를 줄였다고 단정하지는 못합니다.",
  ])("leaves a sentence to say alone: %s", (text) => {
    expect(tryThisGuidance(text)).toBe(false);
  });

  it("counts the improvements whose try-this has instructions", () => {
    const raw = fullRaw();
    raw.improvements[0].tryThis = "숫자를 넣어 말해 보세요.";
    raw.improvements[2].tryThis = "출처를 덧붙여 보세요.";
    expect(guidanceCount(normalizeReview(raw)!)).toBe(2);
    expect(guidanceCount(normalizeReview(fullRaw())!)).toBe(0);
  });
});

describe("chooseReview: retry once when a try-this has instructions", () => {
  const clean = normalizeReview(fullRaw())!;
  const guided = { ...clean, improvements: clean.improvements.map((i) => ({ ...i, tryThis: "숫자를 넣어 말해 보세요." })) };
  const oneGuided = { ...clean, improvements: [guided.improvements[0], ...clean.improvements.slice(1)] };

  it("uses a complete retry with fewer instructions", () => {
    expect(chooseReview(guided, clean)).toBe(clean);
    expect(chooseReview(guided, oneGuided)).toBe(oneGuided);
  });

  it("keeps the complete first review when the retry is no better or is short", () => {
    expect(chooseReview(oneGuided, guided)).toBe(oneGuided);
    expect(chooseReview(oneGuided, { ...clean, improvements: clean.improvements.slice(0, 1) })).toBe(oneGuided);
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
      { type: "다른 설명", question: "질문 2" },
      { type: "개념과 범위", question: "질문 3" },
    ]);
  });
});

describe("inputError", () => {
  it("accepts a script and a limit between 10 seconds and 60 minutes", () => {
    expect(inputError("대본이에요.", 180)).toBeNull();
    expect(inputError("대본이에요.", 10)).toBeNull();
    expect(inputError("대본이에요.", 3600)).toBeNull();
  });

  it.each([
    ["", 180, "대본을 입력해 주세요."],
    ["  \n ", 180, "대본을 입력해 주세요."],
    ["가".repeat(20001), 180, "대본이 너무 길어요. 2만 자 이하로 줄여 주세요."],
    ["대본이에요.", 5, "제한 시간을 10초에서 60분 사이로 입력해 주세요."],
    ["대본이에요.", 3601, "제한 시간을 10초에서 60분 사이로 입력해 주세요."],
    ["대본이에요.", Number.NaN, "제한 시간을 10초에서 60분 사이로 입력해 주세요."],
    ["대본이에요.", "120", "제한 시간을 10초에서 60분 사이로 입력해 주세요."],
  ])("explains what to fix in the app's own words (%#)", (script, limit, message) => {
    expect(inputError(script, limit)).toBe(message);
  });

  it("counts the length after trimming", () => {
    expect(inputError(` ${"가".repeat(20000)} `, 180)).toBeNull();
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

describe("normalizeAnswerFeedback", () => {
  const item = (questionNumber: unknown, extra: Record<string, unknown> = {}) => ({
    questionNumber,
    verdict: "보완 필요",
    wentWell: "숫자를 댔어요.",
    missing: "출처가 빠졌어요.",
    tryThis: "조사 시점을 함께 말해 보세요.",
    ...extra,
  });

  it("returns null when the response has no list of evaluations", () => {
    expect(normalizeAnswerFeedback(null)).toBeNull();
    expect(normalizeAnswerFeedback({ evaluations: "없음" })).toBeNull();
  });

  it("keys each result by its question number", () => {
    const found = normalizeAnswerFeedback({ evaluations: [item(3), item(1)] })!;
    expect([...found.keys()].sort()).toEqual([1, 3]);
    expect(found.get(1)).toEqual({
      verdict: "보완 필요",
      wentWell: "숫자를 댔어요.",
      missing: "출처가 빠졌어요.",
      tryThis: "조사 시점을 함께 말해 보세요.",
    });
  });

  it("drops results with an unknown verdict, a bad number, or an empty field", () => {
    const found = normalizeAnswerFeedback({
      evaluations: [item(1, { verdict: "훌륭함" }), item(0), item(1.5), item("2"), item(3, { missing: " " })],
    })!;
    expect(found.size).toBe(0);
  });

  it("keeps the first result when a question number repeats", () => {
    const found = normalizeAnswerFeedback({ evaluations: [item(1), item(1, { verdict: "좋음" })] })!;
    expect(found.get(1)?.verdict).toBe("보완 필요");
  });

  it("keeps one sentence per field and removes markdown", () => {
    const found = normalizeAnswerFeedback({
      evaluations: [item(1, { wentWell: "**숫자**를 댔어요. 출처도 좋아요.", tryThis: "조사 시점을 말해 보세요. 그리고 하나 더." })],
    })!;
    expect(found.get(1)?.wentWell).toBe("숫자를 댔어요.");
    expect(found.get(1)?.tryThis).toBe("조사 시점을 말해 보세요.");
  });
});

describe("answerEvaluations", () => {
  const feedback = { verdict: "좋음" as const, wentWell: "a.", missing: "b.", tryThis: "c." };

  it("marks skipped, evaluated, and missing questions in order", () => {
    const found = new Map([[1, feedback]]);
    expect(answerEvaluations(["답", "  ", "답"], found)).toEqual([
      { status: "evaluated", feedback },
      { status: "skipped" },
      { status: "missing" },
    ]);
  });

  it("ignores a result for a skipped question", () => {
    expect(answerEvaluations([""], new Map([[1, feedback]]))).toEqual([{ status: "skipped" }]);
  });

  it("says how many results are missing", () => {
    expect(missingAnswerMessage(2)).toBe("답변 평가를 2개 받지 못했어요");
  });
});

describe("final screen labels", () => {
  const feedback = (verdict: "좋음" | "보완 필요" | "부족") => ({
    verdict,
    wentWell: "숫자를 댔어요.",
    missing: "출처가 빠졌어요.",
    tryThis: "출처를 함께 말해 보세요.",
  });

  it("shows the verdict, or why there is none", () => {
    expect(evaluationLabel({ status: "evaluated", feedback: feedback("보완 필요") })).toBe("보완 필요");
    expect(evaluationLabel({ status: "skipped" })).toBe("답하지 않음");
    expect(evaluationLabel({ status: "missing" })).toBe("평가를 받지 못했어요");
  });

  it("lists the three feedback sentences in order with their labels", () => {
    expect(feedbackLines(feedback("부족"))).toEqual([
      { label: "좋았던 점", text: "숫자를 댔어요." },
      { label: "빠진 점", text: "출처가 빠졌어요." },
      { label: "이렇게 말해 보기", text: "출처를 함께 말해 보세요." },
    ]);
  });

  it("calls the second sentence a way to do better when the answer was good", () => {
    expect(feedbackLines(feedback("좋음"))[1].label).toBe("더 좋게 할 점");
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
