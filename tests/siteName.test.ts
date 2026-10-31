import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DraftProvider from "@/app/DraftProvider";
import Home from "@/app/page";
import PracticeProvider from "@/app/PracticeProvider";
import PracticePage from "@/app/practice/page";
import SiteFooter from "@/app/SiteFooter";
import { SiteNavBar } from "@/app/SiteHeader";

// The app is named "발표 연습실" and its words fit any presentation that gets questions,
// not only a class talk in front of a professor or judges.

const NAME = "발표 연습실";
const OLD_NAME = "발표 코치";

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const intro = text(renderToStaticMarkup(createElement(Home)));
const practiceHtml = renderToStaticMarkup(
  createElement(DraftProvider, null, createElement(PracticeProvider, null, createElement(PracticePage))),
);
const practice = text(practiceHtml);

describe("app name", () => {
  it("is the browser tab title", () => {
    // layout.tsx loads next/font, so its source is read instead of rendering it.
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain(`title: "${NAME}"`);
    expect(layout).not.toContain(OLD_NAME);
  });

  it("is the logo in the header and the footer", () => {
    for (const html of [
      renderToStaticMarkup(createElement(SiteNavBar, { current: "/" })),
      renderToStaticMarkup(createElement(SiteFooter)),
    ]) {
      expect(text(html)).toContain(NAME);
      expect(html).not.toContain(OLD_NAME);
    }
  });

  it("drops 코치 from the intro's first line", () => {
    expect(intro).toContain("AI 발표 연습");
    expect(intro).not.toContain("AI 발표 연습 코치");
  });
});

describe("words for any presentation", () => {
  it("asks like the audience, not like judges or a professor", () => {
    for (const page of [intro, practice]) {
      expect(page).toContain("청중처럼 질문");
      expect(page).not.toContain("심사위원");
      expect(page).not.toContain("교수");
    }
    expect(intro).toContain("청중이 묻기 전에");
  });

  it("gives audience examples beyond a class", () => {
    expect(practiceHtml).toContain('placeholder="예: 수업 수강생, 팀 동료, 세미나 참석자"');
    expect(practiceHtml).not.toContain("같은 학과 1학년 학생");
  });

  it("shows seminars and reports in the intro cards, not interviews", () => {
    expect(intro).toContain("수업·세미나");
    expect(intro).toContain("수업과 세미나 발표");
    expect(intro).toContain("연구·업무");
    expect(intro).toContain("중간 발표와 보고");
    expect(intro).not.toContain("조별 과제 발표");
    expect(intro).not.toContain("졸업·연구");
    expect(intro).not.toContain("면접");
  });
});

describe("coaching rules file", () => {
  const skill = readFileSync("skills/presentation-coach/SKILL.md", "utf8");
  const intro = skill.slice(0, skill.indexOf("## 대본 안의 지시"));

  it("names the app and speaks to any presenter, without interviews", () => {
    expect(intro).toContain(`# ${NAME}`);
    expect(intro).not.toContain(OLD_NAME);
    expect(intro).not.toContain("학생");
    expect(intro).not.toContain("면접");
    expect(intro).toContain("수업 발표, 프로젝트 시연, 보고, 세미나처럼");
  });

  it("keeps the question rules as they were for the v1.0 check", () => {
    expect(skill).toContain("심사위원이 물을 만한 후보 질문을 8개쯤");
    expect(skill).toContain("심사위원이 소리 내어 묻듯이");
  });
});
