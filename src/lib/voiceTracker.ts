import { VOLUME_SAMPLE_SECONDS } from "./deliveryConfig";
import type { SpeechSegment, VoiceRecord } from "./deliveryScore";

// Turns on the microphone and runs vad-web to find when the speaker was talking.
// Everything stays in the browser: the sound itself is never kept or sent anywhere,
// only speech times and average volumes (see VoiceRecord).
// vad-web is imported only inside startVoiceTracker, so this file can load on the server and in tests.

// ---------- Pure helpers ----------

// vad-web's v5 model reads 512 samples of 16 kHz audio per frame.
export const FRAME_SECONDS = 512 / 16000;
// Same values as vad-web's defaults, so our segments match its speech events.
export const POSITIVE_SPEECH_THRESHOLD = 0.3;
export const MIN_SPEECH_SECONDS = 0.4;
// Where scripts/copy-vad-assets.mjs puts the model and wasm files.
export const VAD_ASSET_PATH = "/vad/";

export function frameRms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  return Math.sqrt(sum / frame.length);
}

/** Loudness as a 0–1 bar, on a decibel scale from -60 dB (empty) to 0 dB (full). */
export function volumeLevel(rms: number): number {
  if (rms <= 0) return 0;
  const level = (20 * Math.log10(rms) + 60) / 60;
  return Math.min(1, Math.max(0, level));
}

interface RecorderOptions {
  frameSeconds: number;
  positiveThreshold: number;
  minSpeechSeconds: number;
}

interface Pending {
  start: number;
  end: number;
  voicedFrames: number;
}

/**
 * Collects vad-web frames and speech events into a VoiceRecord.
 * Times come from counting frames, so they follow the audio rather than when callbacks happen to run.
 * vad-web reports a speech end only after a waiting time (redemption), so a segment ends at its
 * last loud frame instead of when the end was reported.
 */
export class VoiceRecorder {
  private readonly options: RecorderOptions;
  private frames = 0;
  private lastProb = 0;
  private pending: Pending | null = null;
  private readonly segments: SpeechSegment[] = [];
  private readonly buckets: { sum: number; count: number }[] = [];

  constructor(options: Partial<RecorderOptions> = {}) {
    this.options = {
      frameSeconds: FRAME_SECONDS,
      positiveThreshold: POSITIVE_SPEECH_THRESHOLD,
      minSpeechSeconds: MIN_SPEECH_SECONDS,
      ...options,
    };
  }

  get speaking(): boolean {
    return this.pending !== null;
  }

  private time(frames: number): number {
    return frames * this.options.frameSeconds;
  }

  frame(speechProb: number, rms: number): void {
    const start = this.time(this.frames);
    this.frames += 1;
    this.lastProb = speechProb;

    const index = Math.floor(Math.round((start / VOLUME_SAMPLE_SECONDS) * 1e6) / 1e6);
    const bucket = (this.buckets[index] ??= { sum: 0, count: 0 });
    bucket.sum += rms;
    bucket.count += 1;

    if (this.pending && speechProb >= this.options.positiveThreshold) {
      this.pending.end = this.time(this.frames);
      this.pending.voicedFrames += 1;
    }
  }

  /** vad-web calls this right after the frame where speech began. */
  speechStart(): void {
    if (this.pending || this.frames === 0) return;
    const voiced = this.lastProb >= this.options.positiveThreshold;
    this.pending = {
      start: this.time(this.frames - 1),
      end: this.time(voiced ? this.frames : this.frames - 1),
      voicedFrames: voiced ? 1 : 0,
    };
  }

  speechEnd(): void {
    if (this.pending) this.segments.push({ start: this.pending.start, end: this.pending.end });
    this.pending = null;
  }

  /** A sound too short to be speech, such as a cough. */
  misfire(): void {
    this.pending = null;
  }

  /** Called when "끝" is pressed. Speech still going is kept if it was long enough to count. */
  finish(): VoiceRecord {
    if (this.pending) {
      const voicedSeconds = this.time(this.pending.voicedFrames);
      if (voicedSeconds + 1e-9 >= this.options.minSpeechSeconds) this.speechEnd();
      else this.misfire();
    }
    return {
      startedAt: 0,
      endedAt: this.time(this.frames),
      segments: [...this.segments],
      volumes: Array.from(this.buckets, (b) => (b && b.count > 0 ? b.sum / b.count : 0)),
    };
  }
}

