"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { alignTranscript, scriptSentences, type TranscriptChunk } from "@/lib/scriptPosition";
import { startListening } from "@/lib/speech";
import styles from "./VoiceDebug.module.css";

// Development-only panel for checking how dictated text is matched to the script (v0.4 step 2)
// before the rehearsal screen uses it. Nothing is kept after the panel is turned off.

// Only the latest pieces are listed so the panel stays small.
const SHOWN_PIECES = 6;

function sentenceLabel(first: number, last: number): string {
  return first === last ? `${first + 1}번 문장` : `${first + 1}~${last + 1}번 문장`;
}

export default function DictationDebug({ script }: { script: string }) {
  const [on, setOn] = useState(false);
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopListening = useRef<(() => void) | null>(null);
  const listening = useRef(false);
  const startedAt = useRef(0);

  const sentences = useMemo(() => scriptSentences(script), [script]);
  const result = useMemo(() => alignTranscript(sentences, chunks, []), [sentences, chunks]);

  useEffect(
    () => () => {
      listening.current = false;
      stopListening.current?.();
    },
    [],
  );

  function listen() {
    stopListening.current = startListening({
      onInterim: () => {},
      onFinal: (text) => {
        const at = Math.round((performance.now() - startedAt.current) / 100) / 10;
        setChunks((previous) => [...previous, { text, at }]);
      },
      // A real error (for example, the microphone is blocked) stops the panel instead of restarting forever.
      onError: (message) => {
        setError(message);
        listening.current = false;
        setOn(false);
      },
      // Chrome ends dictation on its own after a while; keep it going while the panel is on.
      onEnd: () => {
        if (listening.current) listen();
      },
    });
  }

  function start() {
    setChunks([]);
    setError(null);
    startedAt.current = performance.now();
    listening.current = true;
    setOn(true);
    listen();
  }

  function stop() {
    listening.current = false;
    stopListening.current?.();
    stopListening.current = null;
    setOn(false);
  }

  const read = result.sentences.filter((s) => s === "read").length;
  const speakable = result.sentences.filter((s) => s !== "blank").length;
  const shown = chunks.slice(-SHOWN_PIECES).map((chunk, i) => {
    const index = chunks.length - Math.min(chunks.length, SHOWN_PIECES) + i;
    const match = result.matches.find((m) => m.chunk === index);
    return { chunk, label: match ? sentenceLabel(match.first, match.last) : "맞춘 문장 없음" };
  });

  return (
    <aside className={`${styles.panel} ${styles.top}`} aria-label="받아쓰기 맞추기 확인 (개발용)">
      <p className={styles.title}>받아쓰기 맞추기 확인 (개발용)</p>
      {speakable === 0 ? (
        <p className={styles.note}>입력 화면에 대본을 넣으면 확인할 수 있어요.</p>
      ) : (
        <>
          <p className={styles.note}>
            대본 {speakable}문장 · 읽은 문장 {read}개
          </p>
          <ol className={styles.pieces}>
            {shown.map(({ chunk, label }) => (
              <li key={`${chunk.at}-${chunk.text}`}>
                {chunk.text} → <strong>{label}</strong>
              </li>
            ))}
          </ol>
          {error && <p className={styles.error}>{error}</p>}
          <p className={styles.note}>받아쓰기를 켜면 목소리가 구글 서버로 전송돼요.</p>
          <button type="button" className={styles.button} onClick={on ? stop : start}>
            {on ? "받아쓰기 끄기" : "받아쓰기 켜기"}
          </button>
        </>
      )}
    </aside>
  );
}
