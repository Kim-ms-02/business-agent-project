import { describe, expect, it } from "vitest";
import {
  FACE_DESIGN_NOTICE,
  FACE_PRACTICE_NOTICE,
  NO_CAMERA_NOTE,
  faceItems,
  lowGazeLabel,
  measureBaseline,
  notEnoughFaceDetail,
  scoreFace,
  undetectedLabel,
  type FaceBaseline,
  type FaceFrame,
} from "@/lib/faceScore";

// Fake frame records, one every 0.1 seconds like the face tracker.
const STEP = 0.1;

// A speaker looking at the screen with the face well framed and the head still.
const LOOKING: Omit<FaceFrame, "t"> = {
  detected: true,
  yaw: 0,
  pitch: 0,
  lookDown: 0.1,
  lookAway: 0.1,
  smile: 0,
  faceWidth: 0.3,
};

function frames(seconds: number, at: (t: number, i: number) => Partial<FaceFrame> = () => ({})): FaceFrame[] {
  return Array.from({ length: Math.round(seconds / STEP) }, (_, i) => {
    const t = Math.round(i * STEP * 10) / 10;
    return { t, ...LOOKING, ...at(t, i) };
  });
}

/** The first `share` of the frames (out of 100) get `then`, the rest stay as they are. */
function share(count: number, then: Partial<FaceFrame>) {
  return (_: number, i: number) => (i < count ? then : {});
}

// Yaw swinging ±a degrees every frame: within each second the standard deviation is a.
function swing(a: number) {
  return (_: number, i: number) => ({ yaw: i % 2 === 0 ? a : -a });
}

// The speaker's reference pose, measured before the rehearsal. Facing the camera straight on by default.
const FRONT: FaceBaseline = { yaw: 0, pitch: 0, lookDown: 0, lookAway: 0, smile: 0 };

function rate(record: FaceFrame[], baseline: FaceBaseline = FRONT) {
  return scoreFace(record, baseline);
}

function measured(result: ReturnType<typeof scoreFace>) {
  if (!result.measured) throw new Error("expected a measured result");
  return result;
}

describe("scoreFace: typical rehearsals", () => {
  it("gives full marks to a speaker who keeps looking at the screen", () => {
    // Smiles in 20% of frames, head moving about 5 degrees.
    const record = frames(30, (t, i) => ({ yaw: i % 2 === 0 ? 5 : -5, smile: i % 5 === 0 ? 0.5 : 0.1 }));
    const result = measured(rate(record));
    expect(result.items.gaze.score).toBe(4);
    expect(result.items.expression.score).toBe(4);
    expect(result.items.head.score).toBe(4);
    expect(result.items.framing.score).toBe(4);
    expect(result.total).toBe(100);
    expect(result.lowGazeWindows).toEqual([]);
    expect(result.undetectedSeconds).toBe(0);
  });

  it("scores a speaker who keeps looking down at the script as 0 for gaze", () => {
    const result = measured(rate(frames(30, () => ({ pitch: -25, lookDown: 0.8 }))));
    expect(result.items.gaze.value).toBe(0);
    expect(result.items.gaze.score).toBe(0);
    expect(result.lowGazeWindows).toEqual([
      { start: 0, end: 10 },
      { start: 10, end: 20 },
      { start: 20, end: 30 },
    ]);
  });

  it("does not count eyes looking to the side as looking at the screen, even with the head facing front", () => {
    const result = measured(rate(frames(30, () => ({ yaw: 0, pitch: 0, lookAway: 0.8 }))));
    expect(result.items.gaze.value).toBe(0);
    expect(result.items.gaze.score).toBe(0);
  });

  it("marks the 10-second stretches where gaze was low", () => {
    const record = frames(30, (t) => (t >= 10 && t < 20 ? { lookDown: 0.9 } : {}));
    expect(measured(rate(record)).lowGazeWindows).toEqual([{ start: 10, end: 20 }]);
  });

  it("scores a head that does not move at all as 2", () => {
    const result = measured(rate(frames(30)));
    expect(result.items.head.value).toBe(0);
    expect(result.items.head.score).toBe(2);
  });

  it("scores a head that shakes hard as 1", () => {
    const result = measured(rate(frames(30, swing(25))));
    expect(result.items.head.value).toBeCloseTo(25);
    expect(result.items.head.score).toBe(1);
  });
});

