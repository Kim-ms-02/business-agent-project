"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { micUsage, startVoiceTracker, type LiveVoice, type VoiceTracker } from "@/lib/voiceTracker";
import styles from "./VoiceDebug.module.css";

// Development-only panel for checking the microphone and vad-web before rehearsal mode exists.
// Shows whether speech is detected right now and the current volume; nothing is recorded.

const OWNER = "debug";

type State =
  | { name: "off"; summary: string | null }
  | { name: "starting" }
  | { name: "on"; live: LiveVoice }
  | { name: "failed"; message: string };

export default function VoiceDebug() {
  const [state, setState] = useState<State>({ name: "off", summary: null });
  const tracker = useRef<VoiceTracker | null>(null);
  // While a rehearsal has the microphone, this panel stays off.
  const busy = useSyncExternalStore(
    micUsage.subscribe,
    () => micUsage.busyFor(OWNER),
    () => false,
  );

  useEffect(() => () => void tracker.current?.stop(), []);

  async function start() {
    setState({ name: "starting" });
    const result = await startVoiceTracker(OWNER, (live) => setState({ name: "on", live }));
    if (!result.ok) {
      setState({ name: "failed", message: result.message });
      return;
    }
    tracker.current = result.tracker;
    setState({ name: "on", live: { speaking: false, level: 0 } });
  }

  async function stop() {
    const record = await tracker.current?.stop();
    tracker.current = null;
    const spoken = record?.segments.reduce((sum, s) => sum + (s.end - s.start), 0) ?? 0;
    setState({
      name: "off",
      summary: record ? `말한 구간 ${record.segments.length}개, 말한 시간 ${spoken.toFixed(1)}초` : null,
    });
  }

  const level = state.name === "on" ? Math.round(state.live.level * 100) : 0;

  return (
    <section className={styles.pane} aria-label="마이크 확인 (개발용)">
      <p className={styles.title}>마이크 확인 (개발용)</p>
      {state.name === "on" ? (
        <>
          <p className={state.live.speaking ? styles.speaking : styles.quiet}>
            {state.live.speaking ? "말하는 중" : "조용함"}
          </p>
          <div
            className={styles.meter}
            role="meter"
            aria-label="소리 크기"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={level}
          >
            <div className={styles.fill} style={{ width: `${level}%` }} />
          </div>
          <p className={styles.note}>소리 크기 {level}</p>
          <button type="button" className={styles.button} onClick={stop}>
            끄기
          </button>
        </>
      ) : (
        <>
          {state.name === "failed" && <p className={styles.error}>{state.message}</p>}
          {state.name === "off" && state.summary && <p className={styles.note}>{state.summary}</p>}
          {busy && <p className={styles.note}>리허설 중에는 켤 수 없어요.</p>}
          <button
            type="button"
            className={styles.button}
            onClick={start}
            disabled={busy || state.name === "starting"}
          >
            {state.name === "starting" ? "켜는 중…" : "마이크 켜기"}
          </button>
        </>
      )}
    </section>
  );
}
