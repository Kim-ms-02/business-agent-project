import type { SpeechSegment } from "./deliveryScore";
import { findSilences } from "./deliveryScore";
import { LOW_GAZE_RATIO } from "./faceConfig";
import type { FaceBaseline, FaceFrame } from "./faceScore";
import { isLookingAtScreen } from "./faceScore";
import type { ScriptSentence, SentenceReading, TimeWindow, TranscriptChunk } from "./scriptPosition";
import { alignTranscript, dictatedTimeline, estimatedTimeline } from "./scriptPosition";
import {
  FAST_MIN_SPOKEN_SECONDS,
  FAST_PACE_MIN,
  FAST_PACE_RATIO,
  FILLER_WORDS,
  SENTENCE_GAZE_MIN_FRAMES,
} from "./sectionConfig";

// Pure functions only: what happened at each sentence of the script during a rehearsal (v0.4).
// Works from the stretches of time each sentence was read (scriptPosition's timelines), the speech
// segments, and optionally the face frames. Labels for the screen are made elsewhere.

export type SentenceMark =
  | { kind: "pause"; seconds: number }
  | { kind: "lowGaze" }
  | { kind: "fast"; pace: number }
  | { kind: "skipped" }
  | { kind: "unread" };

export interface QuarterPace {
  /** First and last sentence of this quarter of the script. */
  first: number;
  last: number;
  /** Syllables of the sentences read in this quarter (skipped ones are left out). */
  syllables: number;
  spokenSeconds: number;
  /** Syllables per minute, or null when nothing in the quarter was spoken. */
  pace: number | null;
}

export interface FillerCount {
  total: number;
  words: Record<string, number>;
}

