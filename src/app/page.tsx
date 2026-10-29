"use client";

import { useState, type FormEvent } from "react";
import type { CheckedReview, ReviewResult } from "@/lib/types";
import { practiceQuestions, shouldAutoRetry } from "@/lib/validate";
import styles from "./page.module.css";

type Phase =
  | { name: "input"; error: string | null }
  | { name: "preparing"; retrying: boolean }
  | { name: "failed"; message: string }
  | { name: "practice"; index: number };

// Kept hidden until the final evaluation screen.
interface Prepared {
  review: CheckedReview;
  notices: string[];
  estimatedSeconds: number;
}

const SERVER_UNREACHABLE = "앱 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인하고 다시 시도해 주세요.";

export default function Home() {
  const [script, setScript] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [limitMinutes, setLimitMinutes] = useState("3");
  const [phase, setPhase] = useState<Phase>({ name: "input", error: null });
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  async function requestReview(): Promise<ReviewResult> {
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, topic, audience, limitSeconds: Math.round(Number(limitMinutes) * 60) }),
      });
      return (await response.json()) as ReviewResult;
    } catch {
      return { ok: false, kind: "unknown", message: SERVER_UNREACHABLE };
    }
  }

  async function prepare() {
    setPhase({ name: "preparing", retrying: false });
    let result = await requestReview();
    if (!result.ok && shouldAutoRetry(result.kind, 0)) {
      setPhase({ name: "preparing", retrying: true });
      result = await requestReview();
    }

    if (result.ok) {
      setPrepared({ review: result.review, notices: result.notices, estimatedSeconds: result.estimatedSeconds });
      setPhase({ name: "practice", index: 0 });
    } else if (result.kind === "bad_input") {
      setPhase({ name: "input", error: result.message });
    } else {
      setPhase({ name: "failed", message: result.message });
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void prepare();
  }

  function backToInput() {
    setPrepared(null);
    setPhase({ name: "input", error: null });
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>발표 코치</h1>
        <p>대본을 넣으면 심사위원처럼 질문 3개를 물어봐요. 다 답하면 대본과 답변 평가를 보여 줘요.</p>
      </header>

      {phase.name === "input" && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            발표 대본
            <textarea value={script} onChange={(e) => setScript(e.target.value)} required />
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
              required
            />
          </label>
          {phase.error && (
            <p className={styles.alert} role="alert">
              {phase.error}
            </p>
          )}
          <div className={styles.actions}>
            <button className={styles.primary} type="submit">
              질문 받기
            </button>
          </div>
        </form>
      )}

      {phase.name === "preparing" && (
        <div className={styles.status} role="status" aria-live="polite">
          <p>{phase.retrying ? "한 번 더 받아 오는 중이에요" : "질문 준비 중이에요"}</p>
          <p>잠시만 기다려 주세요.</p>
        </div>
      )}

      {phase.name === "failed" && (
        <div className={styles.form}>
          <p className={styles.alert} role="alert">
            {phase.message}
          </p>
          <div className={styles.actions}>
            <button className={styles.primary} type="button" onClick={() => void prepare()}>
              다시 시도
            </button>
            <button className={styles.secondary} type="button" onClick={backToInput}>
              대본 고치기
            </button>
          </div>
        </div>
      )}

      {phase.name === "practice" && prepared && (
        <PracticeQuestion review={prepared.review} index={phase.index} onRestart={backToInput} />
      )}
    </main>
  );
}

function PracticeQuestion({
  review,
  index,
  onRestart,
}: {
  review: CheckedReview;
  index: number;
  onRestart: () => void;
}) {
  const questions = practiceQuestions(review);
  const current = questions[index];
  return (
    <section className={styles.card} aria-live="polite">
      <p className={styles.progress}>
        질문 {index + 1} / {questions.length}
      </p>
      <p className={styles.question}>{current.question}</p>
      <div className={styles.actions}>
        <button className={styles.secondary} type="button" onClick={onRestart}>
          처음으로
        </button>
      </div>
    </section>
  );
}
