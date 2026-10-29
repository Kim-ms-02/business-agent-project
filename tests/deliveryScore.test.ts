import { describe, expect, it } from "vitest";
import {
  DESIGN_VALUE_NOTICE,
  SPEED_LIMIT_NOTICE,
  deliveryItems,
  formatTime,
  scoreDelivery,
  silenceLabel,
  type DeliveryInput,
  type VoiceRecord,
} from "@/lib/deliveryScore";

// Fake voice records. Volume is sampled every 0.1 seconds over the whole rehearsal.
const SAMPLE_SECONDS = 0.1;
const QUIET = 0.01;

type Span = [start: number, end: number];

function record(spans: Span[], duration: number, volumeAt: (t: number) => number = () => 0.5): VoiceRecord {
  const inSpeech = (t: number) => spans.some(([start, end]) => t >= start && t < end);
  const volumes = Array.from({ length: Math.round(duration / SAMPLE_SECONDS) }, (_, i) => {
    const t = i * SAMPLE_SECONDS;
    return inSpeech(t) ? volumeAt(t) : QUIET;
  });
  return { startedAt: 0, endedAt: duration, segments: spans.map(([start, end]) => ({ start, end })), volumes };
}

function input(overrides: Partial<DeliveryInput> & { record: VoiceRecord }): DeliveryInput {
  return { scriptSyllables: 300, limitSeconds: 60, readToEnd: true, ...overrides };
}

function measured(result: ReturnType<typeof scoreDelivery>) {
  if (!result.measured) throw new Error("expected a measured result");
  return result;
}

// One minute of speech in a 60-second rehearsal with a 60-second limit.
const ONE_MINUTE: Span[] = [[0, 60]];

describe("scoreDelivery: typical rehearsals", () => {
  it("gives full marks for steady speech at a good pace within the limit", () => {
    const spans: Span[] = [[0, 20], [20.5, 40], [40.5, 60]];
    const result = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 295 })));
    expect(result.spokenSeconds).toBeCloseTo(59);
    expect(result.items.speed.value).toBeCloseTo(300);
    expect(result.items.speed.score).toBe(4);
    expect(result.items.silence.score).toBe(4);
    expect(result.items.volume.score).toBe(4);
    expect(result.items.time.score).toBe(4);
    expect(result.total).toBe(100);
    expect(result.totalNote).toBeNull();
    expect(result.silences).toEqual([]);
  });

  it("finds two 5-second silences and where they were", () => {
    const spans: Span[] = [[0, 20], [25, 40], [45, 60]];
    const result = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 250 })));
    expect(result.silences).toEqual([
      { start: 20, end: 25 },
      { start: 40, end: 45 },
    ]);
    expect(result.items.silence.value).toBe(2);
    expect(result.items.silence.score).toBe(2);
  });

  it("scores speech that is far too fast as 1", () => {
    const result = measured(scoreDelivery(input({ record: record([[0, 30]], 60), scriptSyllables: 225 })));
    expect(result.items.speed.value).toBeCloseTo(450);
    expect(result.items.speed.score).toBe(1);
  });

  it("notices the voice getting quieter toward the end", () => {
    const fading = record(ONE_MINUTE, 60, (t) => (t < 30 ? 1 : 0.6));
    const result = measured(scoreDelivery(input({ record: fading })));
    expect(result.items.volume.value).toBeCloseTo(0.6);
    expect(result.items.volume.score).toBe(2);
  });

  it("scores a rehearsal far over the time limit as 1", () => {
    const result = measured(scoreDelivery(input({ record: record([[0, 80]], 80), scriptSyllables: 400 })));
    expect(result.items.time.value).toBeCloseTo(80 / 60);
    expect(result.items.time.score).toBe(1);
  });

  it("times the talk from the first word to the last, leaving out quiet time after start and before stop", () => {
    // 10 quiet seconds after "start", 50 seconds of talk, 20 quiet seconds before "stop".
    const result = measured(scoreDelivery(input({ record: record([[10, 60]], 80), scriptSyllables: 250, limitSeconds: 50 })));
    expect(result.speakingSpanSeconds).toBeCloseTo(50);
    expect(result.items.time.value).toBeCloseTo(1);
    expect(result.items.time.score).toBe(4);
  });
});

