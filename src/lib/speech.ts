import { splitSentences } from "./validate";

// Browser-only: reads questions aloud and turns spoken answers into text.
// Dictation runs on the device only (processLocally), so the user's voice never leaves the browser.

const LANG = "ko-KR";

// ---------- Pure helpers ----------

export function appendTranscript(current: string, piece: string): string {
  const next = piece.trim();
  if (next === "") return current;
  return current.trim() === "" ? next : `${current.trim()} ${next}`;
}

interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
}

/** A Korean voice, preferring one that runs on this device over a network voice. */
export function pickVoice<T extends VoiceLike>(voices: T[]): T | null {
  const korean = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("ko"));
  return korean.find((v) => v.localService) ?? korean[0] ?? null;
}

export type DictationStatus = "available" | "downloadable" | "downloading" | "unavailable" | "unsupported";

export function availabilityMessage(status: DictationStatus): string | null {
  switch (status) {
    case "available":
      return null;
    case "downloadable":
      return "말로 답하려면 한국어 받아쓰기 파일을 한 번 내려받아야 해요.";
    case "downloading":
      return "한국어 받아쓰기 파일을 내려받는 중이에요.";
    case "unavailable":
      return "이 브라우저에서는 기기 안에서 받아쓰기를 할 수 없어요. 글로 입력해 주세요.";
    case "unsupported":
      return "이 브라우저는 기기 안 받아쓰기를 지원하지 않아요. 크롬 최신 버전을 쓰거나 글로 입력해 주세요.";
  }
}

export function recognitionErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "마이크 권한이 꺼져 있어요. 주소창 옆 아이콘에서 마이크를 허용해 주세요.";
    case "audio-capture":
      return "마이크를 찾지 못했어요. 마이크 연결을 확인해 주세요.";
    case "no-speech":
      return "말소리가 들리지 않았어요. 다시 눌러서 말해 보세요.";
    default:
      return "받아쓰기에 문제가 생겼어요. 글로 입력해 주세요.";
  }
}

// ---------- Read aloud ----------

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Reads the text sentence by sentence. Returns a function that stops reading. */
export function speak(text: string, onEnd?: () => void): () => void {
  if (!canSpeak()) {
    onEnd?.();
    return () => {};
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(synth.getVoices());
  const sentences = splitSentences(text);
  sentences.forEach((sentence, i) => {
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = LANG;
    if (voice) utterance.voice = voice;
    if (i === sentences.length - 1 && onEnd) utterance.onend = () => onEnd();
    synth.speak(utterance);
  });
  return () => synth.cancel();
}

// ---------- Dictation (on-device only) ----------

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface OnDeviceOptions {
  langs: string[];
  processLocally: boolean;
}

interface RecognitionConstructor {
  new (): Recognition;
  available?(options: OnDeviceOptions): Promise<string>;
  install?(options: OnDeviceOptions): Promise<boolean>;
}

// Only the unprefixed constructor: on-device support comes without a prefix, and the
// prefixed webkitSpeechRecognition sends audio to a server.
function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { SpeechRecognition?: RecognitionConstructor }).SpeechRecognition ?? null;
}

const ON_DEVICE: OnDeviceOptions = { langs: [LANG], processLocally: true };

export async function checkDictation(): Promise<DictationStatus> {
  const Ctor = recognitionConstructor();
  if (!Ctor?.available) return "unsupported";
  try {
    const status = await Ctor.available(ON_DEVICE);
    return ["available", "downloadable", "downloading"].includes(status) ? (status as DictationStatus) : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Downloads the Korean language pack once. Resolves true when it is installed. */
export async function installDictation(): Promise<boolean> {
  const Ctor = recognitionConstructor();
  if (!Ctor?.install) return false;
  try {
    return await Ctor.install(ON_DEVICE);
  } catch {
    return false;
  }
}

interface ListenHandlers {
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

/** Starts on-device dictation. Returns a function that stops listening. */
export function startListening(handlers: ListenHandlers): () => void {
  const Ctor = recognitionConstructor();
  if (!Ctor) {
    handlers.onError(availabilityMessage("unsupported") ?? "");
    handlers.onEnd();
    return () => {};
  }
  const recognition = new Ctor();
  recognition.lang = LANG;
  recognition.processLocally = true;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) handlers.onFinal(result[0].transcript);
      else interim += result[0].transcript;
    }
    handlers.onInterim(interim);
  };
  recognition.onerror = (event) => {
    const message = recognitionErrorMessage(event.error);
    if (message) handlers.onError(message);
  };
  recognition.onend = () => handlers.onEnd();
  recognition.start();
  return () => recognition.stop();
}
