"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MIN_SPOKEN_SECONDS, SILENCE_SECONDS } from "@/lib/deliveryConfig";
import {
  DESIGN_VALUE_NOTICE,
  SPEED_LIMIT_NOTICE,
  deliverySummary,
  formatTime,
  silenceLabel,
} from "@/lib/deliveryScore";
import { BASELINE_SECONDS } from "@/lib/faceConfig";
import {
  FACE_DESIGN_NOTICE,
  FACE_PRACTICE_NOTICE,
  faceSummary,
  lowGazeLabel,
  measureBaseline,
  notEnoughFaceDetail,
  undetectedLabel,
  type FaceBaseline,
} from "@/lib/faceScore";
import { BASELINE_PROMPT, CAMERA_NOTICE, startFaceTracker, type FaceTracker } from "@/lib/faceTracker";
import {
  basisLabel,
  DICTATION_FELL_BACK_NOTE,
  DICTATION_ON_NOTICE,
  DICTATION_OPTION_LABEL,
  dictationOptionShown,
  needsReadToEnd,
  type DictationRecord,
  FILLER_ACCURACY_NOTE,
  finishRehearsal,
  NO_DICTATION_PACE_NOTE,
  NO_DICTATION_SENTENCES_NOTE,
  sectionForCoach,
  type RehearsalInput,
  type RehearsalOutcome,
} from "@/lib/rehearsalResult";
import { reportCards, reportTop, summaryTiles, type ReportCard } from "@/lib/rehearsalReport";
import { DICTATION_GAP_SECONDS } from "@/lib/sectionConfig";
import { markLabel } from "@/lib/sentenceMarks";
import { canDictate, startListening } from "@/lib/speech";
import type { DeliveryFeedbackResult, DeliverySummary, SentenceMark } from "@/lib/types";
import { inputError, shouldAutoRetry, UNVERIFIED_NUMBER_NOTE } from "@/lib/validate";
import { startVoiceTracker, type VoiceTracker } from "@/lib/voiceTracker";
import styles from "../practice/page.module.css";
import own from "./page.module.css";
import DraftFields, { limitSecondsOf } from "../DraftFields";
import { useDraft } from "../DraftProvider";
import { useRehearsal, type CoachState } from "../RehearsalProvider";
import { Quote, SERVER_UNREACHABLE } from "../ReportParts";

// The rehearsal page (v1.1, moved here from question practice): the speaker reads the script
// aloud, and the result shows delivery scores, face scores when the camera was on, and sentence marks.

const REHEARSAL_NOTICE = "리허설 소리는 받아쓰지 않고, 저장하지도 브라우저 밖으로 보내지도 않아요.";

type RehearsalStep =
  | { name: "ready"; error: string | null }
  | { name: "starting" }
  | { name: "running"; startedAt: number }
  | { name: "stopping" }
  | { name: "askReadToEnd"; input: RehearsalInput };

// The camera is optional. When it is on, the reference pose is measured before the rehearsal starts.
type CameraState =
  | { name: "off" }
  | { name: "starting" }
  | { name: "measuring" }
  | { name: "ready"; baseline: FaceBaseline }
  | { name: "baselineFailed"; message: string }
  | { name: "failed"; message: string };

// Rehearsal dictation (v0.4, only when the speaker turns it on). The dictated text stays in this
// browser tab: it is used to place sentences and count speed, and is dropped with the result.
interface DictationSession {
  record: DictationRecord;
  /** performance.now() when the rehearsal clock started. */
  startedAt: number;
  lastHeard: number;
  active: boolean;
  stopCurrent: (() => void) | null;
  watchdog: ReturnType<typeof setInterval> | null;
  ended: (() => void) | null;
}

// The browser and its dictation support do not change while the page is open.
const noChanges = () => () => {};

// After "끝", dictation may still send the last piece; wait this long at most.
const DICTATION_FLUSH_MS = 2000;

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

