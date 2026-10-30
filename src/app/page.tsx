"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { QUESTION_COUNT } from "@/lib/coachConfig";
import { MIN_SPOKEN_SECONDS, SILENCE_SECONDS } from "@/lib/deliveryConfig";
import { BASELINE_SECONDS } from "@/lib/faceConfig";
import {
  FACE_DESIGN_NOTICE,
  FACE_PRACTICE_NOTICE,
  NO_CAMERA_NOTE,
  faceItems,
  faceSummary,
  lowGazeLabel,
  measureBaseline,
  notEnoughFaceDetail,
  scoreFace,
  undetectedLabel,
  type FaceBaseline,
  type FaceResult,
} from "@/lib/faceScore";
import { BASELINE_PROMPT, CAMERA_NOTICE, startFaceTracker, type FaceTracker } from "@/lib/faceTracker";
import {
  DESIGN_VALUE_NOTICE,
  SPEED_LIMIT_NOTICE,
  deliveryItems,
  deliverySummary,
  formatTime,
  scoreDelivery,
  silenceLabel,
  type DeliveryResult,
  type VoiceRecord,
} from "@/lib/deliveryScore";
import {
  appendTranscript,
  canDictate,
  DICTATION_NOTICE,
  NO_DICTATION_MESSAGE,
  speak,
  startListening,
} from "@/lib/speech";
import type {
  AnswerEvaluation,
  AnswerResult,
  CheckedReview,
  DeliveryFeedback,
  DeliveryFeedbackResult,
  DeliverySummary,
  Question,
  ReviewResult,
} from "@/lib/types";
import {
  answerLabel,
  countSyllables,
  evaluationLabel,
  feedbackLines,
  inputError,
  isAnswered,
  practiceQuestions,
  shouldAutoRetry,
  UNVERIFIED_NUMBER_NOTE,
} from "@/lib/validate";
import { startVoiceTracker, type VoiceTracker } from "@/lib/voiceTracker";
import styles from "./page.module.css";
import FaceDebug from "./FaceDebug";
import VoiceDebug from "./VoiceDebug";

