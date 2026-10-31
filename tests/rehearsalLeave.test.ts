// @vitest-environment jsdom
import { Activity, act, createElement, type ActivityProps, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DraftProvider from "@/app/DraftProvider";
import PracticeProvider from "@/app/PracticeProvider";
import RehearsalPage from "@/app/rehearsal/page";
import RehearsalProvider from "@/app/RehearsalProvider";
import { DICTATION_OPTION_LABEL } from "@/lib/rehearsalResult";

// v1.1 step 5 (1): Next keeps a page the visitor left hidden, with its state (React Activity).
// Leaving in the middle of a rehearsal must turn the microphone, camera, and dictation off and
// bring the screen back to the start. The microphone, camera, and dictation are fakes here.

const voice = vi.hoisted(() => ({ stop: vi.fn() }));
const face = vi.hoisted(() => ({ stop: vi.fn() }));
const listening = vi.hoisted(() => ({ stop: vi.fn() }));

vi.mock("@/lib/voiceTracker", () => ({
  startVoiceTracker: async () => ({
    ok: true,
    tracker: { stop: voice.stop.mockResolvedValue({ startedAt: 0, endedAt: 1, segments: [], volumes: [] }) },
  }),
}));

vi.mock("@/lib/faceTracker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/faceTracker")>()),
  startFaceTracker: async () => ({ ok: true, tracker: { delegate: "CPU", takeFrames: () => [], stop: face.stop } }),
}));

vi.mock("@/lib/speech", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/speech")>()),
  canDictate: () => true,
  startListening: () => listening.stop,
}));

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const DRAFT = { script: "학교 급식이 많이 남아요. 그래서 설문을 해 봤어요.", topic: "", audience: "", limitMinutes: "1" };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function page(shown: boolean): ReactNode {
  return createElement(
    DraftProvider,
    { initial: DRAFT },
    createElement(
      PracticeProvider,
      null,
      createElement(
        RehearsalProvider,
        null,
        // The page goes in as the child, so the props alone need not list it.
        createElement(Activity, { mode: shown ? "visible" : "hidden" } as ActivityProps, createElement(RehearsalPage)),
      ),
    ),
  );
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  Object.defineProperty(navigator, "userAgent", { value: CHROME, configurable: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  voice.stop.mockClear();
  face.stop.mockClear();
  listening.stop.mockClear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
});

function button(name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => b.textContent === name);
}

async function click(element: HTMLElement | undefined) {
  if (!element) throw new Error("not on the screen");
  await act(async () => element.click());
}

async function show(shown: boolean) {
  await act(async () => root!.render(page(shown)));
}

describe("leaving the rehearsal page in the middle", () => {
  it("turns the microphone and dictation off and comes back to the start", async () => {
    root = createRoot(container);
    await show(true);
    await click(container.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? undefined);
    await click(button("리허설 시작"));
    expect(button("끝")).toBeDefined();

    await show(false);
    expect(voice.stop).toHaveBeenCalled();
    expect(listening.stop).toHaveBeenCalled();

    await show(true);
    expect(button("끝")).toBeUndefined();
    expect(button("리허설 시작")).toBeDefined();
    expect(container.querySelector("textarea")?.value).toBe(DRAFT.script);
  });

  it("turns the camera off and shows 카메라 켜기 again", async () => {
    root = createRoot(container);
    await show(true);
    await click(button("카메라 켜기"));
    expect(button("카메라 끄기")).toBeDefined();

    await show(false);
    expect(face.stop).toHaveBeenCalled();

    await show(true);
    expect(button("카메라 끄기")).toBeUndefined();
    expect(button("카메라 켜기")).toBeDefined();
  });
});

describe("dictation option", () => {
  it("is not in the page built ahead of time, and appears once the page runs in a browser", async () => {
    // Building ahead of time happens without a browser.
    vi.stubGlobal("navigator", undefined);
    const html = renderToString(page(true));
    vi.unstubAllGlobals();
    expect(html).not.toContain(DICTATION_OPTION_LABEL);

    const mismatch = vi.fn();
    container.innerHTML = html;
    await act(async () => {
      root = hydrateRoot(container, page(true), { onRecoverableError: mismatch });
    });
    expect(mismatch).not.toHaveBeenCalled();
    expect(container.textContent).toContain(DICTATION_OPTION_LABEL);
  });
});
