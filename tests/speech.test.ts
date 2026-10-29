import { describe, expect, it } from "vitest";
import { appendTranscript, availabilityMessage, pickVoice, recognitionErrorMessage } from "@/lib/speech";

describe("appendTranscript", () => {
  it("adds a recognized piece after what is already written, with one space", () => {
    expect(appendTranscript("저울로 쟀어요.", " 하루 두 번 ")).toBe("저울로 쟀어요. 하루 두 번");
  });

  it("starts from empty text", () => {
    expect(appendTranscript("", "저울로 쟀어요")).toBe("저울로 쟀어요");
  });

  it("ignores an empty piece", () => {
    expect(appendTranscript("이미 쓴 답", "  ")).toBe("이미 쓴 답");
  });
});

describe("pickVoice", () => {
  const voice = (name: string, lang: string, localService: boolean) => ({ name, lang, localService });

  it("prefers a Korean voice that runs on this device", () => {
    const voices = [voice("Google 한국의", "ko-KR", false), voice("Yuna", "ko-KR", true), voice("Alex", "en-US", true)];
    expect(pickVoice(voices)?.name).toBe("Yuna");
  });

  it("falls back to any Korean voice", () => {
    expect(pickVoice([voice("Alex", "en-US", true), voice("Google 한국의", "ko_KR", false)])?.name).toBe("Google 한국의");
  });

  it("returns null when there is no Korean voice", () => {
    expect(pickVoice([voice("Alex", "en-US", true)])).toBeNull();
  });
});

describe("availabilityMessage", () => {
  it("says nothing when on-device dictation is ready", () => {
    expect(availabilityMessage("available")).toBeNull();
  });

  it.each(["downloadable", "downloading", "unavailable", "unsupported"] as const)(
    "explains %s in plain words",
    (status) => {
      expect(availabilityMessage(status)).toMatch(/요\.$/);
    },
  );

  it("points to typing when dictation cannot run on this device", () => {
    expect(availabilityMessage("unavailable")).toContain("글로 입력해 주세요");
    expect(availabilityMessage("unsupported")).toContain("글로 입력해 주세요");
  });
});

describe("recognitionErrorMessage", () => {
  it.each([
    ["not-allowed", "마이크"],
    ["service-not-allowed", "마이크"],
    ["audio-capture", "마이크를 찾지 못했어요"],
    ["no-speech", "말소리가 들리지 않았어요"],
    ["language-not-supported", "글로 입력해 주세요"],
    ["something-new", "글로 입력해 주세요"],
  ])("explains %s", (code, phrase) => {
    expect(recognitionErrorMessage(code)).toContain(phrase);
  });

  it("stays quiet when the user stopped listening", () => {
    expect(recognitionErrorMessage("aborted")).toBeNull();
  });
});
