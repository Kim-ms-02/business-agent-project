import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FaqPage from "@/app/faq/page";
import { SITE_PAGES } from "@/app/siteNav";
import { FACE_PRACTICE_NOTICE } from "@/lib/faceScore";
import { UNVERIFIED_NUMBER_NOTE } from "@/lib/validate";

// v1.1 step 6: the FAQ page. Answers follow what the app does and what was checked, never more
// (CLAUDE.md "시안 문구 고치기").

const html = renderToStaticMarkup(createElement(FaqPage));

function items(): { question: string; answer: string; open: boolean }[] {
  return [...html.matchAll(/<details([^>]*)><summary[^>]*>(.*?)<\/summary>(.*?)<\/details>/g)].map(([, attrs, q, a]) => ({
    question: q.replace(/<[^>]+>/g, ""),
    answer: a
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, " ")
      .trim(),
    open: /\sopen=""/.test(attrs),
  }));
}

describe("FAQ page", () => {
  it("is ready in the menu", () => {
    expect(SITE_PAGES.find((p) => p.href === "/faq")?.ready).toBe(true);
  });

  it("is titled 자주 묻는 질문", () => {
    expect(html).toMatch(/<h1[^>]*>자주 묻는 질문<\/h1>/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("asks the mockup's five questions, in order", () => {
    expect(items().map((i) => i.question)).toEqual([
      "녹음이나 영상이 저장되나요?",
      "카메라 없이도 쓸 수 있나요?",
      "점수는 어떻게 매기나요?",
      "어떤 브라우저에서 되나요?",
      "면접 연습도 되나요?",
    ]);
  });

  it("says what is sent where, including Claude API", () => {
    const answer = items()[0].answer;
    expect(answer).toContain("저장하지 않아요");
    expect(answer).toContain("목소리가 구글 서버로 전송돼요");
    expect(answer).toContain("대본·주제·듣는 사람, 답변 글, 점수 숫자와 문장별 표시");
    expect(answer).toContain("Claude API");
  });

  it("says the camera off also drops the low-gaze sentences", () => {
    expect(items()[1].answer).toBe(
      "네. 카메라는 선택이에요. 끄면 얼굴 행동 점수와 시선이 낮았던 문장 표시만 빠지고, 질문 연습과 말투 점수는 그대로 나와요.",
    );
  });

  it("says the code checks the coach's numbers instead of promising the coach never adds one", () => {
    const answer = items()[2].answer;
    expect(answer).toContain("정해 둔 기준표로 코드가 계산해요");
    expect(answer).toContain(UNVERIFIED_NUMBER_NOTE);
    expect(answer).toContain("설계 값");
    expect(answer).toContain(FACE_PRACTICE_NOTICE);
    expect(answer).not.toContain("숫자만 근거로");
  });

  it("uses the fixed browser and interview answers", () => {
    expect(items()[3].answer).toBe(
      "리허설 받아쓰기는 크롬·엣지에서만 켤 수 있어요. 받아쓰기가 안 되는 브라우저에서는 글로 답할 수 있어요.",
    );
    expect(items()[4].answer).toBe("지금은 발표와 질의응답만 다뤄요.");
  });

  it.each(["다음 버전", "준비하고 있어요", "권장해요"])("drops the mockup words %s", (words) => {
    expect(html).not.toContain(words);
  });

  it("opens with the first answer shown, and every question opens from the keyboard", () => {
    expect(items().map((i) => i.open)).toEqual([true, false, false, false, false]);
    // <summary> inside <details> is focusable and opens with Enter or Space without any script.
    expect(html.match(/<details[^>]*><summary/g)).toHaveLength(5);
    expect(html).not.toMatch(/tabindex="-1"|<summary[^>]*onClick/i);
  });
});
