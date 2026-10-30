import { describe, expect, it } from "vitest";
import {
  CAMERA_BLOCKED_MESSAGE,
  CAMERA_BUSY_MESSAGE,
  CAMERA_FAILED_MESSAGE,
  CAMERA_NOTICE,
  NO_CAMERA_MESSAGE,
  RateMeter,
  cameraErrorMessage,
  frameFromResult,
  headAngles,
} from "@/lib/faceTracker";

const DEG = Math.PI / 180;

/** A 4x4 transform for a head turned by yaw (around the vertical axis) then pitch, flattened column by column. */
function transform(yawDeg: number, pitchDeg: number, scale = 1): number[] {
  const [a, b] = [yawDeg * DEG, pitchDeg * DEG];
  const r = [
    [Math.cos(a), Math.sin(a) * Math.sin(b), Math.sin(a) * Math.cos(b)],
    [0, Math.cos(b), -Math.sin(b)],
    [-Math.sin(a), Math.cos(a) * Math.sin(b), Math.cos(a) * Math.cos(b)],
  ];
  const data = new Array(16).fill(0);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) data[col * 4 + row] = r[row][col] * scale;
  data[15] = 1;
  return data;
}

function category(categoryName: string, score: number) {
  return { categoryName, score, index: 0, displayName: "" };
}

function result(options: { yaw?: number; pitch?: number; landmarksX?: number[]; blend?: Record<string, number> } = {}) {
  const { yaw = 0, pitch = 0, landmarksX = [0.4, 0.5, 0.7], blend = {} } = options;
  return {
    faceLandmarks: [landmarksX.map((x) => ({ x, y: 0.5, z: 0, visibility: 1 }))],
    faceBlendshapes: [
      { categories: Object.entries(blend).map(([name, score]) => category(name, score)), headIndex: 0, headName: "" },
    ],
    facialTransformationMatrixes: [{ rows: 4, columns: 4, data: transform(yaw, pitch) }],
  };
}

describe("headAngles", () => {
  it("reads left-right and up-down head angles from the face transform", () => {
    const angles = headAngles(transform(20, -10));
    expect(angles.yaw).toBeCloseTo(20);
    expect(angles.pitch).toBeCloseTo(-10);
  });

  it("is zero for a face looking straight at the camera", () => {
    const angles = headAngles(transform(0, 0));
    expect(angles.yaw).toBeCloseTo(0);
    expect(angles.pitch).toBeCloseTo(0);
  });

  it("does not depend on how big the face is in the frame", () => {
    const angles = headAngles(transform(-30, 15, 2.5));
    expect(angles.yaw).toBeCloseTo(-30);
    expect(angles.pitch).toBeCloseTo(15);
  });
});

describe("frameFromResult", () => {
  it("keeps only the values the score needs", () => {
    const frame = frameFromResult(
      result({
        yaw: 10,
        pitch: -5,
        landmarksX: [0.3, 0.45, 0.6],
        blend: {
          eyeLookDownLeft: 0.2,
          eyeLookDownRight: 0.4,
          eyeLookOutLeft: 0.1,
          eyeLookInLeft: 0.6,
          eyeLookOutRight: 0.3,
          eyeLookInRight: 0.2,
          mouthSmileLeft: 0.5,
          mouthSmileRight: 0.3,
          browInnerUp: 0.9,
        },
      }),
      12.3,
    );
    expect(frame).toEqual({
      t: 12.3,
      detected: true,
      yaw: expect.closeTo(10),
      pitch: expect.closeTo(-5),
      lookDown: expect.closeTo(0.3),
      lookAway: expect.closeTo(0.6),
      smile: expect.closeTo(0.4),
      faceWidth: expect.closeTo(0.3),
    });
  });

  it("treats missing blendshapes as 0", () => {
    const frame = frameFromResult(result(), 0);
    expect([frame.lookDown, frame.lookAway, frame.smile]).toEqual([0, 0, 0]);
  });

  it("marks a frame without a face as not detected", () => {
    const empty = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] };
    expect(frameFromResult(empty, 4)).toEqual({
      t: 4,
      detected: false,
      yaw: 0,
      pitch: 0,
      lookDown: 0,
      lookAway: 0,
      smile: 0,
      faceWidth: 0,
    });
  });
});

describe("RateMeter", () => {
  it("counts measurements in the last second", () => {
    const meter = new RateMeter();
    for (let ms = 0; ms < 2000; ms += 100) meter.tick(ms);
    expect(meter.perSecond(1950)).toBe(10);
  });

  it("drops measurements older than a second", () => {
    const meter = new RateMeter();
    [0, 100, 200, 1500].forEach((ms) => meter.tick(ms));
    expect(meter.perSecond(1600)).toBe(1);
    expect(meter.perSecond(5000)).toBe(0);
  });
});

describe("cameraErrorMessage", () => {
  it("explains a blocked camera", () => {
    expect(cameraErrorMessage(new DOMException("denied", "NotAllowedError"))).toBe(CAMERA_BLOCKED_MESSAGE);
    expect(cameraErrorMessage(new DOMException("insecure", "SecurityError"))).toBe(CAMERA_BLOCKED_MESSAGE);
  });

  it("explains a missing camera", () => {
    expect(cameraErrorMessage(new DOMException("none", "NotFoundError"))).toBe(NO_CAMERA_MESSAGE);
    expect(cameraErrorMessage(new DOMException("none", "OverconstrainedError"))).toBe(NO_CAMERA_MESSAGE);
  });

  it("explains a camera another program is using", () => {
    expect(cameraErrorMessage(new DOMException("busy", "NotReadableError"))).toBe(CAMERA_BUSY_MESSAGE);
  });

  it("falls back to a general message", () => {
    expect(cameraErrorMessage(new Error("strange"))).toBe(CAMERA_FAILED_MESSAGE);
  });

  it("uses plain words without English error names", () => {
    for (const message of [CAMERA_BLOCKED_MESSAGE, NO_CAMERA_MESSAGE, CAMERA_BUSY_MESSAGE, CAMERA_FAILED_MESSAGE]) {
      expect(message).not.toMatch(/[A-Za-z]{3,}/);
    }
  });
});

describe("CAMERA_NOTICE", () => {
  it("says the video is not saved or sent anywhere", () => {
    expect(CAMERA_NOTICE).toBe("카메라 영상은 저장하지 않고 브라우저 밖으로 보내지 않아요.");
  });
});