type Phase =
  | { name: "input"; error: string | null }
  | { name: "rehearsal" }
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

  function startRehearsal() {
    const error = inputError(script, limitSeconds);
    setPhase(error !== null ? { name: "input", error } : { name: "rehearsal" });
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
            <button className={styles.secondary} type="button" onClick={startRehearsal}>
              리허설 하기
            </button>
          </div>
        </form>
      )}

      {phase.name === "rehearsal" && (
        <Rehearsal script={script} limitSeconds={limitSeconds} onRestart={backToInput} />
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

      {process.env.NODE_ENV === "development" && (
        <>
          <VoiceDebug />
          <FaceDebug />
        </>
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

const REHEARSAL_NOTICE = "리허설 소리는 받아쓰지 않고, 저장하지도 브라우저 밖으로 보내지도 않아요.";

type RehearsalStep =
  | { name: "ready"; error: string | null }
  | { name: "starting" }
  | { name: "running"; startedAt: number }
  | { name: "stopping" }
  | { name: "askReadToEnd"; record: VoiceRecord; face: FaceResult | null }
  | { name: "result"; result: DeliveryResult; face: FaceResult | null };

// The camera is optional. When it is on, the reference pose is measured before the rehearsal starts.
type CameraState =
  | { name: "off" }
  | { name: "starting" }
  | { name: "measuring" }
  | { name: "ready"; baseline: FaceBaseline }
  | { name: "baselineFailed"; message: string }
  | { name: "failed"; message: string };

type CoachState =
  | { name: "none" }
  | { name: "loading"; retrying: boolean }
  | { name: "failed"; message: string }
  | { name: "done"; feedback: DeliveryFeedback; notices: string[] };

async function requestDeliveryFeedback(summary: DeliverySummary): Promise<DeliveryFeedbackResult> {
  try {
    const response = await fetch("/api/delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summary),
    });
    return (await response.json()) as DeliveryFeedbackResult;
  } catch {
    return { ok: false, kind: "unknown", message: SERVER_UNREACHABLE };
  }
}

function Rehearsal({ script, limitSeconds, onRestart }: { script: string; limitSeconds: number; onRestart: () => void }) {
  const [step, setStep] = useState<RehearsalStep>({ name: "ready", error: null });
  const [speaking, setSpeaking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [coach, setCoach] = useState<CoachState>({ name: "none" });
  const [camera, setCamera] = useState<CameraState>({ name: "off" });
  const [faceSeen, setFaceSeen] = useState(true);
  const tracker = useRef<VoiceTracker | null>(null);
  const faceTracker = useRef<FaceTracker | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  // A reply for an earlier rehearsal is ignored once a new one has started.
  const coachRequest = useRef(0);

  // Turn the microphone and camera off if the speaker leaves in the middle of a rehearsal.
  useEffect(
    () => () => {
      void tracker.current?.stop();
      faceTracker.current?.stop();
    },
    [],
  );

  async function startCamera() {
    if (!video.current) return;
    setCamera({ name: "starting" });
    const result = await startFaceTracker(video.current, (frame) => setFaceSeen(frame.detected));
    if (!result.ok) {
      setCamera({ name: "failed", message: result.message });
      return;
    }
    faceTracker.current = result.tracker;
    measurePose();
  }

  function measurePose() {
    const current = faceTracker.current;
    if (!current) return;
    current.takeFrames();
    setCamera({ name: "measuring" });
    setTimeout(() => {
      // The camera may have been turned off while measuring.
      if (faceTracker.current !== current) return;
      const result = measureBaseline(current.takeFrames());
      setCamera(result.ok ? { name: "ready", baseline: result.baseline } : { name: "baselineFailed", message: result.message });
    }, BASELINE_SECONDS * 1000);
  }

  function stopCamera() {
    faceTracker.current?.stop();
    faceTracker.current = null;
    setCamera({ name: "off" });
  }

  useEffect(() => {
    if (step.name !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [step.name]);

  async function start() {
    setStep({ name: "starting" });
    setSpeaking(false);
    const result = await startVoiceTracker("rehearsal", (live) => setSpeaking(live.speaking));
    if (!result.ok) {
      setStep({ name: "ready", error: result.message });
      return;
    }
    tracker.current = result.tracker;
    // Face frames from now on belong to the rehearsal; the reference pose seconds are left out.
    faceTracker.current?.takeFrames();
    setFaceSeen(true);
    setNow(Date.now());
    setStep({ name: "running", startedAt: Date.now() });
  }

  async function stop() {
    setStep({ name: "stopping" });
    const record = await tracker.current?.stop();
    tracker.current = null;
    const face =
      camera.name === "ready" && faceTracker.current ? scoreFace(faceTracker.current.takeFrames(), camera.baseline) : null;
    stopCamera();
    if (record) setStep({ name: "askReadToEnd", record, face });
    else setStep({ name: "ready", error: null });
  }

  function answerReadToEnd(record: VoiceRecord, face: FaceResult | null, readToEnd: boolean) {
    const result = scoreDelivery({ record, scriptSyllables: countSyllables(script), limitSeconds, readToEnd });
    setStep({ name: "result", result, face });
    if (result.measured) void askCoach({ ...deliverySummary(result), face: faceSummary(face) });
    else setCoach({ name: "none" });
  }

  async function askCoach(summary: DeliverySummary) {
    const id = ++coachRequest.current;
    setCoach({ name: "loading", retrying: false });
    let result = await requestDeliveryFeedback(summary);
    if (!result.ok && shouldAutoRetry(result.kind, 0) && id === coachRequest.current) {
      setCoach({ name: "loading", retrying: true });
      result = await requestDeliveryFeedback(summary);
    }
    if (id !== coachRequest.current) return;
    setCoach(
      result.ok
        ? { name: "done", feedback: result.feedback, notices: result.notices }
        : { name: "failed", message: result.message },
    );
  }

  function rehearseAgain() {
    coachRequest.current += 1;
    setCoach({ name: "none" });
    setStep({ name: "ready", error: null });
  }

  if (step.name === "result") {
    return (
      <DeliveryReport
        result={step.result}
        face={step.face}
        coach={coach}
        onRetryCoach={() => {
          if (step.result.measured) void askCoach({ ...deliverySummary(step.result), face: faceSummary(step.face) });
        }}
        onAgain={rehearseAgain}
        onRestart={onRestart}
      />
    );
  }

  if (step.name === "askReadToEnd") {
    return (
      <section className={styles.card}>
        <p className={styles.question}>대본을 끝까지 읽었나요?</p>
        <p className={styles.muted}>말 속도는 대본 전체를 읽었을 때만 잴 수 있어요.</p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={() => answerReadToEnd(step.record, step.face, true)}>
            예
          </button>
          <button className={styles.secondary} type="button" onClick={() => answerReadToEnd(step.record, step.face, false)}>
            아니요
          </button>
        </div>
      </section>
    );
  }

  const running = step.name === "running";
  const elapsed = running ? Math.max(0, (now - step.startedAt) / 1000) : 0;
  const cameraOn = camera.name !== "off" && camera.name !== "failed";
  // With the camera on, the rehearsal waits for a usable reference pose (or for the camera to be turned off).
  const cameraBlocksStart = camera.name === "starting" || camera.name === "measuring" || camera.name === "baselineFailed";

  return (
    <section className={styles.card}>
      <h2>리허설</h2>
      {running || step.name === "stopping" ? (
        <p className={styles.rehearsalStatus} aria-live="polite">
          <span>
            {formatTime(elapsed)} / 제한 {formatTime(limitSeconds)}
          </span>
          <span className={speaking ? styles.speaking : styles.muted}>{speaking ? "말하는 중" : "조용함"}</span>
        </p>
      ) : (
        <p className={styles.muted}>
          &quot;리허설 시작&quot;을 누르고 대본을 보며 소리 내어 발표해 주세요. 다 끝나면 &quot;끝&quot;을 눌러 주세요.
        </p>
      )}
      {step.name === "ready" && step.error && (
        <p className={styles.alert} role="alert">
          {step.error}
        </p>
      )}

      <div className={styles.cameraBox}>
        <video
          ref={video}
          className={running ? `${styles.cameraPreview} ${styles.cameraSmall}` : styles.cameraPreview}
          muted
          playsInline
          hidden={!cameraOn}
        />
        {running ? (
          camera.name === "ready" && !faceSeen && <p className={styles.warningText}>얼굴이 안 보여요</p>
        ) : (
          <div className={styles.cameraControls}>
            <p className={styles.muted}>카메라 (선택): {CAMERA_NOTICE}</p>
            {camera.name === "measuring" && <p className={styles.speaking}>{BASELINE_PROMPT}</p>}
            {camera.name === "ready" && <p className={styles.muted}>기준 자세를 쟀어요. 이제 리허설을 시작해 주세요.</p>}
            {(camera.name === "failed" || camera.name === "baselineFailed") && (
              <p className={styles.alert} role="alert">
                {camera.message}
              </p>
            )}
            <div className={styles.actions}>
              {cameraOn ? (
                <>
                  {(camera.name === "ready" || camera.name === "baselineFailed") && (
                    <button className={styles.secondary} type="button" onClick={measurePose}>
                      기준 자세 다시 재기
                    </button>
                  )}
                  <button className={styles.secondary} type="button" onClick={stopCamera} disabled={step.name === "starting"}>
                    카메라 끄기
                  </button>
                </>
              ) : (
                <button className={styles.secondary} type="button" onClick={() => void startCamera()}>
                  카메라 켜기
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={styles.scriptView}>{script}</div>

      <div className={styles.actions}>
        {running || step.name === "stopping" ? (
          <button className={styles.primary} type="button" onClick={() => void stop()} disabled={!running}>
            {running ? "끝" : "정리하는 중…"}
          </button>
        ) : (
          <button
            className={styles.primary}
            type="button"
            onClick={() => void start()}
            disabled={step.name === "starting" || cameraBlocksStart}
          >
            {step.name === "starting" ? "마이크 켜는 중…" : "리허설 시작"}
          </button>
        )}
        <button className={styles.secondary} type="button" onClick={onRestart} disabled={running}>
          처음으로
        </button>
      </div>
      <p className={styles.muted}>{REHEARSAL_NOTICE}</p>
    </section>
  );
}

function DeliveryReport({
  result,
  face,
  coach,
  onRetryCoach,
  onAgain,
  onRestart,
}: {
  result: DeliveryResult;
  face: FaceResult | null;
  coach: CoachState;
  onRetryCoach: () => void;
  onAgain: () => void;
  onRestart: () => void;
}) {
  return (
    <div className={styles.report}>
      <section className={styles.card}>
        <h2>말투 점수</h2>
        {result.measured ? (
          <>
            <p className={styles.total}>
              {result.total}점 <span className={styles.muted}>/ 100</span>
              {result.totalNote && <span className={styles.tag}> {result.totalNote}</span>}
            </p>
            <dl className={styles.details}>
              {deliveryItems(result).map((item) => (
                <Detail key={item.label} label={item.label}>
                  <strong>{item.score}</strong> · {item.reason}
                </Detail>
              ))}
            </dl>
            <h3>{SILENCE_SECONDS}초 넘게 멈춘 곳</h3>
            {result.silences.length === 0 ? (
              <p className={styles.muted}>없어요.</p>
            ) : (
              <ul className={styles.itemList}>
                {result.silences.map((silence) => (
                  <li key={silence.start}>{silenceLabel(silence)}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className={styles.alert}>{result.message}</p>
            <p className={styles.muted}>
              말한 시간이 {Math.round(result.spokenSeconds)}초예요. {MIN_SPOKEN_SECONDS}초 이상 말해야 점수를 낼 수
              있어요.
            </p>
          </>
        )}
      </section>

      {face ? <FaceReport face={face} /> : <p className={styles.muted}>{NO_CAMERA_NOTE}</p>}

      {coach.name !== "none" && <CoachFeedback coach={coach} onRetry={onRetryCoach} />}

      <p className={styles.muted}>{DESIGN_VALUE_NOTICE}</p>
      <p className={styles.muted}>{SPEED_LIMIT_NOTICE}</p>
      <div className={styles.actions}>
        <button className={styles.primary} type="button" onClick={onAgain}>
          다시 리허설
        </button>
        <button className={styles.secondary} type="button" onClick={onRestart}>
          처음으로
        </button>
      </div>
    </div>
  );
}

function CoachFeedback({ coach, onRetry }: { coach: Exclude<CoachState, { name: "none" }>; onRetry: () => void }) {
  return (
    <section className={styles.card} aria-live="polite">
      <h2>코치 피드백</h2>
      {coach.name === "loading" && (
        <p className={styles.muted}>{coach.retrying ? "한 번 더 받아 오는 중이에요" : "피드백 준비 중이에요"}</p>
      )}
      {coach.name === "failed" && (
        <>
          <p className={styles.alert} role="alert">
            {coach.message}
          </p>
          <div className={styles.actions}>
            <button className={styles.secondary} type="button" onClick={onRetry}>
              다시 시도
            </button>
          </div>
        </>
      )}
      {coach.name === "done" && (
        <>
          {coach.notices.map((notice) => (
            <p key={notice} className={styles.muted}>
              {notice}
            </p>
          ))}
          {coach.feedback.summary && <p>{coach.feedback.summary}</p>}
          {coach.feedback.summaryUnverified && <p className={styles.warningText}>{UNVERIFIED_NUMBER_NOTE}</p>}
          <ol className={styles.itemList}>
            {coach.feedback.items.map((item) => (
              <li key={item.item}>
                <p className={styles.tag}>{item.item}</p>
                {item.unverified && <p className={styles.warningText}>{UNVERIFIED_NUMBER_NOTE}</p>}
                <p>{item.explain}</p>
                {item.tryThis && (
                  <p className={styles.tryThis}>
                    <strong>다음에 해 볼 것</strong> {item.tryThis}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <p className={styles.muted}>코치는 점수를 바꾸지 않고, 앱이 잰 숫자만 보고 풀어 줘요.</p>
        </>
      )}
    </section>
  );
}

function FaceReport({ face }: { face: FaceResult }) {
  return (
    <section className={styles.card}>
      <h2>얼굴 행동 점수</h2>
      <p className={styles.practiceNotice}>{FACE_PRACTICE_NOTICE}</p>
      {face.measured ? (
        <>
          <p className={styles.total}>
            {face.total}점 <span className={styles.muted}>/ 100</span>
          </p>
          <dl className={styles.details}>
            {faceItems(face).map((item) => (
              <Detail key={item.label} label={item.label}>
                <strong>{item.score}</strong> · {item.reason}
              </Detail>
            ))}
          </dl>
          <h3>시선이 낮았던 구간</h3>
          {face.lowGazeWindows.length === 0 ? (
            <p className={styles.muted}>없어요.</p>
          ) : (
            <ul className={styles.itemList}>
              {face.lowGazeWindows.map((window) => (
                <li key={window.start}>{lowGazeLabel(window)}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className={styles.alert}>{face.message}</p>
          <p className={styles.muted}>{notEnoughFaceDetail(face.measuredRatio)}</p>
        </>
      )}
      <p className={styles.muted}>{undetectedLabel(face.undetectedSeconds)}</p>
      <p className={styles.muted}>{FACE_DESIGN_NOTICE}</p>
    </section>
  );
}
