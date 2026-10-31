"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { RehearsalOutcome } from "@/lib/rehearsalResult";
import type { DeliveryFeedback } from "@/lib/types";

// The last rehearsal result, kept in the site layout so leaving the rehearsal page and coming back
// shows it again. Only the computed scores and sentence marks and the coach's reply are kept; the
// sound, camera, and dictation stay with the rehearsal and are gone once it ends. Browser memory only.

export type CoachState =
  | { name: "none" }
  | { name: "loading"; retrying: boolean }
  | { name: "failed"; message: string }
  | { name: "done"; feedback: DeliveryFeedback; notices: string[] };

export interface KeptRehearsal {
  outcome: RehearsalOutcome;
  coach: CoachState;
}

interface RehearsalState {
  kept: KeptRehearsal | null;
  setKept: Dispatch<SetStateAction<KeptRehearsal | null>>;
}

const RehearsalContext = createContext<RehearsalState | null>(null);

export default function RehearsalProvider({
  initial = null,
  children,
}: {
  initial?: KeptRehearsal | null;
  children?: ReactNode;
}) {
  const [kept, setKept] = useState<KeptRehearsal | null>(initial);
  return <RehearsalContext.Provider value={{ kept, setKept }}>{children}</RehearsalContext.Provider>;
}

export function useRehearsal(): RehearsalState {
  const rehearsal = useContext(RehearsalContext);
  if (!rehearsal) throw new Error("useRehearsal needs RehearsalProvider in the layout");
  return rehearsal;
}