describe("scoreFace: face not found", () => {
  it("gives no total when the face was found in less than half of the frames", () => {
    const record = frames(10, share(51, { detected: false }));
    expect(rate(record)).toEqual({
      measured: false,
      measuredRatio: 0.49,
      undetectedSeconds: expect.closeTo(5.1),
      message: "측정이 부족해요",
    });
  });

  it("still scores when the face was found in exactly half of the frames", () => {
    expect(rate(frames(10, share(50, { detected: false }))).measured).toBe(true);
  });

  it("leaves frames without a face out of every item and reports them as unmeasured time", () => {
    // 20 frames without a face (looking away while undetected) and 80 frames looking at the screen.
    const record = frames(10, share(20, { detected: false, yaw: 60, faceWidth: 0 }));
    const result = measured(rate(record));
    expect(result.items.gaze.value).toBe(1);
    expect(result.items.framing.value).toBe(1);
    expect(result.undetectedSeconds).toBeCloseTo(2);
    expect(result.measuredRatio).toBe(0.8);
  });

  it("gives no total for an empty record", () => {
    expect(rate([]).measured).toBe(false);
  });
});

describe("scoreFace: total", () => {
  it("is the sum of four items out of 16, rounded", () => {
    // gaze 3 (60%), expression 2 (5%), head 2 (still), framing 1 (40%) → 8 / 16 = 50
    const record = frames(10, (t, i) => ({
      lookDown: i < 40 ? 0.9 : 0.1,
      smile: i >= 40 && i < 45 ? 0.5 : 0,
      faceWidth: i < 60 ? 0.6 : 0.3,
    }));
    const result = measured(rate(record));
    expect([result.items.gaze, result.items.expression, result.items.head, result.items.framing].map((x) => x.score)).toEqual([
      3, 2, 2, 1,
    ]);
    expect(result.total).toBe(50);
  });
});

describe("scoreFace: boundaries", () => {
  const gazeScore = (looking: number) =>
    measured(rate(frames(10, (_, i) => (i < looking ? {} : { lookDown: 0.9 })))).items.gaze.score;

  it.each([
    [70, 4],
    [69, 3],
    [50, 3],
    [49, 2],
    [30, 2],
    [29, 1],
    [10, 1],
    [9, 0],
  ])("looking at the screen in %i%% of frames scores %i for gaze", (looking, score) => {
    expect(gazeScore(looking)).toBe(score);
  });

  it.each([
    ["yaw", { yaw: 15 }, false],
    ["yaw", { yaw: -14.9 }, true],
    ["pitch", { pitch: -15 }, false],
    ["pitch", { pitch: 14.9 }, true],
    ["lookDown", { lookDown: 0.3 }, false],
    ["lookDown", { lookDown: 0.29 }, true],
    ["lookAway", { lookAway: 0.3 }, false],
    ["lookAway", { lookAway: 0.29 }, true],
  ])("counts a frame with %s %o as looking at the screen: %s", (_, frame, looking) => {
    const result = measured(rate(frames(10, () => frame)));
    expect(result.items.gaze.value).toBe(looking ? 1 : 0);
  });

  it.each([
    [15, 4],
    [14, 3],
    [8, 3],
    [7, 2],
    [3, 2],
    [2, 1],
  ])("smiling in %i%% of frames scores %i for expression", (smiling, score) => {
    const result = measured(rate(frames(10, share(smiling, { smile: 0.5 }))));
    expect(result.items.expression.score).toBe(score);
  });

  it("does not count a smile value of exactly 0.2", () => {
    expect(measured(rate(frames(10, () => ({ smile: 0.2 })))).items.expression.value).toBe(0);
    expect(measured(rate(frames(10, () => ({ smile: 0.21 })))).items.expression.value).toBe(1);
  });

  it.each([
    [2, 4],
    [8, 4],
    [1.9, 3],
    [1, 3],
    [8.1, 3],
    [12, 3],
    [0.9, 2],
    [12.1, 2],
    [18, 2],
    [18.1, 1],
  ])("an average yaw spread of %f degrees scores %i for head movement", (spread, score) => {
    expect(measured(rate(frames(10, swing(spread)))).items.head.score).toBe(score);
  });

  it.each([
    [90, 4],
    [89, 3],
    [75, 3],
    [74, 2],
    [50, 2],
    [49, 1],
  ])("a well-framed face in %i%% of frames scores %i for framing", (framed, score) => {
    const result = measured(rate(frames(10, (_, i) => (i < framed ? {} : { faceWidth: 0.6 }))));
    expect(result.items.framing.score).toBe(score);
  });

  it("counts a face width of exactly 0.15 or 0.5 as well framed", () => {
    expect(measured(rate(frames(10, () => ({ faceWidth: 0.15 })))).items.framing.value).toBe(1);
    expect(measured(rate(frames(10, () => ({ faceWidth: 0.5 })))).items.framing.value).toBe(1);
  });
});