export default function RehearsalPage() {
  const { script } = useDraft();
  // The last result lives in the site layout, so it is still here after visiting another page.
  const { kept, setKept } = useRehearsal();

  /** Scores, reason numbers, and sentence marks for the coach; nothing when speech was too short to score. */
  function coachSummary(outcome: RehearsalOutcome): DeliverySummary | null {
    if (!outcome.delivery.measured) return null;
    return {
      ...deliverySummary(outcome.delivery),
      face: faceSummary(outcome.face),
      section: sectionForCoach(script, outcome.section),
    };
  }

  // A reply for an earlier rehearsal is ignored once a new one has started.
  function setCoachFor(outcome: RehearsalOutcome, coach: CoachState) {
    setKept((current) => (current?.outcome === outcome ? { ...current, coach } : current));
  }

  async function askCoach(outcome: RehearsalOutcome, summary: DeliverySummary) {
    setCoachFor(outcome, { name: "loading", retrying: false });
    let result = await requestDeliveryFeedback(summary);
    if (!result.ok && shouldAutoRetry(result.kind, 0)) {
      setCoachFor(outcome, { name: "loading", retrying: true });
      result = await requestDeliveryFeedback(summary);
    }
    setCoachFor(
      outcome,
      result.ok
        ? { name: "done", feedback: result.feedback, notices: result.notices }
        : { name: "failed", message: result.message },
    );
  }

  function finished(outcome: RehearsalOutcome) {
    setKept({ outcome, coach: { name: "none" } });
    const summary = coachSummary(outcome);
    if (summary) void askCoach(outcome, summary);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>리허설</h1>
          <p>대본을 보며 소리 내어 발표해 보세요. 끝나면 말투 점수와 문장별 표시를 보여 줘요.</p>
        </div>
      </header>
      {kept ? (
        <DeliveryReport
          outcome={kept.outcome}
          coach={kept.coach}
          onRetryCoach={() => {
            const summary = coachSummary(kept.outcome);
            if (summary) void askCoach(kept.outcome, summary);
          }}
          // Both go back to the rehearsal start; question practice is left as it is.
          onAgain={() => setKept(null)}
          onRestart={() => setKept(null)}
        />
      ) : (
        <Rehearsal onFinished={finished} />
      )}
    </main>
  );
}

