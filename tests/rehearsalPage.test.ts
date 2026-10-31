import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DraftProvider from "@/app/DraftProvider";
import PracticeProvider, { type PracticeSession } from "@/app/PracticeProvider";
import PracticePage from "@/app/practice/page";
import RehearsalPage from "@/app/rehearsal/page";
import RehearsalProvider, { type KeptRehearsal } from "@/app/RehearsalProvider";
import { SITE_PAGES } from "@/app/siteNav";
import type { VoiceRecord } from "@/lib/deliveryScore";
import { finishRehearsal } from "@/lib/rehearsalResult";
import type { CheckedReview } from "@/lib/types";

// v1.1 step 5 (1): the rehearsal gets its own page, linked from the menu. Its last result stays
// while the visitor moves between pages; question practice keeps working on its own.

const SCRIPT = "학교 급식이 많이 남아요. 그래서 설문을 해 봤어요. 결과가 아주 놀라웠어요. 다음엔 더 오래 해 볼게요.";
const DRAFT = { script: SCRIPT, topic: "급식", audience: "1학년", limitMinutes: "1" };

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

const KEPT: KeptRehearsal = {
  outcome: finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation: null }, true),
  coach: { name: "none" },
};

function renderRehearsal(kept: KeptRehearsal | null = null, draft = DRAFT): string {
  return renderToStaticMarkup(
    createElement(
      DraftProvider,
      { initial: draft },
      createElement(PracticeProvider, null, createElement(RehearsalProvider, { initial: kept }, createElement(RehearsalPage))),
    ),
  );
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, "").trim());
}

function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map(([, href, inner]) => ({
    href,
    text: inner.replace(/<[^>]+>/g, ""),
  }));
}

describe("rehearsal page in the menu", () => {
  it("is ready, so the header, footer, and intro link to it", () => {
    expect(SITE_PAGES.find((p) => p.href === "/rehearsal")?.ready).toBe(true);
  });
});

describe("rehearsal page, before starting", () => {
  const html = renderRehearsal();

  it("is titled 리허설", () => {
    expect(html).toMatch(/<h1[^>]*>리허설<\/h1>/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("has the same input box as question practice, filled with the shared inputs", () => {
    expect(html).toContain(`>${SCRIPT}</textarea>`);
    expect(html).toContain(`value="${DRAFT.topic}"`);
    expect(html).toContain(`value="${DRAFT.audience}"`);
    expect(html).toMatch(/type="number"[^>]*value="1"/);
  });

  it("starts with the camera choice and the start button, and no 처음으로 yet", () => {
    expect(buttons(html)).toEqual(["카메라 켜기", "리허설 시작"]);
  });

  it("keeps the camera and recording notices", () => {
    expect(text(html)).toContain("카메라 영상은 저장하지 않고 브라우저 밖으로 보내지 않아요");
    expect(text(html)).toContain("저장하지 않");
  });
});

describe("rehearsal result kept across pages", () => {
  const html = renderRehearsal(KEPT);

  it("shows the last result when the visitor comes back", () => {
    expect(text(html)).toContain("말투 점수");
    // Since v1.1 step 5, 처음으로 is 대본 고치기 (tests/rehearsalAgain.test.ts).
    expect(buttons(html)).toEqual(["다시 리허설", "대본 고치기"]);
  });

  it("hides the input box while the result is shown", () => {
    expect(html).not.toContain("<textarea");
  });

  it("lives in the layout and keeps only result numbers and coach feedback, in browser memory", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toMatch(/<RehearsalProvider>[\s\S]*\{children\}[\s\S]*<\/RehearsalProvider>/);
    const source = readFileSync("src/app/RehearsalProvider.tsx", "utf8");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|document\.cookie/);
    // No voice record, face frames, or dictated text: only the computed outcome and the coach's reply.
    expect(source).not.toMatch(/VoiceRecord|FaceFrame|DictationRecord|RehearsalInput/);
  });

  it("never clears question practice: the result buttons only go back to the rehearsal start", () => {
    const source = readFileSync("src/app/rehearsal/page.tsx", "utf8");
    expect(source).not.toMatch(/setPrepared|setAnswers|usePractice/);
  });
});

describe("question practice without the rehearsal", () => {
  const REVIEW: CheckedReview = {
    summary: "흐름은 분명해요.",
    strengths: [],
    improvements: [],
    questions: [
      { type: "근거", quote: "많이 남아요.", question: "얼마나 남나요?", goodAnswer: "숫자", avoidAnswer: "느낌", quoteFound: true },
      { type: "다른 설명", quote: "많이 남아요.", question: "다른 이유는요?", goodAnswer: "배제", avoidAnswer: "아니요", quoteFound: true },
      { type: "개념과 범위", quote: "많이 남아요.", question: "많이는 얼마인가요?", goodAnswer: "범위", avoidAnswer: "전부", quoteFound: true },
    ],
  };
  const NOTICE = "대본이 바뀌었어요. 새 대본으로 질문을 다시 받을 수 있어요";

  function renderPractice(session: PracticeSession, script: string): string {
    return renderToStaticMarkup(
      createElement(
        DraftProvider,
        { initial: { ...DRAFT, script } },
        createElement(PracticeProvider, { initial: session }, createElement(PracticePage)),
      ),
    );
  }

  const session = (script: string): PracticeSession => ({
    phase: { name: "practice", index: 0 },
    prepared: { review: REVIEW, notices: [], estimatedSeconds: 30, script },
    answers: ["급식실에서 쟀어요.", "", ""],
  });

  it("goes to the rehearsal page from 리허설 하기", () => {
    const html = renderPractice({ phase: { name: "input", error: null }, prepared: null, answers: [] }, SCRIPT);
    expect(buttons(html)).toEqual(["질문 받기"]);
    expect(links(html)).toContainEqual({ href: "/rehearsal", text: "리허설 하기" });
  });

  it("no longer runs the rehearsal itself", () => {
    const source = readFileSync("src/app/practice/page.tsx", "utf8");
    expect(source).not.toMatch(/voiceTracker|faceTracker|function Rehearsal\b/);
  });

  it("says the script changed, keeping the questions and answers from the old one", () => {
    const html = renderPractice(session(SCRIPT), `${SCRIPT} 감사합니다.`);
    expect(text(html)).toContain(NOTICE);
    expect(html).toMatch(/<h2[^>]*>얼마나 남나요\?<\/h2>/);
    expect(html).toContain(">급식실에서 쟀어요.</textarea>");
  });

  it("also says it on the final evaluation", () => {
    const html = renderPractice(
      { ...session(SCRIPT), phase: { name: "result", evaluations: [{ status: "skipped" }, { status: "skipped" }, { status: "skipped" }], notices: [] } },
      `${SCRIPT} 감사합니다.`,
    );
    expect(text(html)).toContain(NOTICE);
  });

  it("says nothing when the script is the same", () => {
    expect(text(renderPractice(session(SCRIPT), SCRIPT))).not.toContain(NOTICE);
  });
});
