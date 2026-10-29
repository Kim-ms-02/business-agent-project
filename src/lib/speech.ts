import { splitSentences } from "./validate";

// Browser-only: reads questions aloud and turns spoken answers into text.
// Dictation uses the browser's built-in recognition, which sends the voice to Google's server.
// The screen says so next to the button, and this app never stores the recording.

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

export const DICTATION_NOTICE =
  "말로 답하면 받아쓰기를 위해 목소리가 구글 서버로 전송돼요. 이 앱은 녹음을 저장하지 않아요.";

export const NO_DICTATION_MESSAGE = "이 브라우저는 받아쓰기를 지원하지 않아요. 크롬이나 엣지를 쓰거나 글로 입력해 주세요.";

/** The standard constructor if present, otherwise the prefixed one Chrome and Edge ship. */
export function pickRecognition<T>(source: { SpeechRecognition?: T; webkitSpeechRecognition?: T }): T | null {
  return source.SpeechRecognition ?? source.webkitSpeechRecognition ?? null;
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
    case "network":
      return "받아쓰기는 인터넷이 필요해요. 인터넷 연결을 확인하거나 글로 입력해 주세요.";
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

// ---------- Dictation ----------

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return pickRecognition(
    window as unknown as {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    },
  );
}

export function canDictate(): boolean {
  return recognitionConstructor() !== null;
}

interface ListenHandlers {
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

/** Starts dictation. Returns a function that stops listening. */
export function startListening(handlers: ListenHandlers): () => void {
  const Ctor = recognitionConstructor();
  if (!Ctor) {
    handlers.onError(NO_DICTATION_MESSAGE);
    handlers.onEnd();
    return () => {};
  }
  const recognition = new Ctor();
  recognition.lang = LANG;
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