export interface MarkInput {
  sentences: ScriptSentence[];
  segments: SpeechSegment[];
  /** For each sentence, the stretches of the rehearsal when it was being read. */
  timeline: TimeWindow[][];
  /** What dictation heard for each sentence; null with dictation off. */
  readings: SentenceReading[] | null;
  /** The whole rehearsal's pace in syllables per minute; null with dictation off. */
  overallPace: number | null;
  face: { frames: FaceFrame[]; baseline: FaceBaseline } | null;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function spokenSeconds(spans: TimeWindow[]): number {
  return round(spans.reduce((sum, s) => sum + (s.end - s.start), 0));
}

const within = (spans: TimeWindow[], t: number) => spans.some((s) => t >= s.start && t < s.end);

/** Index of the sentence being read when speech started again at `t`, or -1 when none was (improvised). */
function sentenceAt(timeline: TimeWindow[][], t: number): number {
  return timeline.findIndex((spans) => within(spans, t));
}

function isLowGaze(spans: TimeWindow[], face: NonNullable<MarkInput["face"]>): boolean {
  const seen = face.frames.filter((f) => f.detected && within(spans, f.t));
  if (seen.length < SENTENCE_GAZE_MIN_FRAMES) return false;
  const looking = seen.filter((f) => isLookingAtScreen(f, face.baseline)).length;
  return looking / seen.length < LOW_GAZE_RATIO;
}

function fastPace(sentence: ScriptSentence, spans: TimeWindow[], overallPace: number): number | null {
  const spoken = spokenSeconds(spans);
  if (spoken < FAST_MIN_SPOKEN_SECONDS) return null;
  const pace = round((sentence.syllables / spoken) * 60);
  return pace >= round(overallPace * FAST_PACE_RATIO) && pace > FAST_PACE_MIN ? Math.round(pace) : null;
}

/**
 * Marks for each sentence: pauses over three seconds before the sentence where speech started again,
 * low gaze (camera on), and with dictation on, fast, skipped (missed between read sentences), and
 * unread (missed after the last read sentence).
 */
export function markSentences(input: MarkInput): SentenceMark[][] {
  const { sentences, timeline, readings, overallPace, face } = input;
  const marks: SentenceMark[][] = sentences.map(() => []);

  const ordered = [...input.segments].sort((a, b) => a.start - b.start);
  for (const silence of findSilences(ordered)) {
    const index = sentenceAt(timeline, silence.end);
    if (index !== -1) marks[index].push({ kind: "pause", seconds: Math.round((silence.end - silence.start) * 10) / 10 });
  }

  const lastRead = readings ? readings.lastIndexOf("read") : -1;
  sentences.forEach((sentence, i) => {
    if (face && isLowGaze(timeline[i], face)) marks[i].push({ kind: "lowGaze" });
    if (!readings || overallPace === null) return;
    if (readings[i] === "read") {
      const pace = fastPace(sentence, timeline[i], overallPace);
      if (pace !== null) marks[i].push({ kind: "fast", pace });
    } else if (readings[i] === "missed") {
      marks[i].push({ kind: i < lastRead ? "skipped" : "unread" });
    }
  });
  return marks;
}

/**
 * The script split into four by syllables, each cut at the sentence edge nearest the quarter point,
 * with the pace of each part. A script of fewer than four sentences gets fewer parts.
 */
export function quarterPaces(
  sentences: ScriptSentence[],
  readings: SentenceReading[],
  timeline: TimeWindow[][],
): QuarterPace[] {
  const total = sentences.at(-1)?.to ?? 0;
  // Cut b means a new quarter starts at sentence b.
  const cuts: number[] = [];
  for (let k = 1; k < 4; k++) {
    const target = (total * k) / 4;
    let best = -1;
    for (let b = (cuts.at(-1) ?? 0) + 1; b < sentences.length; b++) {
      if (best === -1 || Math.abs(sentences[b - 1].to - target) < Math.abs(sentences[best - 1].to - target)) best = b;
    }
    if (best !== -1) cuts.push(best);
  }

  const edges = [0, ...cuts, sentences.length];
  return edges.slice(1).map((end, q) => {
    const first = edges[q];
    let syllables = 0;
    let spoken = 0;
    for (let i = first; i < end; i++) {
      if (readings[i] !== "read") continue;
      syllables += sentences[i].syllables;
      spoken += spokenSeconds(timeline[i]);
    }
    const spokenRounded = round(spoken);
    return {
      first,
      last: end - 1,
      syllables,
      spokenSeconds: spokenRounded,
      pace: spokenRounded > 0 ? Math.round((syllables / spokenRounded) * 60) : null,
    };
  });
}

/** Filler words in the dictated text, counted only when a whole word (punctuation aside) is one of them. */
export function countFillers(texts: string[]): FillerCount {
  const words: Record<string, number> = Object.fromEntries(FILLER_WORDS.map((w) => [w, 0]));
  for (const word of texts.join(" ").split(/\s+/)) {
    const bare = word.replace(/[^\p{L}]/gu, "");
    if (bare in words) words[bare] += 1;
  }
  return { total: Object.values(words).reduce((sum, n) => sum + n, 0), words };
}

export interface SectionInput {
  sentences: ScriptSentence[];
  segments: SpeechSegment[];
  face: MarkInput["face"];
  /** The answer to "대본을 끝까지 읽었나요?"; only asked with dictation off. */
  readToEnd: boolean;
  dictation: { chunks: TranscriptChunk[]; dropouts: TimeWindow[]; overallPace: number } | null;
}

export interface SectionFeedback {
  /** True with dictation off: positions are estimated from time ("대략"). */
  approximate: boolean;
  /** Null with dictation off when the script was not read to the end: the position cannot be estimated. */
  marks: SentenceMark[][] | null;
  /** Dictation on only: with it off every part would have the same estimated pace. */
  quarters: QuarterPace[] | null;
  fillers: FillerCount | null;
}

export function sectionFeedback(input: SectionInput): SectionFeedback {
  const { sentences, segments, face, dictation } = input;
  if (!dictation) {
    const marks = input.readToEnd
      ? markSentences({
          sentences,
          segments,
          timeline: estimatedTimeline(sentences, segments),
          readings: null,
          overallPace: null,
          face,
        })
      : null;
    return { approximate: true, marks, quarters: null, fillers: null };
  }

  const aligned = alignTranscript(sentences, dictation.chunks, dictation.dropouts);
  const timeline = dictatedTimeline(sentences, dictation.chunks, aligned.matches, segments);
  return {
    approximate: false,
    marks: markSentences({
      sentences,
      segments,
      timeline,
      readings: aligned.sentences,
      overallPace: dictation.overallPace,
      face,
    }),
    quarters: quarterPaces(sentences, aligned.sentences, timeline),
    fillers: countFillers(dictation.chunks.map((c) => c.text)),
  };
}
