import { scoreDelivery, type DeliveryResult, type VoiceRecord } from "./deliveryScore";
import { scoreFace, type FaceBaseline, type FaceFrame, type FaceResult } from "./faceScore";
import { findDropouts, scriptSentences, toSpokenKorean, type ScriptSentence, type TranscriptChunk } from "./scriptPosition";
import { sectionFeedback, type SectionFeedback } from "./sentenceMarks";
import type { SectionSummary } from "./types";
import { countSyllables } from "./validate";

// Pure functions only: everything the rehearsal result screen computes once "끝" is pressed (v0.4).
// The dictated text is used here to place sentences and count speed, and goes no further.

export const DICTATION_OPTION_LABEL = "받아쓰기 켜기 (더 정확해요, 목소리가 구글 서버로 전송돼요)";
export const DICTATION_ON_NOTICE = "받아쓰기를 켰어요. 목소리가 구글 서버로 전송되고, 받아쓴 글은 저장하지 않으며 코치에게 보내지 않아요.";
export const NO_DICTATION_PACE_NOTE = "받아쓰기를 켜면 구간별 말 속도와 빠른 문장을 볼 수 있어요";
export const NO_DICTATION_SENTENCES_NOTE = "받아쓰기를 켜면 끝까지 읽지 않아도 문장별로 볼 수 있어요";
export const DICTATION_FELL_BACK_NOTE = "받아쓰기 결과가 오지 않아 말한 시간으로 문장 위치를 추정했어요.";
export const FILLER_ACCURACY_NOTE = "정확도 낮음";

/** How the sentence places were found, shown next to the sentence marks. */
export function basisLabel(approximate: boolean): string {
  return approximate ? "대략" : "받아쓰기 기준";
}

// Other browsers built on Chrome (Whale, Opera, …) may not send dictation the same way, so only
// Chrome and Edge get the option, as the plan says.
const OTHER_CHROMIUM = /OPR\/|Whale\/|SamsungBrowser\/|YaBrowser\/|Vivaldi\//;

/** The dictation option is shown only in Chrome and Edge, and only when dictation is available there. */
export function dictationOptionShown(userAgent: string, supported: boolean): boolean {
  if (!supported) return false;
  if (userAgent.includes("Edg/")) return true;
  return userAgent.includes("Chrome/") && !OTHER_CHROMIUM.test(userAgent);
}

/** What dictation produced during the rehearsal: finished pieces, and when anything at all arrived. */
export interface DictationRecord {
  chunks: TranscriptChunk[];
  /** Seconds from the start of the rehearsal when dictation sent anything, finished or not. */
  activity: number[];
}

/** Syllables actually said, with numbers and abbreviations read out the way they were spoken. */
export function dictatedSyllables(chunks: TranscriptChunk[]): number {
  return chunks.reduce((sum, chunk) => sum + countSyllables(toSpokenKorean(chunk.text)), 0);
}

const usable = (dictation: DictationRecord | null): dictation is DictationRecord =>
  dictation !== null && dictation.chunks.length > 0;

/** "대본을 끝까지 읽었나요?" is asked only when there is no usable dictation. */
export function needsReadToEnd(dictation: DictationRecord | null): boolean {
  return !usable(dictation);
}

export interface RehearsalInput {
  script: string;
  limitSeconds: number;
  record: VoiceRecord;
  /** Face frames of the rehearsal itself and the reference pose; null with the camera off. */
  face: { frames: FaceFrame[]; baseline: FaceBaseline } | null;
  /** Null with dictation off. */
  dictation: DictationRecord | null;
}

export interface RehearsalOutcome {
  delivery: DeliveryResult;
  face: FaceResult | null;
  sentences: ScriptSentence[];
  section: SectionFeedback;
  /** False with dictation off, and when dictation was on but sent nothing (the estimate is used then). */
  dictationUsed: boolean;
  /** True when dictation was turned on but sent nothing. */
  dictationFellBack: boolean;
}

/**
 * Scores and sentence marks for a finished rehearsal. `readToEnd` is the answer to "대본을 끝까지
 * 읽었나요?", needed only without usable dictation; with dictation, speed comes from what was heard.
 */
export function finishRehearsal(input: RehearsalInput, readToEnd: boolean | null): RehearsalOutcome {
  const { script, limitSeconds, record } = input;
  const sentences = scriptSentences(script);
  const face = input.face ? scoreFace(input.face.frames, input.face.baseline) : null;
  const dictation = usable(input.dictation) ? input.dictation : null;

  if (!dictation) {
    const whole = readToEnd === true;
    return {
      delivery: scoreDelivery({ record, scriptSyllables: countSyllables(script), limitSeconds, readToEnd: whole }),
      face,
      sentences,
      section: sectionFeedback({ sentences, segments: record.segments, face: input.face, readToEnd: whole, dictation: null }),
      dictationUsed: false,
      dictationFellBack: input.dictation !== null,
    };
  }

  const syllables = dictatedSyllables(dictation.chunks);
  const delivery = scoreDelivery({
    record,
    scriptSyllables: syllables,
    limitSeconds,
    readToEnd: true,
    syllableSource: "dictation",
  });
  const spoken = record.segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const overallPace = spoken > 0 ? (syllables * 60) / spoken : 0;
  const dropouts = findDropouts(dictation.activity, record.segments, record.endedAt);
  return {
    delivery,
    face,
    sentences,
    section: sectionFeedback({
      sentences,
      segments: record.segments,
      face: input.face,
      readToEnd: true,
      dictation: { chunks: dictation.chunks, dropouts, overallPace },
    }),
    dictationUsed: true,
    dictationFellBack: false,
  };
}

/** What the coach gets about the sentences: the script, marked sentences only, and quarter paces. */
export function sectionForCoach(script: string, section: SectionFeedback): SectionSummary | undefined {
  if (!section.marks) return undefined;
  return {
    approximate: section.approximate,
    script,
    marks: section.marks.flatMap((marks, sentence) => (marks.length > 0 ? [{ sentence, marks }] : [])),
    quarters: section.quarters ? section.quarters.map((q) => q.pace) : null,
  };
}
