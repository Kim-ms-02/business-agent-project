"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { QUESTION_COUNT } from "@/lib/coachConfig";
import {
  appendTranscript,
  canDictate,
  DICTATION_NOTICE,
  NO_DICTATION_MESSAGE,
  speak,
  startListening,
} from "@/lib/speech";
import type { AnswerEvaluation, AnswerResult, CheckedReview, Question, ReviewResult } from "@/lib/types";
import {
  answerLabel,
  evaluationLabel,
  feedbackLines,
  inputError,
  isAnswered,
  practiceQuestions,
  shouldAutoRetry,
} from "@/lib/validate";
import styles from "./page.module.css";

type Phase =
  | { name: "input"; error: string | null }
  | { name: "preparing"; retrying: boolean }
  | { name: "failed"; message: string }
  | { name: "practice"; index: number }
  | { name: "evaluating"; retrying: boolean }
  | { name: "evaluationFailed"; message: string }
  | { name: "result"; evaluations: AnswerEvaluation[]; notices: string[] };

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

  async function requestEvaluation(): Promise<AnswerResult> {
    try {
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, questions: prepared?.review.questions ?? [], answers }),
      });
      return (await response.json()) as AnswerResult;
    } catch {
      return { ok: false, kind: "unknown", message: SERVER_UNREACHABLE };
    }
  }

  async function evaluate() {
    setPhase({ name: "evaluating", retrying: false });
    let result = await requestEvaluation();
    if (!result.ok && shouldAutoRetry(result.kind, 0)) {
      setPhase({ name: "evaluating", retrying: true });
      result = await requestEvaluation();
    }

    if (result.ok) setPhase({ name: "result", evaluations: result.evaluations, notices: result.notices });
    else setPhase({ name: "evaluationFailed", message: result.message });
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
    else void evaluate();
  }

  const questions = prepared ? practiceQuestions(prepared.review) : [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>발표 코치</h1>
        <p>대본을 넣으면 심사위원처럼 질문 {QUESTION_COUNT}개를 물어봐요. 다 답하면 대본과 답변 평가를 보여 줘요.</p>
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

      {phase.name === "evaluating" && (
        <div className={styles.status} role="status" aria-live="polite">
          <p>{phase.retrying ? "한 번 더 받아 오는 중이에요" : "답변 평가 중이에요"}</p>
          <p>잠시만 기다려 주세요.</p>
        </div>
      )}

      {phase.name === "evaluationFailed" && (
        <div className={styles.form}>
          <p className={styles.alert} role="alert">
            {phase.message}
          </p>
          <div className={styles.actions}>
            <button className={styles.primary} type="button" onClick={() => void evaluate()}>
              다시 시도
            </button>
            <button className={styles.secondary} type="button" onClick={backToInput}>
              처음으로
            </button>
          </div>
        </div>
      )}

      {phase.name === "result" && prepared && (
        <FinalReport
          review={prepared.review}
          reviewNotices={prepared.notices}
          answers={answers}
          evaluations={phase.evaluations}
          answerNotices={phase.notices}
          onRestart={backToInput}
        />
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
  const [dictationReady] = useState(canDictate);
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

  const isLast = index + 1 === total;

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
        {dictationReady &&
          (listening ? (
            <button className={styles.primary} type="button" onClick={stopAnswering}>
              그만 말하기
            </button>
          ) : (
            <button className={styles.primary} type="button" onClick={startAnswering}>
              말로 답하기
            </button>
          ))}
        <button className={styles.secondary} type="button" onClick={answerAgain} disabled={!answer && !listening}>
          다시 답하기
        </button>
      </div>
      <p className={styles.muted}>{dictationReady ? DICTATION_NOTICE : NO_DICTATION_MESSAGE}</p>
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

function Quote({ text, found }: { text: string; found: boolean }) {
  return (
    <blockquote className={found ? styles.quote : `${styles.quote} ${styles.quoteMissing}`}>
      {text}
      {!found && <span className={styles.quoteNote}>대본에서 찾지 못한 문장이에요. 대본과 비교해 확인해 주세요.</span>}
    </blockquote>
  );
}

function Detail({ label, muted = false, children }: { label: string; muted?: boolean; children: ReactNode }) {
  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd className={muted ? styles.muted : undefined}>{children}</dd>
    </div>
  );
}

function FinalReport({
  review,
  reviewNotices,
  answers,
  evaluations,
  answerNotices,
  onRestart,
}: {
  review: CheckedReview;
  reviewNotices: string[];
  answers: string[];
  evaluations: AnswerEvaluation[];
  answerNotices: string[];
  onRestart: () => void;
}) {
  return (
    <div className={styles.report}>
      <section className={styles.card}>
        <h2>대본 평가</h2>
        {reviewNotices.map((notice) => (
          <p key={notice} className={styles.muted}>
            {notice}
          </p>
        ))}
        <p>{review.summary}</p>

        <h3>잘한 점</h3>
        <ol className={styles.itemList}>
          {review.strengths.map((item) => (
            <li key={item.quote}>
              <p className={styles.tag}>{item.criterion}</p>
              <Quote text={item.quote} found={item.quoteFound} />
              <p>{item.why}</p>
            </li>
          ))}
        </ol>

        <h3>고칠 점</h3>
        <ol className={styles.itemList}>
          {review.improvements.map((item) => (
            <li key={item.quote}>
              <p className={styles.tag}>{item.criterion}</p>
              <Quote text={item.quote} found={item.quoteFound} />
              <p>{item.problem}</p>
              <p className={styles.tryThis}>
                <strong>이렇게 말해 보기</strong> {item.tryThis}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.card}>
        <h2>답변 평가</h2>
        {answerNotices.map((notice) => (
          <p key={notice} className={styles.muted}>
            {notice}
          </p>
        ))}
        <ol className={styles.itemList}>
          {review.questions.map((q, i) => {
            const evaluation = evaluations[i] ?? { status: "missing" };
            return (
              <li key={q.type}>
                <p className={styles.tag}>
                  질문 {i + 1} · {q.type}
                </p>
                <p className={styles.answerQuestion}>{q.question}</p>
                <dl className={styles.details}>
                  <Detail label="내 답" muted={!isAnswered(answers[i])}>
                    {answerLabel(answers[i])}
                  </Detail>
                  <Detail label="판정">
                    <span className={styles.verdict}>{evaluationLabel(evaluation)}</span>
                  </Detail>
                  {evaluation.status === "evaluated" &&
                    feedbackLines(evaluation.feedback).map((line) => (
                      <Detail key={line.label} label={line.label}>
                        {line.text}
                      </Detail>
                    ))}
                  <Detail label="좋은 답의 방향">{q.goodAnswer}</Detail>
                  <Detail label="피할 답">{q.avoidAnswer}</Detail>
                </dl>
              </li>
            );
          })}
        </ol>
      </section>

      <p className={styles.muted}>이 평가는 연습을 돕는 참고 의견이에요. 맞는지는 직접 판단해 주세요.</p>
      <div className={styles.actions}>
        <button className={styles.secondary} type="button" onClick={onRestart}>
          처음으로
        </button>
      </div>
    </div>
  );
}
