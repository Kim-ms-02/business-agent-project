"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { AnswerEvaluation, CheckedReview } from "@/lib/types";

// Where question practice is: the questions received, the answers given, and the final results.
// Like the shared inputs (DraftProvider), it lives in the site layout so leaving the page and coming
// back keeps it. It is kept only in browser memory and a reload clears it.

export type Phase =
  | { name: "input"; error: string | null }
  | { name: "rehearsal" }
  | { name: "preparing"; retrying: boolean }
  | { name: "failed"; message: string }
  | { name: "practice"; index: number }
  | { name: "evaluating"; retrying: boolean }
  | { name: "evaluationFailed"; message: string }
  | { name: "result"; evaluations: AnswerEvaluation[]; notices: string[] };

// Kept hidden until the final evaluation screen.
export interface Prepared {
  review: CheckedReview;
  notices: string[];
  estimatedSeconds: number;
}

export interface PracticeSession {
  phase: Phase;
  prepared: Prepared | null;
  answers: string[];
}

interface PracticeState extends PracticeSession {
  setPhase: Dispatch<SetStateAction<Phase>>;
  setPrepared: Dispatch<SetStateAction<Prepared | null>>;
  setAnswers: Dispatch<SetStateAction<string[]>>;
}

const START: PracticeSession = { phase: { name: "input", error: null }, prepared: null, answers: [] };

const PracticeContext = createContext<PracticeState | null>(null);

export default function PracticeProvider({
  initial = START,
  children,
}: {
  initial?: PracticeSession;
  children?: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>(initial.phase);
  const [prepared, setPrepared] = useState<Prepared | null>(initial.prepared);
  const [answers, setAnswers] = useState<string[]>(initial.answers);

  return (
    <PracticeContext.Provider value={{ phase, setPhase, prepared, setPrepared, answers, setAnswers }}>
      {children}
    </PracticeContext.Provider>
  );
}

export function usePractice(): PracticeState {
  const practice = useContext(PracticeContext);
  if (!practice) throw new Error("usePractice needs PracticeProvider in the layout");
  return practice;
}
