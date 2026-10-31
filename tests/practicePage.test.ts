import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DraftProvider from "@/app/DraftProvider";
import PracticeProvider, { type PracticeSession } from "@/app/PracticeProvider";
import PracticePage from "@/app/practice/page";
import type { CheckedReview } from "@/lib/types";

// v1.1 step 4: the question practice page. The questions, answers, and results stay in the site
// layout, so leaving the page and coming back keeps them.

const REVIEW: CheckedReview = {
  summary: "흐름은 분명하지만 근거가 약해요.",
  strengths: [
    { criterion: "흐름", quote: "안녕하세요.", why: "인사가 짧아요.", quoteFound: true },
    { criterion: "분명한 말", quote: "급식이 남아요.", why: "문제가 분명해요.", quoteFound: true },
  ],
  improvements: [
    { criterion: "근거", quote: "많이 줄었어요.", problem: "숫자가 없어요.", tryThis: "40%에서 20%로 줄었어요.", quoteFound: true },
    { criterion: "근거", quote: "모두 좋아했어요.", problem: "누가 좋아했는지 없어요.", tryThis: "120명 중 90명이 좋다고 했어요.", quoteFound: false },
    { criterion: "흐름", quote: "감사합니다.", problem: "마무리 한 줄이 없어요.", tryThis: "남김없이 먹는 학교를 만들어요.", quoteFound: true },
  ],
  questions: [
    { type: "근거", quote: "많이 줄었어요.", question: "얼마나 줄었는지 어떻게 재셨나요?", goodAnswer: "잰 방법", avoidAnswer: "느낌", quoteFound: true },
    { type: "다른 설명", quote: "많이 줄었어요.", question: "방학 때문일 수는 없나요?", goodAnswer: "다른 이유 배제", avoidAnswer: "아니요", quoteFound: true },
    { type: "개념과 범위", quote: "모두 좋아했어요.", question: "모두는 누구를 말하나요?", goodAnswer: "대상 범위", avoidAnswer: "전부", quoteFound: true },
  ],
};

const PREPARED = { review: REVIEW, notices: [], estimatedSeconds: 60, script: "" };
const ANSWERS = ["저울로 쟀어요.", "방학 전 2주만 비교했어요.", ""];

function render(session: PracticeSession): string {
  return renderToStaticMarkup(
    createElement(DraftProvider, null, createElement(PracticeProvider, { initial: session }, createElement(PracticePage))),
  );
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, "").trim());
}

describe("question practice page", () => {
  it("is titled 질문 연습", () => {
    const html = render({ phase: { name: "input", error: null }, prepared: null, answers: [] });
    expect(html).toMatch(/<h1[^>]*>질문 연습<\/h1>/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  // Since v1.1 step 5, 리허설 하기 is a link to the rehearsal page (tests/rehearsalPage.test.ts).
  it("keeps the input form and its two actions", () => {
    const html = render({ phase: { name: "input", error: null }, prepared: null, answers: [] });
    expect(buttons(html)).toEqual(["질문 받기"]);
    expect(html).toMatch(/<a[^>]*href="\/rehearsal"[^>]*>리허설 하기<\/a>/);
  });

  // 리허설 하기 is a link, which sits inline and is underlined unless its style says otherwise.
  it("draws the 리허설 하기 link in the same button shape as 질문 받기", () => {
    const css = readFileSync("src/app/practice/page.module.css", "utf8");
    const shared = css.match(/\.primary,\s*\.secondary,\s*\.stageButton\s*\{([^}]*)\}/);
    expect(shared).not.toBeNull();
    expect(shared![1]).toMatch(/display:\s*inline-flex/);
    expect(shared![1]).toMatch(/align-items:\s*center/);
    expect(shared![1]).toMatch(/justify-content:\s*center/);
    expect(shared![1]).toMatch(/text-decoration:\s*none/);
  });
});

describe("one question at a time", () => {
  const html = render({ phase: { name: "practice", index: 1 }, prepared: PREPARED, answers: ANSWERS });

  it("shows the question number with its type, in words", () => {
    expect(text(html)).toContain("질문 2 / 3 · 다른 설명");
  });

  it("shows progress as a bar that also says the number", () => {
    const bar = html.match(/<div[^>]*aria-label="질문 2 \/ 3"[^>]*>(.*?)<\/div>/);
    expect(bar).not.toBeNull();
    expect(bar![1].match(/<i/g)).toHaveLength(3);
  });

  it("shows the question as a heading and the answer kept for it", () => {
    expect(html).toMatch(/<h2[^>]*>방학 때문일 수는 없나요\?<\/h2>/);
    expect(html).toContain(`>${ANSWERS[1]}</textarea>`);
  });

  it("keeps the button names", () => {
    expect(buttons(html)).toEqual(["다시 듣기", "다시 답하기", "다음 질문", "처음으로"]);
  });

  it("says 평가 받기 on the last question", () => {
    const last = render({ phase: { name: "practice", index: 2 }, prepared: PREPARED, answers: ANSWERS });
    expect(buttons(last)).toContain("평가 받기");
    expect(text(last)).toContain("질문 3 / 3 · 개념과 범위");
  });
});

describe("final evaluation", () => {
  const html = render({
    phase: { name: "result", evaluations: [{ status: "skipped" }, { status: "skipped" }, { status: "skipped" }], notices: [] },
    prepared: PREPARED,
    answers: ANSWERS,
  });

  it("keeps both parts, the yellow quote note, and the reference notice", () => {
    expect(html).toMatch(/<h2[^>]*>대본 평가<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>답변 평가<\/h2>/);
    expect(text(html)).toContain("대본에서 찾지 못한 문장이에요. 대본과 비교해 확인해 주세요.");
    expect(text(html)).toContain("이 평가는 연습을 돕는 참고 의견이에요. 맞는지는 직접 판단해 주세요.");
    expect(text(html)).toContain("이렇게 말해 보기");
  });
});

describe("practice kept across pages", () => {
  it("lives in the layout, next to the shared inputs", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toMatch(/<DraftProvider>\s*<PracticeProvider>[\s\S]*\{children\}[\s\S]*<\/PracticeProvider>\s*<\/DraftProvider>/);
  });

  it("is kept only in browser memory", () => {
    const source = readFileSync("src/app/PracticeProvider.tsx", "utf8");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|document\.cookie/);
  });
});