function Rehearsal({ onFinished }: { onFinished: (outcome: RehearsalOutcome) => void }) {
  const { script, limitMinutes } = useDraft();
  const limitSeconds = limitSecondsOf(limitMinutes);
  const [step, setStep] = useState<RehearsalStep>({ name: "ready", error: null });
  const [speaking, setSpeaking] = useState(false);
  // Set when the rehearsal starts. Reading the clock here would break building the page ahead of time.
  const [now, setNow] = useState(0);
  const [camera, setCamera] = useState<CameraState>({ name: "off" });
  const [faceSeen, setFaceSeen] = useState(true);
  // The option is only offered in Chrome and Edge. The page is built ahead of time without a
  // browser, so the option appears once the page runs in one.
  const dictationAvailable = useSyncExternalStore(
    noChanges,
    () => dictationOptionShown(navigator.userAgent, canDictate()),
    () => false,
  );
  const [dictationOn, setDictationOn] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const dictation = useRef<DictationSession | null>(null);
  const speakingNow = useRef(false);
  const tracker = useRef<VoiceTracker | null>(null);
  const faceTracker = useRef<FaceTracker | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  // Turn the microphone and camera off if the speaker leaves in the middle of a rehearsal. Next keeps
  // a page left behind hidden with its state, so the screen also goes back to the start: coming back
  // must not show a rehearsal still "running" with the microphone off.
  useEffect(
    () => () => {
      void tracker.current?.stop();
      tracker.current = null;
      faceTracker.current?.stop();
      faceTracker.current = null;
      void stopDictation();
      setCamera({ name: "off" });
      setStep((current) => (current.name === "askReadToEnd" ? current : { name: "ready", error: null }));
    },
    [],
  );

  function startDictation(startedAt: number) {
    const session: DictationSession = {
      record: { chunks: [], activity: [] },
      startedAt,
      lastHeard: performance.now(),
      active: true,
      stopCurrent: null,
      watchdog: null,
      ended: null,
    };
    const heard = () => {
      const now = performance.now();
      session.lastHeard = now;
      const at = Math.round((now - session.startedAt) / 100) / 10;
      session.record.activity.push(at);
      return at;
    };
    const listen = () => {
      session.stopCurrent = startListening({
        onInterim: (text) => {
          if (text.trim()) heard();
        },
        onFinal: (text) => {
          const at = heard();
          if (text.trim()) session.record.chunks.push({ text, at });
        },
        // A real error (for example, the microphone is blocked) stops dictation; the rehearsal goes on.
        onError: (message) => {
          session.active = false;
          setDictationError(message);
        },
        // Chrome ends dictation on its own after a while; keep it going during the rehearsal.
        onEnd: () => {
          if (session.active) listen();
          else session.ended?.();
        },
      });
    };
    // Speaking with no dictation for a while means it stalled: restart it.
    session.watchdog = setInterval(() => {
      const now = performance.now();
      if (session.active && speakingNow.current && now - session.lastHeard > DICTATION_GAP_SECONDS * 1000) {
        session.lastHeard = now;
        session.stopCurrent?.();
      }
    }, 1000);
    dictation.current = session;
    listen();
  }

  /** Stops dictation and waits briefly for the last piece. Null when dictation was off. */
  async function stopDictation(): Promise<DictationRecord | null> {
    const session = dictation.current;
    dictation.current = null;
    if (!session) return null;
    if (session.watchdog) clearInterval(session.watchdog);
    const wasActive = session.active;
    session.active = false;
    if (wasActive) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, DICTATION_FLUSH_MS);
        session.ended = () => {
          clearTimeout(timer);
          resolve();
        };
        session.stopCurrent?.();
      });
    }
    return session.record;
  }

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
    const error = inputError(script, limitSeconds);
    if (error !== null) {
      setStep({ name: "ready", error });
      return;
    }
    setStep({ name: "starting" });
    setSpeaking(false);
    setDictationError(null);
    const result = await startVoiceTracker("rehearsal", (live) => {
      setSpeaking(live.speaking);
      speakingNow.current = live.speaking;
    });
    if (!result.ok) {
      setStep({ name: "ready", error: result.message });
      return;
    }
    tracker.current = result.tracker;
    // Face frames and dictation times from now on belong to the rehearsal; the reference pose seconds are left out.
    faceTracker.current?.takeFrames();
    if (dictationOn) startDictation(performance.now());
    setFaceSeen(true);
    setNow(Date.now());
    setStep({ name: "running", startedAt: Date.now() });
  }

  async function stop() {
    setStep({ name: "stopping" });
    const [record, dictated] = await Promise.all([tracker.current?.stop(), stopDictation()]);
    tracker.current = null;
    // The frames are kept only until the result is computed, to find low-gaze sentences.
    const face =
      camera.name === "ready" && faceTracker.current
        ? { frames: faceTracker.current.takeFrames(), baseline: camera.baseline }
        : null;
    stopCamera();
    if (!record) {
      setStep({ name: "ready", error: null });
      return;
    }
    const input: RehearsalInput = { script, limitSeconds, record, face, dictation: dictated };
    // With dictation the reading is known, so "대본을 끝까지 읽었나요?" is not asked.
    if (needsReadToEnd(dictated)) setStep({ name: "askReadToEnd", input });
    else finish(input, null);
  }

  function finish(input: RehearsalInput, readToEnd: boolean | null) {
    onFinished(finishRehearsal(input, readToEnd));
  }

  if (step.name === "askReadToEnd") {
    return (
      <section className={styles.card}>
        <p className={styles.question}>대본을 끝까지 읽었나요?</p>
        <p className={styles.muted}>말 속도는 대본 전체를 읽었을 때만 잴 수 있어요.</p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={() => finish(step.input, true)}>
            예
          </button>
          <button className={styles.secondary} type="button" onClick={() => finish(step.input, false)}>
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

  const editable = step.name === "ready" || step.name === "starting";

  return (
    <>
      {editable && (
        <div className={styles.form}>
          <DraftFields />
        </div>
      )}
      <section className={styles.card}>
        {running || step.name === "stopping" ? (
          <p className={own.rehearsalStatus} aria-live="polite">
            <span>
              {formatTime(elapsed)} / 제한 {formatTime(limitSeconds)}
            </span>
            <span className={speaking ? own.speaking : styles.muted}>{speaking ? "말하는 중" : "조용함"}</span>
            {dictationOn && <span className={styles.muted}>받아쓰기 켜짐</span>}
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
        {dictationError && (
          <p className={own.warningText} role="alert">
            받아쓰기가 멈췄어요: {dictationError}
          </p>
        )}

        <div className={own.cameraBox}>
          <video
            ref={video}
            className={running ? `${own.cameraPreview} ${own.cameraSmall}` : own.cameraPreview}
            muted
            playsInline
            hidden={!cameraOn}
          />
          {running ? (
            camera.name === "ready" && !faceSeen && <p className={own.warningText}>얼굴이 안 보여요</p>
          ) : (
            <div className={own.cameraControls}>
              <p className={styles.muted}>카메라 (선택): {CAMERA_NOTICE}</p>
              {camera.name === "measuring" && <p className={own.speaking}>{BASELINE_PROMPT}</p>}
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

        {dictationAvailable && !running && step.name !== "stopping" && (
          <label className={own.checkRow}>
            <input
              type="checkbox"
              checked={dictationOn}
              onChange={(event) => setDictationOn(event.target.checked)}
              disabled={step.name === "starting"}
            />
            {DICTATION_OPTION_LABEL}
          </label>
        )}

        {/* Before starting, the script is in the input box above; while speaking, it is shown to read from. */}
        {!editable && <div className={own.scriptView}>{script}</div>}

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
        </div>
        <p className={styles.muted}>{dictationOn ? DICTATION_ON_NOTICE : REHEARSAL_NOTICE}</p>
      </section>
    </>
  );
}

function DeliveryReport({
  outcome,
  coach,
  onRetryCoach,
  onAgain,
  onRestart,
}: {
  outcome: RehearsalOutcome;
  coach: CoachState;
  onRetryCoach: () => void;
  onAgain: () => void;
  onRestart: () => void;
}) {
  const feedback = coach.name === "done" ? coach.feedback : null;
  const [speedCard, silenceCard, faceCard] = reportCards(outcome, feedback);
  const { delivery, face } = outcome;
  return (
    <div className={styles.report}>
      {/* What to fix first comes before the scores, so the next step is seen first. */}
      <div className={own.reportTop}>
        <CoachTop coach={coach} onRetry={onRetryCoach} />
        <dl className={own.summary} aria-label="요약">
          {summaryTiles(outcome).map((tile) => (
            <div key={tile.label}>
              <dt>
                {tile.label}
                {tile.note && ` · ${tile.note}`}
              </dt>
              <dd className={/^\d+%?$/.test(tile.value) ? undefined : own.word}>{tile.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={own.cards}>
        <AreaCard card={speedCard}>
          {!delivery.measured && (
            <p className={own.small}>
              말한 시간이 {Math.round(delivery.spokenSeconds)}초예요. {MIN_SPOKEN_SECONDS}초 이상 말해야 점수를 낼 수
              있어요.
            </p>
          )}
        </AreaCard>
        <AreaCard card={silenceCard}>
          {delivery.measured && (
            <>
              <h3 className={own.subhead}>{SILENCE_SECONDS}초 넘게 멈춘 때</h3>
              {delivery.silences.length === 0 ? (
                <p className={own.small}>없어요.</p>
              ) : (
                <ul className={own.plainList}>
                  {delivery.silences.map((silence) => (
                    <li key={silence.start}>{silenceLabel(silence)}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </AreaCard>
        <AreaCard card={faceCard} notice={face ? FACE_PRACTICE_NOTICE : null} quiet={face === null}>
          {face?.measured && (
            <>
              <h3 className={own.subhead}>시선이 낮았던 구간</h3>
              {face.lowGazeWindows.length === 0 ? (
                <p className={own.small}>없어요.</p>
              ) : (
                <ul className={own.plainList}>
                  {face.lowGazeWindows.map((window) => (
                    <li key={window.start}>{lowGazeLabel(window)}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {face && !face.measured && <p className={own.small}>{notEnoughFaceDetail(face.measuredRatio)}</p>}
          {face && <p className={own.small}>{undetectedLabel(face.undetectedSeconds)}</p>}
          {face && <p className={own.small}>{FACE_DESIGN_NOTICE}</p>}
        </AreaCard>
      </div>

      <SentenceReport outcome={outcome} />

      <p className={styles.muted}>{DESIGN_VALUE_NOTICE}</p>
      {/* With dictation the speed comes from what was said, so the read-as-written caveat does not apply. */}
      {!outcome.dictationUsed && <p className={styles.muted}>{SPEED_LIMIT_NOTICE}</p>}
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

/** The top left of the result: the first thing to fix, the coach's overall comment, or the coach's state. */
function CoachTop({ coach, onRetry }: { coach: CoachState; onRetry: () => void }) {
  if (coach.name === "none") return <div />;
  if (coach.name !== "done") {
    return (
      <section className={own.focus} aria-live="polite">
        <h2>코치 피드백</h2>
        {coach.name === "loading" ? (
          <p className={styles.muted}>{coach.retrying ? "한 번 더 받아 오는 중이에요" : "피드백 준비 중이에요"}</p>
        ) : (
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
      </section>
    );
  }

  const { feedback, notices } = coach;
  const top = reportTop(feedback);
  return (
    <section className={own.focus} aria-live="polite">
      <h2>{top.kind === "firstFix" ? "가장 먼저 고칠 한 가지" : "코치 총평"}</h2>
      {notices.map((notice) => (
        <p key={notice} className={styles.muted}>
          {notice}
        </p>
      ))}
      {top.kind === "firstFix" && (
        <>
          {top.fix.quote && <Quote text={top.fix.quote} found={top.fix.quoteFound} />}
          {top.fix.unverified && <p className={own.warningText}>{UNVERIFIED_NUMBER_NOTE}</p>}
          <p>{top.fix.explain}</p>
          <p className={own.goal}>
            <strong>다음 리허설 목표</strong> {top.fix.goal}
          </p>
        </>
      )}
      {top.kind !== "none" && top.summary && <p className={top.kind === "firstFix" ? own.small : undefined}>{top.summary}</p>}
      {feedback.summaryUnverified && <p className={own.warningText}>{UNVERIFIED_NUMBER_NOTE}</p>}
      <p className={own.small}>코치는 점수를 바꾸지 않고, 앱이 잰 숫자만 보고 풀어 줘요.</p>
    </section>
  );
}

/** One area of the result: its items with score, reason, and the coach's words, then extra details. */
function AreaCard({
  card,
  notice = null,
  quiet = false,
  children,
}: {
  card: ReportCard;
  notice?: string | null;
  /** The card is empty by choice (camera off), so its message is a plain note, not a warning. */
  quiet?: boolean;
  children?: ReactNode;
}) {
  // The face card's reason line is the practice-only notice; it is shown as a notice, not small print.
  const why = card.why === notice ? null : card.why;
  return (
    <section className={own.area}>
      <h2>{card.title}</h2>
      {why && <p className={own.why}>{why}</p>}
      {notice && <p className={own.practiceNotice}>{notice}</p>}
      {card.message && <p className={quiet ? own.small : styles.alert}>{card.message}</p>}
      {card.items.map((item) => (
        <div key={item.label} className={own.metric}>
          <p className={own.metricHead}>
            <span>{item.label}</span>
            <b>{item.score}</b>
          </p>
          <p className={own.reason}>{item.reason}</p>
          {item.unverified && <p className={own.warningText}>{UNVERIFIED_NUMBER_NOTE}</p>}
          {item.explain && <p>{item.explain}</p>}
          {item.tryThis && (
            <p className={own.tip}>
              <strong>다음에 해 볼 것</strong>
              {item.tryThis}
            </p>
          )}
        </div>
      ))}
      {children}
    </section>
  );
}

// Each mark has its own color, but the words always say what it is.
const MARK_STYLE: Record<SentenceMark["kind"], string> = {
  pause: own.markPause,
  lowGaze: own.markGaze,
  fast: own.markFast,
  skipped: own.markMissing,
  unread: own.markMissing,
};

function SentenceReport({ outcome }: { outcome: RehearsalOutcome }) {
  const { section, sentences } = outcome;
  return (
    <section className={styles.card}>
      <h2>문장별로 보기</h2>
      {outcome.dictationFellBack && <p className={styles.muted}>{DICTATION_FELL_BACK_NOTE}</p>}
      {section.marks === null ? (
        <p className={styles.muted}>{NO_DICTATION_SENTENCES_NOTE}</p>
      ) : (
        <>
          <p className={styles.muted}>
            문장 위치 <span className={own.basis}>{basisLabel(section.approximate)}</span>
          </p>
          <ol className={own.sentenceList}>
            {sentences.map((sentence, i) => {
              const marks = section.marks?.[i] ?? [];
              return (
                <li key={i} className={marks.length > 0 ? own.markedSentence : undefined}>
                  {marks.length > 0 && (
                    <span className={own.markRow}>
                      {marks.map((mark) => (
                        <span key={mark.kind} className={`${own.mark} ${MARK_STYLE[mark.kind]}`}>
                          {markLabel(mark)}
                        </span>
                      ))}
                    </span>
                  )}
                  <span>{sentence.text}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {section.quarters ? (
        <>
          <h3>구간별 말 속도</h3>
          <ul className={styles.itemList}>
            {section.quarters.map((quarter, i) => (
              <li key={quarter.first}>
                {i + 1}구간 ({quarter.first + 1}~{quarter.last + 1}번 문장):{" "}
                {quarter.pace === null ? "말하지 않음" : `분당 ${quarter.pace}음절`}
              </li>
            ))}
          </ul>
        </>
      ) : (
        section.marks !== null && <p className={styles.muted}>{NO_DICTATION_PACE_NOTE}</p>
      )}
      {section.fillers && (
        <p>
          군말 {section.fillers.total}번{" "}
          <span className={styles.tag}>{FILLER_ACCURACY_NOTE}</span>
          {section.fillers.total > 0 &&
            `: ${Object.entries(section.fillers.words)
              .filter(([, count]) => count > 0)
              .map(([word, count]) => `${word} ${count}`)
              .join(", ")}`}
        </p>
      )}
    </section>
  );
}
