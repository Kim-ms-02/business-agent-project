import { describe, expect, it } from "vitest";
import { scoreDelivery } from "@/lib/deliveryScore";
import {
  MIC_BLOCKED_MESSAGE,
  MIC_BUSY_MESSAGE,
  MIC_FAILED_MESSAGE,
  NO_MIC_MESSAGE,
  VoiceRecorder,
  frameRms,
  micErrorMessage,
  volumeLevel,
} from "@/lib/voiceTracker";

// Fake vad-web frames. 0.05-second frames keep the arithmetic readable (real frames are 0.032 s).
const FRAME = 0.05;
const SPEECH = 0.9;
const QUIET = 0.05;

function recorder() {
  return new VoiceRecorder({ frameSeconds: FRAME, positiveThreshold: 0.3, minSpeechSeconds: 0.4 });
}

/** Feeds frames the way vad-web reports them: a speech start on the first loud frame. */
function speak(r: VoiceRecorder, frames: number, rms = 0.2) {
  for (let i = 0; i < frames; i++) {
    r.frame(SPEECH, rms);
    if (i === 0 && !r.speaking) r.speechStart();
  }
}

function quiet(r: VoiceRecorder, frames: number, rms = 0.01) {
  for (let i = 0; i < frames; i++) r.frame(QUIET, rms);
}

describe("frameRms", () => {
  it("is the root mean square of the samples", () => {
    expect(frameRms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(frameRms(new Float32Array([0.3, 0.4]))).toBeCloseTo(Math.sqrt((0.09 + 0.16) / 2));
  });

  it("is 0 for silence and for an empty frame", () => {
    expect(frameRms(new Float32Array(4))).toBe(0);
    expect(frameRms(new Float32Array(0))).toBe(0);
  });
});

describe("volumeLevel", () => {
  it("maps loudness to a 0–1 bar that grows with volume", () => {
    expect(volumeLevel(0)).toBe(0);
    expect(volumeLevel(1)).toBe(1);
    expect(volumeLevel(0.01)).toBeLessThan(volumeLevel(0.1));
  });

  it("stays within 0–1", () => {
    expect(volumeLevel(5)).toBe(1);
    expect(volumeLevel(0.000001)).toBe(0);
  });
});

describe("VoiceRecorder: speech segments", () => {
  it("records a stretch of speech from its first to its last loud frame", () => {
    const r = recorder();
    quiet(r, 10);
    speak(r, 20);
    quiet(r, 30);
    r.speechEnd(); // vad-web reports the end only after its waiting time
    quiet(r, 10);
    const record = r.finish();
    expect(record.segments).toHaveLength(1);
    expect(record.segments[0].start).toBeCloseTo(0.5);
    expect(record.segments[0].end).toBeCloseTo(1.5);
  });

  it("does not stretch the end over quieter frames that came before the end was reported", () => {
    const r = recorder();
    speak(r, 20);
    for (let i = 0; i < 5; i++) r.frame(0.28, 0.1); // just under the speech threshold
    r.speechEnd();
    expect(r.finish().segments[0].end).toBeCloseTo(1);
  });

  it("drops a start that vad-web called a misfire, like a cough", () => {
    const r = recorder();
    speak(r, 3);
    quiet(r, 30);
    r.misfire();
    speak(r, 20);
    r.speechEnd();
    const { segments } = r.finish();
    expect(segments).toHaveLength(1);
    expect(segments[0].start).toBeCloseTo(33 * FRAME);
  });

  it("keeps speech still going when the speaker presses stop", () => {
    const r = recorder();
    speak(r, 20);
    const record = r.finish();
    expect(record.segments).toEqual([{ start: 0, end: expect.closeTo(1) }]);
  });

  it("drops a very short sound still going when stop is pressed", () => {
    const r = recorder();
    speak(r, 20);
    r.speechEnd();
    quiet(r, 10);
    speak(r, 3);
    expect(r.finish().segments).toHaveLength(1);
  });

  it("tells whether the speaker is talking right now", () => {
    const r = recorder();
    expect(r.speaking).toBe(false);
    speak(r, 5);
    expect(r.speaking).toBe(true);
    r.speechEnd();
    expect(r.speaking).toBe(false);
  });
});

describe("VoiceRecorder: record", () => {
  it("measures the rehearsal length from the frames heard", () => {
    const r = recorder();
    quiet(r, 40);
    expect(r.finish()).toMatchObject({ startedAt: 0, endedAt: expect.closeTo(2) });
  });

  it("keeps an average volume every 0.1 seconds and nothing else", () => {
    const r = recorder();
    [1, 3, 5, 7, 9].forEach((rms) => r.frame(QUIET, rms));
    const record = r.finish();
    expect(record.volumes).toHaveLength(3);
    expect(record.volumes[0]).toBeCloseTo(2);
    expect(record.volumes[1]).toBeCloseTo(6);
    expect(record.volumes[2]).toBeCloseTo(9);
    expect(Object.keys(record).sort()).toEqual(["endedAt", "segments", "startedAt", "volumes"]);
  });

  it("is empty when nothing was heard", () => {
    expect(recorder().finish()).toEqual({ startedAt: 0, endedAt: 0, segments: [], volumes: [] });
  });

  it("hands delivery scoring a record it can use", () => {
    // 10 s of speech, a 4 s pause, 10 s of speech.
    const r = recorder();
    speak(r, 200);
    quiet(r, 80);
    r.speechEnd();
    speak(r, 200);
    r.speechEnd();
    const result = scoreDelivery({ record: r.finish(), scriptSyllables: 100, limitSeconds: 24, readToEnd: true });
    if (!result.measured) throw new Error("expected a measured result");
    expect(result.spokenSeconds).toBeCloseTo(20);
    expect(result.silences).toHaveLength(1);
    expect(result.silences[0].start).toBeCloseTo(10);
    expect(result.silences[0].end).toBeCloseTo(14);
  });
});

describe("micErrorMessage", () => {
  it("explains a blocked microphone", () => {
    expect(micErrorMessage(new DOMException("denied", "NotAllowedError"))).toBe(MIC_BLOCKED_MESSAGE);
    expect(micErrorMessage(new DOMException("insecure", "SecurityError"))).toBe(MIC_BLOCKED_MESSAGE);
  });

  it("explains a missing microphone", () => {
    expect(micErrorMessage(new DOMException("none", "NotFoundError"))).toBe(NO_MIC_MESSAGE);
    expect(micErrorMessage(new DOMException("none", "OverconstrainedError"))).toBe(NO_MIC_MESSAGE);
  });

  it("explains a microphone another program is using", () => {
    expect(micErrorMessage(new DOMException("busy", "NotReadableError"))).toBe(MIC_BUSY_MESSAGE);
  });

  it("falls back to a general message", () => {
    expect(micErrorMessage(new Error("strange"))).toBe(MIC_FAILED_MESSAGE);
    expect(micErrorMessage("strange")).toBe(MIC_FAILED_MESSAGE);
  });

  it("uses plain words without English error names", () => {
    for (const message of [MIC_BLOCKED_MESSAGE, NO_MIC_MESSAGE, MIC_BUSY_MESSAGE, MIC_FAILED_MESSAGE]) {
      expect(message).not.toMatch(/[A-Za-z]{3,}/);
    }
  });
});