describe("scoreFace: reasons", () => {
  it("gives each item a one-line reason with the measured number", () => {
    const record = frames(10, (_, i) => ({ lookDown: i < 28 ? 0.9 : 0.1, ...swing(5)(0, i) }));
    const { items } = measured(rate(record));
    expect(items.gaze.reason).toBe("화면을 본 시간 72%");
    expect(items.expression.reason).toBe("웃는 표정 0%");
    expect(items.head.reason).toBe("1초마다 고개 좌우 움직임 평균 5도");
    expect(items.framing.reason).toBe("얼굴이 화면 안 알맞은 크기였던 시간 100%");
  });
});

describe("scoreFace: reference pose", () => {
  // A laptop camera above the screen sees a speaker who looks at the screen as looking down.
  const cameraAbove = frames(10, () => ({ pitch: -20 }));

  it("counts looking at the screen from the reference pose, not from facing the camera", () => {
    expect(measured(rate(cameraAbove, { ...FRONT, pitch: -20 })).items.gaze.value).toBe(1);
    expect(measured(rate(cameraAbove, FRONT)).items.gaze.value).toBe(0);
  });

  it.each([
    ["yaw 15 degrees from the reference", { yaw: 20 }, false],
    ["yaw 14.9 degrees from the reference", { yaw: -9.9 }, true],
    ["pitch 15 degrees from the reference", { pitch: -25 }, false],
    ["pitch 14.9 degrees from the reference", { pitch: 4.9 }, true],
  ])("with a reference pose of yaw 5 and pitch -10, a frame %s counts as looking: %s", (_, frame, looking) => {
    const result = measured(rate(frames(10, () => frame), { ...FRONT, yaw: 5, pitch: -10 }));
    expect(result.items.gaze.value).toBe(looking ? 1 : 0);
  });

  it("does not change head movement, which only looks at how much the head moves", () => {
    const record = frames(10, swing(5));
    expect(measured(rate(record, { ...FRONT, yaw: 30 })).items.head.value).toBeCloseTo(5);
  });

  // A speaker whose eyes read 0.3 down and 0.1 aside while looking at the screen, and whose mouth reads 0.1.
  const USUAL = { ...FRONT, lookDown: 0.3, lookAway: 0.1, smile: 0.1 };

  it("counts eyes from the reference pose: a usual 0.3 down is looking at the screen", () => {
    const record = frames(10, () => ({ lookDown: 0.4, lookAway: 0.2 }));
    expect(measured(rate(record, USUAL)).items.gaze.value).toBe(1);
    expect(measured(rate(record, FRONT)).items.gaze.value).toBe(0);
  });

  it.each([
    ["eyes 0.3 further down", { lookDown: 0.6 }, false],
    ["eyes 0.29 further down", { lookDown: 0.59 }, true],
    ["eyes 0.3 further aside", { lookAway: 0.4 }, false],
    ["eyes 0.29 further aside", { lookAway: 0.39 }, true],
    ["eyes less down than usual", { lookDown: 0 }, true],
  ])("with the usual eyes, a frame with %s counts as looking: %s", (_, frame, looking) => {
    expect(measured(rate(frames(10, () => frame), USUAL)).items.gaze.value).toBe(looking ? 1 : 0);
  });

  it.each([
    ["0.2 above the usual mouth", 0.3, 0],
    ["0.21 above the usual mouth", 0.31, 1],
    ["below the usual mouth", 0, 0],
  ])("counts a smile from the reference pose: %s is smiling in %i of frames", (_, smile, value) => {
    expect(measured(rate(frames(10, () => ({ smile })), USUAL)).items.expression.value).toBe(value);
  });
});

