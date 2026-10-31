"use client";

import { useDraft } from "./DraftProvider";
import styles from "./practice/page.module.css";

// The script input box at the top of question practice and the rehearsal (v1.1). Both pages show
// the same shared inputs, so what is typed on one page is there on the other.

export default function DraftFields() {
  const { script, setScript, topic, setTopic, audience, setAudience, limitMinutes, setLimitMinutes } = useDraft();
  return (
    <>
      <label className={styles.field}>
        발표 대본
        <textarea value={script} onChange={(e) => setScript(e.target.value)} />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          주제
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="예: 학교 식당 잔반 줄이기 앱" />
        </label>
        <label className={styles.field}>
          듣는 사람
          <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="예: 같은 학과 1학년 학생" />
        </label>
      </div>
      <label className={`${styles.field} ${styles.limit}`}>
        제한 시간(분)
        <input
          type="number"
          min={0.5}
          max={60}
          step={0.5}
          value={limitMinutes}
          onChange={(e) => setLimitMinutes(e.target.value)}
        />
      </label>
    </>
  );
}

/** The time limit in seconds, from the shared minutes field. */
export function limitSecondsOf(limitMinutes: string): number {
  return Math.round(Number(limitMinutes) * 60);
}
