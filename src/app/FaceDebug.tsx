"use client";

import { useEffect, useRef, useState } from "react";
import { BASELINE_SECONDS } from "@/lib/faceConfig";
import { isLookingAtScreen, measureBaseline, type FaceBaseline, type FaceFrame } from "@/lib/faceScore";
import { BASELINE_PROMPT, CAMERA_NOTICE, startFaceTracker, type FaceTracker } from "@/lib/faceTracker";
import styles from "./VoiceDebug.module.css";

// Development-only panel for checking the camera, MediaPipe, and the reference pose before the
// rehearsal screen uses them. Shows the current measurements; nothing is recorded or sent.

type State =
  | { name: "off" }
  | { name: "starting" }
  | { name: "on" }
  | { name: "failed"; message: string };

type Baseline =
  | { name: "none" }
  | { name: "measuring" }
  | { name: "done"; baseline: FaceBaseline }
  | { name: "failed"; message: string };

function degrees(value: number): string {
  return `${value.toFixed(1)}°`;
}

export default function FaceDebug() {
  const [state, setState] = useState<State>({ name: "off" });
  const [baseline, setBaseline] = useState<Baseline>({ name: "none" });
  const [frame, setFrame] = useState<FaceFrame | null>(null);
  const [perSecond, setPerSecond] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const tracker = useRef<FaceTracker | null>(null);

  useEffect(() => () => tracker.current?.stop(), []);

  async function start() {
    if (!video.current) return;
    setState({ name: "starting" });
    const result = await startFaceTracker(video.current, (next, rate) => {
      setFrame(next);
      setPerSecond(rate);
    });
    if (!result.ok) {
      setState({ name: "failed", message: result.message });
      return;
    }
    tracker.current = result.tracker;
    setState({ name: "on" });
  }

  function stop() {
    tracker.current?.stop();
    tracker.current = null;
    setFrame(null);
    setBaseline({ name: "none" });
    setState({ name: "off" });
  }

  function measure() {
    tracker.current?.takeFrames();
    setBaseline({ name: "measuring" });
    setTimeout(() => {
      const result = measureBaseline(tracker.current?.takeFrames() ?? []);
      setBaseline(result.ok ? { name: "done", baseline: result.baseline } : { name: "failed", message: result.message });
    }, BASELINE_SECONDS * 1000);
  }

  const base = baseline.name === "done" ? baseline.baseline : null;

  return (
    <aside className={`${styles.panel} ${styles.left}`} aria-label="카메라 확인 (개발용)">
      <p className={styles.title}>카메라 확인 (개발용)</p>
      <video ref={video} className={styles.video} muted playsInline hidden={state.name !== "on"} />

      {state.name === "on" ? (
        <>
          <dl className={styles.values}>
            <dt>얼굴</dt>
            <dd>{frame?.detected ? "찾음" : "못 찾음"}</dd>
            <dt>초당 측정</dt>
            <dd>{perSecond}번</dd>
            {frame?.detected && (
              <>
                <dt>yaw / pitch</dt>
                <dd>
                  {degrees(frame.yaw)} / {degrees(frame.pitch)}
                </dd>
                {base && (
                  <>
                    <dt>기준과 차이</dt>
                    <dd>
                      {degrees(frame.yaw - base.yaw)} / {degrees(frame.pitch - base.pitch)}
                    </dd>
                    <dt>화면을 봄</dt>
                    <dd>{isLookingAtScreen(frame, base) ? "예" : "아니요"}</dd>
                  </>
                )}
                <dt>웃음</dt>
                <dd>{frame.smile.toFixed(2)}</dd>
                <dt>눈 아래 / 옆</dt>
                <dd>
                  {frame.lookDown.toFixed(2)} / {frame.lookAway.toFixed(2)}
                </dd>
                <dt>얼굴 너비</dt>
                <dd>{frame.faceWidth.toFixed(2)}</dd>
              </>
            )}
          </dl>

          {baseline.name === "measuring" && <p className={styles.speaking}>{BASELINE_PROMPT}</p>}
          {baseline.name === "done" && (
            <p className={styles.note}>
              기준 자세 {degrees(baseline.baseline.yaw)} / {degrees(baseline.baseline.pitch)}
            </p>
          )}
          {baseline.name === "failed" && <p className={styles.error}>{baseline.message}</p>}
          <button type="button" className={styles.button} onClick={measure} disabled={baseline.name === "measuring"}>
            {baseline.name === "none" ? `기준 자세 재기 (${BASELINE_SECONDS}초)` : "기준 자세 다시 재기"}
          </button>
          <button type="button" className={styles.button} onClick={stop}>
            끄기
          </button>
        </>
      ) : (
        <>
          <p className={styles.note}>{CAMERA_NOTICE}</p>
          {state.name === "failed" && <p className={styles.error}>{state.message}</p>}
          <button type="button" className={styles.button} onClick={start} disabled={state.name === "starting"}>
            {state.name === "starting" ? "켜는 중…" : "카메라 켜기"}
          </button>
        </>
      )}
    </aside>
  );
}
