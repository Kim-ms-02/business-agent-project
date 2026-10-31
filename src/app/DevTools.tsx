"use client";

import { useDraft } from "./DraftProvider";
import DevPanel from "./DevPanel";
import DictationDebug from "./DictationDebug";
import FaceDebug from "./FaceDebug";
import VoiceDebug from "./VoiceDebug";

// Development-only corner box, shown on every page. The dictation tab matches against the shared script.
export default function DevTools() {
  const { script } = useDraft();
  return (
    <DevPanel
      tabs={[
        { id: "mic", label: "마이크", content: <VoiceDebug /> },
        { id: "camera", label: "카메라", content: <FaceDebug /> },
        { id: "dictation", label: "받아쓰기", content: <DictationDebug script={script} /> },
      ]}
    />
  );
}
