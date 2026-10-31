// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DraftProvider from "@/app/DraftProvider";
import PracticeProvider from "@/app/PracticeProvider";
import RehearsalPage from "@/app/rehearsal/page";
import RehearsalProvider, { type KeptRehearsal } from "@/app/RehearsalProvider";
import type { VoiceRecord } from "@/lib/deliveryScore";
import { finishRehearsal } from "@/lib/rehearsalResult";

// v1.1 step 5: the two result buttons used to do the same thing. "다시 리허설" now goes straight
// back to the start with the script ready to read; "대본 고치기" opens the input box to change it.

vi.mock("@/lib/voiceTracker", () => ({ startVoiceTracker: async () => ({ ok: false, message: "" }) }));

const SCRIPT = "학교 급식이 많이 남아요. 그래서 설문을 해 봤어요. 결과가 아주 놀라웠어요.";
const record: VoiceRecord = {
  startedAt: 0,
  endedAt: 14,
  segments: [{ start: 0, end: 12 }],
  volumes: Array(140).fill(0.5),
};
const KEPT: KeptRehearsal = {
  outcome: finishRehearsal({ script: SCRIPT, limitSeconds: 60, record, face: null, dictation: null }, true),
  coach: { name: "none" },
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(
        DraftProvider,
        { initial: { script: SCRIPT, topic: "", audience: "", limitMinutes: "1" } },
        createElement(PracticeProvider, null, createElement(RehearsalProvider, { initial: KEPT }, createElement(RehearsalPage))),
      ),
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function buttons(): string[] {
  return [...container.querySelectorAll("main button")].map((b) => b.textContent ?? "");
}

async function click(name: string) {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent === name);
  if (!button) throw new Error(`no ${name} button`);
  await act(async () => button.click());
}

describe("result buttons", () => {
  it("are 다시 리허설 and 대본 고치기", () => {
    expect(buttons().slice(-2)).toEqual(["다시 리허설", "대본 고치기"]);
    expect(buttons()).not.toContain("처음으로");
  });

  it("다시 리허설 goes back to the start with the script to read, the input box closed", async () => {
    await click("다시 리허설");
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain(SCRIPT);
    expect(buttons()).toContain("리허설 시작");
    expect(buttons()).toContain("대본 고치기");
  });

  it("대본 고치기 goes back to the start with the input box open", async () => {
    await click("대본 고치기");
    expect(container.querySelector("textarea")?.value).toBe(SCRIPT);
    expect(buttons()).toContain("리허설 시작");
    expect(buttons()).not.toContain("대본 고치기");
  });

  it("the input box can be opened again after 다시 리허설", async () => {
    await click("다시 리허설");
    await click("대본 고치기");
    expect(container.querySelector("textarea")?.value).toBe(SCRIPT);
  });
});
