import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DevPanel from "@/app/DevPanel";

// The three development panels (microphone, camera, dictation) sit in one corner box, so they no
// longer cover the page's buttons at about 1000px wide.

const TABS = [
  { id: "mic", label: "마이크", content: createElement("p", null, "마이크 내용") },
  { id: "camera", label: "카메라", content: createElement("p", null, "카메라 내용") },
  { id: "dictation", label: "받아쓰기", content: createElement("p", null, "받아쓰기 내용") },
];

function render(props: { initialOpen?: boolean } = {}) {
  return renderToStaticMarkup(createElement(DevPanel, { tabs: TABS, ...props }));
}

// The tab panel element for one tab, from its opening tag to its closing tag.
function tabPanel(html: string, id: string): string {
  const match = html.match(new RegExp(`<div[^>]*id="dev-panel-${id}"[^>]*>.*?</div>`));
  if (!match) throw new Error(`no tab panel for ${id}`);
  return match[0];
}

describe("DevPanel", () => {
  it("is one corner box labeled 개발용, folded by default", () => {
    const html = render();
    expect(html.match(/<aside/g)).toHaveLength(1);
    expect(html).toContain('aria-label="개발용"');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>개발용<\/button>/);
    expect(html).not.toContain('role="tablist"');
  });

  it("keeps every panel mounted while folded, so a microphone or camera left on keeps running", () => {
    const html = render();
    for (const tab of TABS) {
      expect(tabPanel(html, tab.id)).toContain(`${tab.label} 내용`);
      expect(tabPanel(html, tab.id)).toContain("hidden");
    }
  });

  it("shows microphone, camera, and dictation tabs when unfolded, with the microphone first", () => {
    const html = render({ initialOpen: true });
    expect(html).toMatch(/<button[^>]*aria-expanded="true"[^>]*>개발용<\/button>/);
    expect(html).toContain('role="tablist"');
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*aria-selected="(true|false)"[^>]*>([^<]*)<\/button>/g)];
    expect(tabs.map((t) => t[2])).toEqual(["마이크", "카메라", "받아쓰기"]);
    expect(tabs.map((t) => t[1])).toEqual(["true", "false", "false"]);
  });

  it("shows only the chosen tab's panel and hides the other two", () => {
    const html = render({ initialOpen: true });
    expect(tabPanel(html, "mic")).not.toContain("hidden");
    expect(tabPanel(html, "camera")).toContain("hidden");
    expect(tabPanel(html, "dictation")).toContain("hidden");
  });
});