describe("measureBaseline", () => {
  it("averages yaw and pitch over the frames where the face was found", () => {
    const record = frames(3, (_, i) => (i % 3 === 0 ? { detected: false, yaw: 90 } : { yaw: i % 2 === 0 ? 4 : 6, pitch: -12 }));
    const result = measureBaseline(record);
    if (!result.ok) throw new Error("expected a baseline");
    expect(result.baseline.yaw).toBeCloseTo(5, 0);
    expect(result.baseline.pitch).toBeCloseTo(-12);
  });

  it("also averages the eye and smile values over the frames where the face was found", () => {
    const record = frames(3, (_, i) =>
      i % 3 === 0
        ? { detected: false, lookDown: 0.9, lookAway: 0.9, smile: 0.9 }
        : { lookDown: i % 2 === 0 ? 0.2 : 0.4, lookAway: 0.1, smile: 0.05 },
    );
    const result = measureBaseline(record);
    if (!result.ok) throw new Error("expected a baseline");
    expect(result.baseline.lookDown).toBeCloseTo(0.3, 1);
    expect(result.baseline.lookAway).toBeCloseTo(0.1);
    expect(result.baseline.smile).toBeCloseTo(0.05);
  });

  it("asks to measure again when the face was found in less than half of the frames", () => {
    const record = frames(3, (_, i) => (i < 16 ? { detected: false } : {}));
    expect(measureBaseline(record)).toEqual({
      ok: false,
      message: "얼굴을 찾지 못했어요. 얼굴이 화면 가운데 보이게 한 뒤 다시 재 주세요",
    });
  });

  it("uses a measurement where the face was found in exactly half of the frames", () => {
    expect(measureBaseline(frames(3, (_, i) => (i < 15 ? { detected: false } : {}))).ok).toBe(true);
  });

  it("asks to measure again when nothing was recorded", () => {
    expect(measureBaseline([]).ok).toBe(false);
  });
});

describe("result screen text", () => {
  it("lists the four items in a fixed order with their scores out of 4", () => {
    const result = measured(rate(frames(10, (_, i) => ({ lookDown: i < 40 ? 0.9 : 0.1 }))));
    expect(faceItems(result)).toEqual([
      { label: "시선", score: "3 / 4", reason: result.items.gaze.reason },
      { label: "표정", score: "1 / 4", reason: result.items.expression.reason },
      { label: "고개 움직임", score: "2 / 4", reason: result.items.head.reason },
      { label: "화면 안 자세", score: "4 / 4", reason: result.items.framing.reason },
    ]);
  });

  it("says which 10-second stretch had low gaze", () => {
    expect(lowGazeLabel({ start: 10, end: 20 })).toBe("0분 10초~0분 20초");
    expect(lowGazeLabel({ start: 60, end: 65.3 })).toBe("1분 0초~1분 5초");
  });

  it("shows unmeasured time in seconds", () => {
    expect(undetectedLabel(2)).toBe("측정 불가 시간 2초");
    expect(undetectedLabel(0.04)).toBe("측정 불가 시간 0초");
  });

  it("explains why there is no score when the face was found too rarely", () => {
    expect(notEnoughFaceDetail(0.42)).toBe("얼굴을 찾은 시간이 42%예요. 절반 이상 보여야 점수를 낼 수 있어요.");
  });

  it("states that the score is for practice only and that the baselines are design values", () => {
    expect(FACE_PRACTICE_NOTICE).toBe("연습용 참고 점수예요. 채점이나 평가에 쓰지 마세요.");
    expect(FACE_DESIGN_NOTICE).toContain("설계 값");
    expect(NO_CAMERA_NOTE).toBe("카메라를 켜지 않아 얼굴 행동 점수는 없어요.");
  });
});