describe("scoreDelivery: not enough to measure", () => {
  it("gives no score when the speaker talked for less than 10 seconds", () => {
    const result = scoreDelivery(input({ record: record([[0, 9.9]], 30) }));
    expect(result).toEqual({ measured: false, spokenSeconds: expect.closeTo(9.9), message: "측정이 부족해요" });
  });

  it("scores exactly 10 seconds of speech", () => {
    expect(scoreDelivery(input({ record: record([[0, 10]], 12), scriptSyllables: 50 })).measured).toBe(true);
  });
});

describe("scoreDelivery: script not read to the end", () => {
  const spans: Span[] = [[0, 20], [25, 40], [45, 60]];

  it("leaves out the speed score and says why", () => {
    const result = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 250, readToEnd: false })));
    expect(result.items.speed.score).toBeNull();
    expect(result.items.speed.value).toBeNull();
    expect(result.items.speed.reason).toBe("끝까지 읽어야 말 속도를 잴 수 있어요");
  });

  it("still scores silence, volume, and time, and totals the three out of 12", () => {
    const result = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 250, readToEnd: false })));
    expect(result.items.silence.score).toBe(2);
    expect(result.items.volume.score).toBe(4);
    expect(result.items.time.score).toBe(4);
    expect(result.total).toBe(Math.round((10 / 12) * 100));
  });

  it("marks the total as based on three items", () => {
    const result = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 250, readToEnd: false })));
    expect(result.totalNote).toBe("3항목 기준");
  });
});

describe("scoreDelivery: total", () => {
  it("is the sum of four items out of 16, rounded", () => {
    // 48 seconds of speech: speed 3 (350 per minute), silence 2, volume 4, time 4 → 13 / 16 = 81.25
    const spans: Span[] = [[0, 20], [25, 40], [45, 58]];
    const result = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 280 })));
    expect(result.items.speed.score).toBe(3);
    expect(result.total).toBe(81);
  });
});

