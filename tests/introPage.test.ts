import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";
import { SITE_PAGES } from "@/app/siteNav";
import { QUESTION_COUNT } from "@/lib/coachConfig";
import { QUESTION_TYPES, VERDICTS } from "@/lib/types";

// v1.1 step 3: the intro page at /. The mockup's words are fixed where they did not match the app
// (CLAUDE.md "시안 문구 고치기").

const html = renderToStaticMarkup(createElement(Home));

// Visible text with tags removed and HTML entities turned back into characters.
const text = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

function links(): { href: string; text: string }[] {
  return [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map(([, href, inner]) => ({
    href,
    text: inner.replace(/<[^>]+>/g, ""),
  }));
}

describe("intro page wording", () => {
  it("uses the fixed wording that matches the app", () => {
    expect(text).toContain("질문 준비에 30~50초쯤 걸려요");
    expect(text).toContain("리허설 결과는 '가장 먼저 고칠 한 가지'부터 보여 줘요");
    expect(text).toContain("대본 하나로 두 가지를 연습해요");
    expect(text).toContain("카메라를 켜면 시선이 낮았던 문장도");
    expect(text).toContain("대본·주제·듣는 사람, 답변 글, 점수 숫자와 문장별 표시");
  });

  // v1.0 check: "출처 없는 숫자" was the weakness missed most often, so the card does not promise to catch it.
  it("does not promise to catch numbers without a source", () => {
    expect(text).toContain("근거 없는 주장, 출처 없는 숫자를 질문으로 미리 받아 볼 수 있어요.");
    expect(text).not.toContain("숫자를 질문으로 미리 짚어요");
  });

  // v0.3 video check passed only in part (looking down still counted as looking at the screen),
  // so gaze is offered as a reference only.
  it("offers low-gaze sentences as a reference only", () => {
    expect(text.match(/카메라를 켜면 시선이 낮았던 문장도 참고로 알려 줘요/g)).toHaveLength(2);
    expect(text).toContain("화면을 본 시간, 시선이 낮았던 문장 (참고용)");
    expect(text).not.toMatch(/시선이 낮았던 문장도 짚어/);
  });

  // Without dictation the sentence is estimated from time, and v0.4 check is not done yet.
  it("says pauses are placed at about which sentence", () => {
    expect(text).toContain("어느 문장쯤에서 멈췄는지");
    expect(text).toContain("3초 넘게 멈춘 곳과 대략의 문장");
    expect(text).not.toContain("어느 문장에서 멈췄는지");
  });

  // The code checks again; it cannot promise Claude never writes such things.
  it("says the code checks again instead of promising none", () => {
    expect(text).toContain('“긴장해 보여요” 같은 판단은 쓰지 않도록 코드가 한 번 더 검사해요.');
  });

  it("offers the graduation card as questions to receive", () => {
    expect(text).toContain("결론이 근거보다 넓어진 곳을 질문으로 받아 볼 수 있어요.");
    expect(text).not.toContain("범위를 좁혀요");
  });

  it("keeps the weak-spot question wording", () => {
    expect(text).toContain("대본의 약한 곳을 겨냥한 질문");
  });

  it.each([
    ["the one-minute claim", "1분이면"],
    ["three rounds of practice", "세 번 연습"],
    ["'every result' first-fix claim", "매번"],
    ["reading only the script, which the app cannot see", "대본만 보고"],
    ["the interview card", "면접 답변"],
    ["'coming soon'", "준비 중"],
    ["'next version'", "다음 버전"],
    ["a rehearsal round count", "회차"],
    ["the mockup notice", "디자인 시안"],
    ["the result example link", "결과 예시"],
  ])("drops %s", (_, words) => {
    expect(text).not.toContain(words);
  });

  it("follows the app's numbers and names", () => {
    expect(text).toContain(`질문 ${QUESTION_COUNT}개`);
    for (const type of QUESTION_TYPES) expect(text).toContain(type);
    expect(text).toContain(VERDICTS.join(" · "));
    expect(text).toContain("분당 250~330음절");
  });

  it("keeps the privacy notes: recordings stay in the browser, dictation goes to Google", () => {
    expect(text).toContain("리허설 소리와 카메라 영상");
    expect(text).toContain("저장하지 않고 브라우저 밖으로 보내지 않아요");
    expect(text).toContain("받아쓰기를 위해 목소리가 구글 서버로 전송돼요. 이 앱은 녹음을 저장하지 않아요.");
    expect(text).toContain("영상, 사진, 소리는 보내지 않아요");
  });

  it("labels the marked-up script picture as an example", () => {
    expect(html).toMatch(/<figure[^>]*aria-label="[^"]*예시[^"]*"/);
    expect(text).toMatch(/예시 · 대본/);
  });

  it("has one page title", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
});

describe("intro page links", () => {
  it("starts question practice from the hero and the closing block", () => {
    const starts = links().filter((l) => l.text === "질문 연습 시작");
    expect(starts.length).toBe(2);
    for (const link of starts) expect(link.href).toBe("/practice");
  });

  it("links only pages that are ready", () => {
    const ready = new Set(SITE_PAGES.filter((p) => p.ready).map((p) => p.href));
    for (const link of links()) expect(ready.has(link.href), link.href).toBe(true);
  });

  it("is ready in the menu itself", () => {
    expect(SITE_PAGES.find((p) => p.href === "/")?.ready).toBe(true);
  });
});
