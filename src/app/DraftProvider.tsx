"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The script, topic, audience, and time limit the visitor typed, shared by every page.
// It lives in the site layout, which stays mounted while pages change. It is kept only in
// browser memory: a reload clears it, and it is never saved or sent anywhere by itself.

export interface Draft {
  script: string;
  topic: string;
  audience: string;
  limitMinutes: string;
}

interface DraftState extends Draft {
  setScript: (value: string) => void;
  setTopic: (value: string) => void;
  setAudience: (value: string) => void;
  setLimitMinutes: (value: string) => void;
}

const EMPTY_DRAFT: Draft = { script: "", topic: "", audience: "", limitMinutes: "3" };

const DraftContext = createContext<DraftState | null>(null);

export default function DraftProvider({ initial = EMPTY_DRAFT, children }: { initial?: Draft; children?: ReactNode }) {
  const [script, setScript] = useState(initial.script);
  const [topic, setTopic] = useState(initial.topic);
  const [audience, setAudience] = useState(initial.audience);
  const [limitMinutes, setLimitMinutes] = useState(initial.limitMinutes);

  return (
    <DraftContext.Provider
      value={{ script, setScript, topic, setTopic, audience, setAudience, limitMinutes, setLimitMinutes }}
    >
      {children}
    </DraftContext.Provider>
  );
}

export function useDraft(): DraftState {
  const draft = useContext(DraftContext);
  if (!draft) throw new Error("useDraft needs DraftProvider in the layout");
  return draft;
}
