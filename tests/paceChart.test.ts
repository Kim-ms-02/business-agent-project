import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DraftProvider from "@/app/DraftProvider";
import PracticeProvider from "@/app/PracticeProvider";
import RehearsalPage from "@/app/rehearsal/page";
import RehearsalProvider from "@/app/RehearsalProvider";
import type { VoiceRecord } from "@/lib/deliveryScore";
import { finishRehearsal, NO_DICTATION_PACE_NOTE, type RehearsalOutcome } from "@/lib/rehearsalResult";
import { paceChart } from "@/lib/rehearsalReport";
import type { QuarterPace } from "@/lib/sentenceMarks";

// v1.1 step 5 (3): the quarter speeds as a small chart in the speed card, with the recommended band
// (분당 250~330음절, the 4-point range) and every number also written out in words.

function quarters(...paces: (number | null)[]): QuarterPace[] {
  return paces.map((pace, i) => ({ first: i * 2, last: i * 2 + 1, syllables: 40, spokenSeconds: pace ? (40 / pace) * 60 : 0, pace }));
}

describe("paceChart", () => {
  const chart = paceChart(quarters(290, 318, 372, 200));

  it("has one point per quarter, evenly spaced from left to right", () => {
    const xs = chart.points.map((p) => p.x);
    expect(xs).toHaveLength(4);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1]);
    expect(xs[2] - xs[1]).toBeCloseTo(xs[3] - xs[2]);
  });

  it("draws the recommended band from 250 to 330 syllables a minute", () => {
    expect(chart.band).toEqual({ low: 250, high: 330, top: chart.y(330), bottom: chart.y(250) });
    expect(chart.y(330)).toBeLessThan(chart.y(250));
  });

  it("puts faster quarters higher, inside or outside the band by their speed", () => {
    const [inside, , fast, slow] = chart.points;
    expect(inside.y).toBeGreaterThan(chart.band.top);
    expect(inside.y).toBeLessThan(chart.band.bottom);
    expect(fast.y).toBeLessThan(chart.band.top);
    expect(slow.y).toBeGreaterThan(chart.band.bottom);
  });

  it("says 빠름 or 느림 in words for quarters outside the band", () => {
    expect(chart.points.map((p) => p.outside)).toEqual([null, null, "빠름", "느림"]);
    expect(chart.points.map((p) => p.label)).toEqual(["1구간 290", "2구간 318", "3구간 372 · 빠름", "4구간 200 · 느림"]);
  });

  it("keeps the band's own edges inside the band", () => {
    expect(paceChart(quarters(250, 330, 249, 331)).points.map((p) => p.outside)).toEqual([null, null, "느림", "빠름"]);
  });

  it("says which sentences each quarter covers", () => {
    expect(chart.points.map((p) => p.sentences)).toEqual(["1~2번 문장", "3~4번 문장", "5~6번 문장", "7~8번 문장"]);
  });

  it("leaves out the point of a quarter that was not spoken, and says so", () => {
    const missing = paceChart(quarters(290, null, 300, 310)).points[1];
    expect(missing).toMatchObject({ y: null, outside: null, label: "2구간 말하지 않음" });
  });

  it("keeps very fast or slow quarters on the chart", () => {
    const extreme = paceChart(quarters(90, 290, 300, 640));
    for (const p of extreme.points) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(extreme.height);
    }
  });

  it("describes the whole chart in words for screen readers", () => {
    expect(chart.description).toBe("구간별 분당 음절: 1구간 290, 2구간 318, 3구간 372 빠름, 4구간 200 느림. 권장 범위 250~330");
  });
});

describe("speed card on the result screen", () => {
  const SCRIPT = "학교 급식이 많이 남아요. 그래서 설문을 해 봤어요. 결과가 아주 놀라웠어요. 다음엔 더 오래 해 볼게요.";
  const record: VoiceRecord = {
    startedAt: 0,
    endedAt: 18,
    segments: [
      { start: 0, end: 6 },
      { start: 11, end: 17 },
    ],
    volumes: Array(180).fill(0.5),
  };
  const dictation = {
    chunks: [
      { text: "학교 급식이 많이 남아요", at: 3 },
      { text: "그래서 설문을 해 봤어요", at: 6 },
      { text: "결과가 아주 놀라웠어요", at: 14 },
      { text: "다음엔 더 오래 해 볼게요", at: 17 },
    ],
    activity: [1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16, 17],
  };

  function render(outcome: RehearsalOutcome): string {
    return renderToStaticMarkup(
      createElement(
        DraftProvider,
        { initial: { script: SCRIPT, topic: "", audience: "", limitMinutes: "1" } },
        createElement(
          PracticeProvider,
          null,
          createElement(RehearsalProvider, { initial: { outcome, coach: { name: "none" } } }, createElement(RehearsalPage)),
        ),
      ),
    );
  }

  function speedCard(html: string): string {
    return html.slice(html.indexOf("전달 · 말 속도"), html.indexOf("전달 · 침묵과 목소리"));
  }

  it("shows the chart with the band and the quarter numbers in words, with dictation on", () => {
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation }, null);
    const card = speedCard(render(outcome));
    expect(card).toMatch(/<svg[^>]*role="img"[^>]*aria-label="구간별 분당 음절: /);
    expect(card).toContain("<rect");
    expect(card.match(/<circle/g)).toHaveLength(4);
    expect(card).toContain("1구간 200 · 느림");
    // Each quarter is one sentence of this short script.
    expect(card).toContain("1번 문장");
  });

  it("explains the missing chart with dictation off", () => {
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation: null }, true);
    const html = render(outcome);
    expect(speedCard(html)).toContain(NO_DICTATION_PACE_NOTE);
    expect(html).not.toContain("<svg");
  });

  it("is the only place the quarter speeds are shown", () => {
    const outcome = finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation }, null);
    const html = render(outcome);
    expect(html.match(/구간별 말 속도/g)).toHaveLength(1);
    expect(html.indexOf("구간별 말 속도")).toBeLessThan(html.indexOf("전달 · 침묵과 목소리"));
  });
});
