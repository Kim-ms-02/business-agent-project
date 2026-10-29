import { FACE_SAMPLE_SECONDS } from "./faceConfig";
import type { FaceFrame } from "./faceScore";

// Turns on the camera and runs MediaPipe Face Landmarker about 10 times a second.
// Everything stays in the browser: no picture or landmark points are kept or sent anywhere,
// only the values in FaceFrame. The camera picture is shown to the speaker only.
// MediaPipe is imported only inside startFaceTracker, so this file can load on the server and in tests.

// ---------- Pure helpers ----------

// Where scripts/prepare-face-assets.mjs puts the model and wasm files.
export const FACE_ASSET_PATH = "/face";
const MODEL_PATH = `${FACE_ASSET_PATH}/face_landmarker.task`;

const DEG = 180 / Math.PI;

/**
 * Left-right (yaw) and up-down (pitch) head angles in degrees from the face transform.
 * The transform is a 4x4 matrix stored column by column; only its rotation is used, so the
 * face's size in the frame does not matter.
 */
export function headAngles(data: number[]): { yaw: number; pitch: number } {
  const at = (row: number, col: number) => data[col * 4 + row];
  const [r02, r12, r22] = [at(0, 2), at(1, 2), at(2, 2)];
  return {
    yaw: Math.atan2(r02, r22) * DEG,
    pitch: Math.atan2(-r12, Math.hypot(r02, r22)) * DEG,
  };
}

interface CategoryLike {
  categoryName: string;
  score: number;
}

interface ResultLike {
  faceLandmarks: { x: number }[][];
  faceBlendshapes: { categories: CategoryLike[] }[];
  facialTransformationMatrixes: { data: number[] }[];
}

function blendshapes(categories: CategoryLike[]): (name: string) => number {
  const scores = new Map(categories.map((c) => [c.categoryName, c.score]));
  return (name) => scores.get(name) ?? 0;
}

/** Keeps only what the face score needs from one MediaPipe result. */
export function frameFromResult(result: ResultLike, t: number): FaceFrame {
  const landmarks = result.faceLandmarks[0];
  const matrix = result.facialTransformationMatrixes[0];
  if (!landmarks || landmarks.length === 0 || !matrix) {
    return { t, detected: false, yaw: 0, pitch: 0, lookDown: 0, lookAway: 0, smile: 0, faceWidth: 0 };
  }

  const score = blendshapes(result.faceBlendshapes[0]?.categories ?? []);
  const xs = landmarks.map((point) => point.x);
  return {
    t,
    detected: true,
    ...headAngles(matrix.data),
    lookDown: (score("eyeLookDownLeft") + score("eyeLookDownRight")) / 2,
    lookAway: Math.max(score("eyeLookOutLeft"), score("eyeLookOutRight"), score("eyeLookInLeft"), score("eyeLookInRight")),
    smile: (score("mouthSmileLeft") + score("mouthSmileRight")) / 2,
    // Landmark x is already divided by the frame width.
    faceWidth: Math.max(...xs) - Math.min(...xs),
  };
}

/** How many measurements happened in the last second. */
export class RateMeter {
  private readonly times: number[] = [];

  tick(nowMs: number): void {
    this.times.push(nowMs);
  }

  perSecond(nowMs: number): number {
    while (this.times.length > 0 && this.times[0] <= nowMs - 1000) this.times.shift();
    return this.times.length;
  }
}

export const CAMERA_NOTICE = "카메라 영상은 저장하지 않고 브라우저 밖으로 보내지 않아요.";
export const BASELINE_PROMPT = "청중을 보듯 화면을 봐 주세요";
export const NO_CAMERA_SUPPORT_MESSAGE = "이 브라우저에서는 카메라를 쓸 수 없어요. 크롬에서 열어 주세요.";
export const CAMERA_BLOCKED_MESSAGE =
  "카메라 사용이 막혀 있어요. 주소창 왼쪽의 아이콘을 눌러 카메라를 허용한 뒤 다시 시도해 주세요.";
export const NO_CAMERA_MESSAGE = "카메라를 찾지 못했어요. 카메라가 연결되어 있는지 확인한 뒤 다시 시도해 주세요.";
export const CAMERA_BUSY_MESSAGE = "다른 프로그램이 카메라를 쓰고 있어요. 그 프로그램을 닫은 뒤 다시 시도해 주세요.";
export const CAMERA_FAILED_MESSAGE = "카메라를 켜지 못했어요. 페이지를 새로 고친 뒤 다시 시도해 주세요.";
export const FACE_MODEL_LOAD_MESSAGE =
  "얼굴을 측정하는 파일을 불러오지 못했어요. 페이지를 새로 고친 뒤 다시 시도해 주세요.";

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return CAMERA_BLOCKED_MESSAGE;
    case "NotFoundError":
    case "OverconstrainedError":
      return NO_CAMERA_MESSAGE;
    case "NotReadableError":
      return CAMERA_BUSY_MESSAGE;
    default:
      return CAMERA_FAILED_MESSAGE;
  }
}

// ---------- Browser ----------

export interface FaceTracker {
  /** Frames since the last call (times from that call), then starts a new batch from 0 seconds. */
  takeFrames(): FaceFrame[];
  /** Turns the camera off and frees the model. */
  stop(): void;
}

export type FaceStartResult = { ok: true; tracker: FaceTracker } | { ok: false; message: string };

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

export async function startFaceTracker(
  video: HTMLVideoElement,
  onFrame: (frame: FaceFrame, perSecond: number) => void,
): Promise<FaceStartResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: NO_CAMERA_SUPPORT_MESSAGE };
  }

  // The camera is opened before the model loads, so a permission problem and a model problem
  // get different messages.
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    return { ok: false, message: cameraErrorMessage(error) };
  }

  let landmarker;
  try {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(FACE_ASSET_PATH);
    const create = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
    landmarker = await create("GPU").catch(() => create("CPU"));
  } catch (error) {
    console.error(error);
    stopStream(stream);
    video.srcObject = null;
    return { ok: false, message: FACE_MODEL_LOAD_MESSAGE };
  }

  const meter = new RateMeter();
  let frames: FaceFrame[] = [];
  let batchStart = performance.now();
  let lastTimestamp = 0;

  // About 10 measurements a second, not one per screen refresh.
  const timer = setInterval(() => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const now = performance.now();
    if (now <= lastTimestamp) return;
    lastTimestamp = now;
    const result = landmarker.detectForVideo(video, now);
    const frame = frameFromResult(result, Math.round(((now - batchStart) / 1000) * 100) / 100);
    frames.push(frame);
    meter.tick(now);
    onFrame(frame, meter.perSecond(now));
  }, FACE_SAMPLE_SECONDS * 1000);

  return {
    ok: true,
    tracker: {
      takeFrames() {
        const taken = frames;
        frames = [];
        batchStart = performance.now();
        return taken;
      },
      stop() {
        clearInterval(timer);
        landmarker.close();
        stopStream(stream);
        video.srcObject = null;
      },
    },
  };
}