describe("scoreDelivery: boundaries", () => {
  const speedScore = (syllablesPerMinute: number) =>
    measured(scoreDelivery(input({ record: record(ONE_MINUTE, 60), scriptSyllables: syllablesPerMinute }))).items.speed
      .score;

  it.each([
    [250, 4],
    [330, 4],
    [249, 3],
    [331, 3],
    [220, 3],
    [370, 3],
    [219, 2],
    [371, 2],
    [190, 2],
    [410, 2],
    [189, 1],
    [411, 1],
  ])("speed of %i syllables per minute scores %i", (perMinute, score) => {
    expect(speedScore(perMinute)).toBe(score);
  });

  it("does not count a silence of exactly 3 seconds, but counts one just over", () => {
    const exact = measured(scoreDelivery(input({ record: record([[0, 30], [33, 60]], 60) })));
    expect(exact.silences).toEqual([]);
    const over = measured(scoreDelivery(input({ record: record([[0, 30], [33.1, 60]], 60) })));
    expect(over.silences).toEqual([{ start: 30, end: 33.1 }]);
  });

  it("ignores quiet time before the first word and after the last", () => {
    const result = measured(scoreDelivery(input({ record: record([[5, 50]], 60), scriptSyllables: 225 })));
    expect(result.silences).toEqual([]);
  });

  it.each([
    [0, 4],
    [1, 3],
    [2, 2],
    [3, 2],
    [4, 1],
  ])("%i silences score %i", (count, score) => {
    // Speech blocks of 10 seconds separated by 4-second silences.
    const spans: Span[] = Array.from({ length: count + 1 }, (_, i) => [i * 14, i * 14 + 10]);
    const duration = count * 14 + 10;
    const result = measured(scoreDelivery(input({ record: record(spans, duration), limitSeconds: duration })));
    expect(result.items.silence.value).toBe(count);
    expect(result.items.silence.score).toBe(score);
  });

  it.each([
    [0.8, 4],
    [0.79, 3],
    [0.65, 3],
    [0.64, 2],
    [0.5, 2],
    [0.49, 1],
  ])("an end-to-start volume ratio of %f scores %i", (ratio, score) => {
    const result = measured(scoreDelivery(input({ record: record(ONE_MINUTE, 60, (t) => (t < 30 ? 1 : ratio)) })));
    expect(result.items.volume.score).toBe(score);
  });

  it("compares volume only while speaking, so pauses do not lower it", () => {
    const spans: Span[] = [[0, 20], [25, 40], [45, 60]];
    const result = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 250 })));
    expect(result.items.volume.value).toBeCloseTo(1);
  });

  it.each([
    [51, 4], // 0.85
    [60, 4], // 1.0
    [50, 3],
    [42, 3], // 0.7
    [66, 3], // 1.1
    [41, 2],
    [67, 2],
    [30, 2], // 0.5
    [75, 2], // 1.25
    [29, 1],
    [76, 1],
  ])("a rehearsal of %i seconds against a 60-second limit scores %i", (seconds, score) => {
    const result = measured(scoreDelivery(input({ record: record([[0, seconds]], seconds), scriptSyllables: seconds * 5 })));
    expect(result.items.time.score).toBe(score);
  });
});

describe("scoreDelivery: reasons", () => {
  it("gives each item a one-line reason with the measured number", () => {
    const spans: Span[] = [[0, 20], [25, 40], [45, 60]];
    const { items } = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 250 })));
    expect(items.speed.reason).toContain("분당 300음절");
    expect(items.silence.reason).toContain("2번");
    expect(items.volume.reason).toContain("100%");
    expect(items.time.reason).toContain("1분 0초");
  });
});

describe("result screen text", () => {
  const spans: Span[] = [[0, 20], [25, 40], [45, 60]];

  it("formats seconds as minutes and seconds", () => {
    expect(formatTime(0)).toBe("0분 0초");
    expect(formatTime(133)).toBe("2분 13초");
    expect(formatTime(59.6)).toBe("1분 0초");
  });

  it("lists the four items in a fixed order with their scores out of 4", () => {
    const result = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 250 })));
    expect(deliveryItems(result)).toEqual([
      { label: "말 속도", score: "4 / 4", reason: result.items.speed.reason },
      { label: "침묵", score: "2 / 4", reason: result.items.silence.reason },
      { label: "목소리 크기", score: "4 / 4", reason: result.items.volume.reason },
      { label: "제한 시간", score: "4 / 4", reason: result.items.time.reason },
    ]);
  });

  it("shows that speed has no score when the script was not read to the end", () => {
    const result = measured(scoreDelivery(input({ record: record(spans, 60), scriptSyllables: 250, readToEnd: false })));
    expect(deliveryItems(result)[0]).toEqual({
      label: "말 속도",
      score: "점수 없음",
      reason: "끝까지 읽어야 말 속도를 잴 수 있어요",
    });
  });

  it("says when each silence happened and how long it was", () => {
    expect(silenceLabel({ start: 20, end: 25 })).toBe("0분 20초부터 5초 동안");
    expect(silenceLabel({ start: 80.4, end: 84.1 })).toBe("1분 20초부터 3.7초 동안");
  });

  it("states that the baselines are design values and that speed assumes the script was read as written", () => {
    expect(DESIGN_VALUE_NOTICE).toContain("설계 값");
    expect(SPEED_LIMIT_NOTICE).toContain("즉흥");
  });
});
