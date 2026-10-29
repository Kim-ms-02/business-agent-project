import { describe, expect, it } from "vitest";
import {
  appendTranscript,
  DICTATION_NOTICE,
  NO_DICTATION_MESSAGE,
  pickRecognition,
  pickVoice,
  recognitionErrorMessage,
} from "@/lib/speech";

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

describe("pickRecognition", () => {
  class Standard {}
  class Prefixed {}

  it("uses the standard dictation when the browser has it", () => {
    expect(pickRecognition({ SpeechRecognition: Standard, webkitSpeechRecognition: Prefixed })).toBe(Standard);
  });

  it("falls back to the prefixed dictation in Chrome and Edge", () => {
    expect(pickRecognition({ webkitSpeechRecognition: Prefixed })).toBe(Prefixed);
  });

  it("returns null when the browser has no dictation", () => {
    expect(pickRecognition({})).toBeNull();
  });
});

describe("dictation notices", () => {
  it("tells the user where their voice goes", () => {
    expect(DICTATION_NOTICE).toBe(
      "말로 답하면 받아쓰기를 위해 목소리가 구글 서버로 전송돼요. 이 앱은 녹음을 저장하지 않아요.",
    );
  });

  it("points to typing when the browser has no dictation", () => {
    expect(NO_DICTATION_MESSAGE).toContain("글로 입력해 주세요");
  });
});

describe("recognitionErrorMessage", () => {
  it.each([
    ["not-allowed", "마이크"],
    ["service-not-allowed", "마이크"],
    ["audio-capture", "마이크를 찾지 못했어요"],
    ["no-speech", "말소리가 들리지 않았어요"],
    ["network", "인터넷"],
    ["language-not-supported", "글로 입력해 주세요"],
    ["something-new", "글로 입력해 주세요"],
  ])("explains %s", (code, phrase) => {
    expect(recognitionErrorMessage(code)).toContain(phrase);
  });

  it("stays quiet when the user stopped listening", () => {
    expect(recognitionErrorMessage("aborted")).toBeNull();
  });
});
