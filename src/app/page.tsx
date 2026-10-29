"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  appendTranscript,
  availabilityMessage,
  checkDictation,
  installDictation,
  speak,
  startListening,
  type DictationStatus,
} from "@/lib/speech";
import type { CheckedReview, Question, ReviewResult } from "@/lib/types";
import { answerLabel, inputError, isAnswered, practiceQuestions, shouldAutoRetry } from "@/lib/validate";
import styles from "./page.module.css";

type Phase =
  | { name: "input"; error: string | null }
  | { name: "preparing"; retrying: boolean }
  | { name: "failed"; message: string }
  | { name: "practice"; index: number }
  | { name: "answered" };

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
  const [answers, setAnswers] = useState<string[]>([]);

  const limitSeconds = Math.round(Number(limitMinutes) * 60);

  async function requestReview(): Promise<ReviewResult> {
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, topic, audience, limitSeconds }),
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
      setAnswers(result.review.questions.map(() => ""));
      setPhase({ name: "practice", index: 0 });
    } else if (result.kind === "bad_input") {
      setPhase({ name: "input", error: result.message });
    } else {
      setPhase({ name: "failed", message: result.message });
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // The browser's own bubbles are off (noValidate), so the app shows its message instead.
    const error = inputError(script, limitSeconds);
    if (error !== null) setPhase({ name: "input", error });
    else void prepare();
  }

  function backToInput() {
    setPrepared(null);
    setAnswers([]);
    setPhase({ name: "input", error: null });
  }

  function setAnswer(index: number, text: string) {
    setAnswers((current) => current.map((answer, i) => (i === index ? text : answer)));
  }

  function nextQuestion(index: number) {
    if (index + 1 < answers.length) setPhase({ name: "practice", index: index + 1 });
    else setPhase({ name: "answered" });
  }

  const questions = prepared ? practiceQuestions(prepared.review) : [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>발표 코치</h1>
        <p>대본을 넣으면 심사위원처럼 질문 3개를 물어봐요. 다 답하면 대본과 답변 평가를 보여 줘요.</p>
      </header>

      {phase.name === "input" && (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
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
        <PracticeQuestion
          key={phase.index}
          question={questions[phase.index]}
          index={phase.index}
          total={questions.length}
          answer={answers[phase.index]}
          onAnswerChange={(text) => setAnswer(phase.index, text)}
          onNext={() => nextQuestion(phase.index)}
          onRestart={backToInput}
        />
      )}

      {phase.name === "answered" && (
        <section className={styles.card}>
          <p className={styles.progress}>답변을 모두 모았어요</p>
          <ol className={styles.answerList}>
            {questions.map((q, i) => (
              <li key={q.type}>
                <p className={styles.answerQuestion}>{q.question}</p>
                <p className={isAnswered(answers[i]) ? undefined : styles.muted}>{answerLabel(answers[i])}</p>
              </li>
            ))}
          </ol>
          <p className={styles.muted}>평가는 다음 단계에서 연결할 예정이에요.</p>
          <div className={styles.actions}>
            <button className={styles.secondary} type="button" onClick={backToInput}>
              처음으로
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function PracticeQuestion({
  question,
  index,
  total,
  answer,
  onAnswerChange,
  onNext,
  onRestart,
}: {
  question: Pick<Question, "type" | "question">;
  index: number;
  total: number;
  answer: string;
  onAnswerChange: (text: string) => void;
  onNext: () => void;
  onRestart: () => void;
}) {
  const [dictation, setDictation] = useState<DictationStatus | "checking">("checking");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);
  const stopReadingRef = useRef<() => void>(() => {});
  const stopListeningRef = useRef<(() => void) | null>(null);
  // Recognized pieces can arrive before the next render, so the latest answer lives in a ref too.
  const answerRef = useRef(answer);

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  useEffect(() => {
    void checkDictation().then(setDictation);
  }, []);

  useEffect(() => {
    stopReadingRef.current = speak(question.question);
    return () => {
      stopReadingRef.current();
      stopListeningRef.current?.();
    };
  }, [question.question]);

  function readAgain() {
    stopListeningRef.current?.();
    stopReadingRef.current = speak(question.question);
  }

  function startAnswering() {
    stopReadingRef.current();
    setSpeechError(null);
    setListening(true);
    stopListeningRef.current = startListening({
      onFinal: (text) => {
        const next = appendTranscript(answerRef.current, text);
        answerRef.current = next;
        onAnswerChange(next);
      },
      onInterim: setInterim,
      onError: setSpeechError,
      onEnd: () => {
        setListening(false);
        setInterim("");
        stopListeningRef.current = null;
      },
    });
  }

  function stopAnswering() {
    stopListeningRef.current?.();
  }

  function answerAgain() {
    stopAnswering();
    answerRef.current = "";
    onAnswerChange("");
  }

  function goNext() {
    stopAnswering();
    stopReadingRef.current();
    onNext();
  }

  async function prepareDictation() {
    setDictation("downloading");
    const installed = await installDictation();
    setDictation(installed ? await checkDictation() : "unavailable");
  }

  const isLast = index + 1 === total;
  const dictationNote = dictation === "checking" ? null : availabilityMessage(dictation);

  return (
    <section className={styles.card} aria-live="polite">
      <p className={styles.progress}>
        질문 {index + 1} / {total}
      </p>
      <p className={styles.question}>{question.question}</p>
      <div className={styles.actions}>
        <button className={styles.secondary} type="button" onClick={readAgain}>
          다시 듣기
        </button>
      </div>

      <label className={styles.field}>
        내 답
        <textarea
          className={styles.answer}
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="말로 답하거나 여기에 글로 써 주세요. 답하지 않고 넘어가도 돼요."
        />
      </label>
      {listening && <p className={styles.muted}>듣는 중이에요{interim ? `: ${interim}` : ""}</p>}

      <div className={styles.actions}>
        {dictation === "available" &&
          (listening ? (
            <button className={styles.primary} type="button" onClick={stopAnswering}>
              그만 말하기
            </button>
          ) : (
            <button className={styles.primary} type="button" onClick={startAnswering}>
              말로 답하기
            </button>
          ))}
        {dictation === "downloadable" && (
          <button className={styles.secondary} type="button" onClick={() => void prepareDictation()}>
            한국어 받아쓰기 준비하기
          </button>
        )}
        <button className={styles.secondary} type="button" onClick={answerAgain} disabled={!answer && !listening}>
          다시 답하기
        </button>
      </div>
      {dictationNote && <p className={styles.muted}>{dictationNote}</p>}
      {speechError && (
        <p className={styles.alert} role="alert">
          {speechError}
        </p>
      )}

      <div className={styles.actions}>
        <button className={styles.primary} type="button" onClick={goNext}>
          {isLast ? "평가 받기" : "다음 질문"}
        </button>
        <button className={styles.secondary} type="button" onClick={onRestart}>
          처음으로
        </button>
      </div>
    </section>
  );
}
