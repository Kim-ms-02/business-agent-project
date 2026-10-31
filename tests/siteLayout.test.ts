import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DraftProvider from "@/app/DraftProvider";
import Home from "@/app/page";
import PracticePage from "@/app/practice/page";
import SiteFooter from "@/app/SiteFooter";
import { SiteNavBar } from "@/app/SiteHeader";
import { SITE_PAGES } from "@/app/siteNav";

// v1.1 step 2: the site header and footer, and the inputs shared across pages.

function links(html: string): { href: string; text: string; current: boolean }[] {
  return [...html.matchAll(/<a([^>]*)>(.*?)<\/a>/g)].map(([, attrs, inner]) => ({
    href: attrs.match(/href="([^"]*)"/)?.[1] ?? "",
    text: inner.replace(/<[^>]+>/g, ""),
    current: attrs.includes('aria-current="page"'),
  }));
}

describe("site pages", () => {
  it("lists the four menu pages in order", () => {
    expect(SITE_PAGES.map((p) => [p.href, p.label])).toEqual([
      ["/", "소개"],
      ["/practice", "질문 연습"],
      ["/rehearsal", "리허설"],
      ["/faq", "자주 묻는 질문"],
    ]);
  });
});

describe("SiteNavBar", () => {
  const html = renderToStaticMarkup(createElement(SiteNavBar, { current: "/practice" }));
  const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));

  it("links only the pages that are ready, so the menu never leads to a missing page", () => {
    const ready = SITE_PAGES.filter((p) => p.ready);
    expect(links(nav).map((l) => [l.href, l.text])).toEqual(ready.map((p) => [p.href, p.label]));
  });

  it("marks the page being shown", () => {
    expect(links(nav).filter((l) => l.current).map((l) => l.text)).toEqual(["질문 연습"]);
  });

  it("has the brand link home and a start button to question practice", () => {
    expect(links(html)).toContainEqual({ href: "/", text: "발표 코치", current: false });
    expect(links(html)).toContainEqual({ href: "/practice", text: "대본 넣고 시작", current: false });
    expect(html).not.toContain("결과 예시");
  });

  it("has a skip link to the page content", () => {
    expect(links(html)[0]).toMatchObject({ href: "#content", text: "본문으로 건너뛰기" });
  });
});

describe("SiteFooter", () => {
  const html = renderToStaticMarkup(createElement(SiteFooter));

  it("says the app only helps practice and people judge the results", () => {
    expect(html).toContain("연습을 돕는 도구예요. 평가 내용이 맞는지는 직접 판단해 주세요.");
    expect(html).toContain("기준선은 설계 값이에요");
    expect(html).toContain("얼굴 행동 점수는 연습용 참고 점수예요");
  });

  it("links only pages that are ready, and has no repository or version links", () => {
    // The home address always opens something (question practice until the intro page is built).
    const ready = new Set(["/", ...SITE_PAGES.filter((p) => p.ready).map((p) => p.href)]);
    for (const link of links(html)) expect(ready.has(link.href), link.href).toBe(true);
    expect(html).not.toContain("GitHub");
    expect(html).not.toContain("버전 기록");
  });
});

describe("shared inputs", () => {
  const draft = { script: "안녕하세요 저희 팀은 급식 앱을 만들었어요.", topic: "급식 앱", audience: "1학년", limitMinutes: "2" };

  it("shows the shared script, topic, audience, and time limit on the practice page", () => {
    const html = renderToStaticMarkup(createElement(DraftProvider, { initial: draft }, createElement(PracticePage)));
    expect(html).toContain(`>${draft.script}</textarea>`);
    expect(html).toContain(`value="${draft.topic}"`);
    expect(html).toContain(`value="${draft.audience}"`);
    expect(html).toMatch(/type="number"[^>]*value="2"/);
  });

  it("keeps the inputs in the layout, which stays while pages change", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toMatch(/<DraftProvider>[\s\S]*<SiteHeader \/>[\s\S]*\{children\}[\s\S]*<SiteFooter \/>[\s\S]*<\/DraftProvider>/);
  });

  it("keeps them only in browser memory", () => {
    const source = readFileSync("src/app/DraftProvider.tsx", "utf8");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|document\.cookie/);
  });
});

describe("home address", () => {
  it("shows the intro page instead of sending visitors to question practice", () => {
    expect(() => Home()).not.toThrow();
  });
});