export const NO_MIC_SUPPORT_MESSAGE = "이 브라우저에서는 마이크를 쓸 수 없어요. 크롬에서 열어 주세요.";
export const MIC_BLOCKED_MESSAGE =
  "마이크 사용이 막혀 있어요. 주소창 왼쪽의 아이콘을 눌러 마이크를 허용한 뒤 다시 시도해 주세요.";
export const NO_MIC_MESSAGE = "마이크를 찾지 못했어요. 마이크가 연결되어 있는지 확인한 뒤 다시 시도해 주세요.";
export const MIC_BUSY_MESSAGE = "다른 프로그램이 마이크를 쓰고 있어요. 그 프로그램을 닫은 뒤 다시 시도해 주세요.";
export const MIC_FAILED_MESSAGE = "마이크를 켜지 못했어요. 페이지를 새로 고친 뒤 다시 시도해 주세요.";
export const MODEL_LOAD_MESSAGE =
  "말소리를 판별하는 파일을 불러오지 못했어요. 페이지를 새로 고친 뒤 다시 시도해 주세요.";

export function micErrorMessage(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return MIC_BLOCKED_MESSAGE;
    case "NotFoundError":
    case "OverconstrainedError":
      return NO_MIC_MESSAGE;
    case "NotReadableError":
      return MIC_BUSY_MESSAGE;
    default:
      return MIC_FAILED_MESSAGE;
  }
}

/** Who has the microphone on right now, so two parts of the screen do not use it at once. */
export class MicUsage {
  private current: string | null = null;
  private readonly listeners = new Set<() => void>();

  get owner(): string | null {
    return this.current;
  }

  busyFor(who: string): boolean {
    return this.current !== null && this.current !== who;
  }

  start(who: string): void {
    this.current = who;
    this.listeners.forEach((listener) => listener());
  }

  end(who: string): void {
    if (this.current !== who) return;
    this.current = null;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const micUsage = new MicUsage();

// ---------- Browser ----------

export interface LiveVoice {
  speaking: boolean;
  /** 0–1, see volumeLevel. */
  level: number;
}

export interface VoiceTracker {
  /** Turns the microphone off and returns what was measured. */
  stop(): Promise<VoiceRecord>;
}

export type StartResult = { ok: true; tracker: VoiceTracker } | { ok: false; message: string };

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

/** `owner` names who turned the microphone on (see micUsage); it counts as in use from here until stop. */
export async function startVoiceTracker(owner: string, onLive: (live: LiveVoice) => void): Promise<StartResult> {
  micUsage.start(owner);
  const result = await openTracker(onLive);
  if (!result.ok) {
    micUsage.end(owner);
    return result;
  }
  const { tracker } = result;
  return {
    ok: true,
    tracker: {
      async stop() {
        try {
          return await tracker.stop();
        } finally {
          micUsage.end(owner);
        }
      },
    },
  };
}

async function openTracker(onLive: (live: LiveVoice) => void): Promise<StartResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: NO_MIC_SUPPORT_MESSAGE };
  }

  // The microphone is opened here rather than inside vad-web, so a permission problem and a
  // model loading problem get different messages.
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Automatic gain would even out the volume and hide a voice that fades toward the end.
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
  } catch (error) {
    return { ok: false, message: micErrorMessage(error) };
  }

  const recorder = new VoiceRecorder();
  try {
    const { MicVAD } = await import("@ricky0123/vad-web");
    const vad = await MicVAD.new({
      model: "v5",
      baseAssetPath: VAD_ASSET_PATH,
      onnxWASMBasePath: VAD_ASSET_PATH,
      positiveSpeechThreshold: POSITIVE_SPEECH_THRESHOLD,
      minSpeechMs: MIN_SPEECH_SECONDS * 1000,
      getStream: async () => stream,
      onFrameProcessed: (probs, frame) => {
        const rms = frameRms(frame);
        recorder.frame(probs.isSpeech, rms);
        onLive({ speaking: recorder.speaking, level: volumeLevel(rms) });
      },
      onSpeechStart: () => recorder.speechStart(),
      // vad-web hands over the spoken audio here. It is not kept.
      onSpeechEnd: () => recorder.speechEnd(),
      onVADMisfire: () => recorder.misfire(),
    });
    return {
      ok: true,
      tracker: {
        async stop() {
          try {
            await vad.destroy();
          } finally {
            stopStream(stream);
          }
          return recorder.finish();
        },
      },
    };
  } catch (error) {
    console.error(error);
    stopStream(stream);
    return { ok: false, message: MODEL_LOAD_MESSAGE };
  }
}
