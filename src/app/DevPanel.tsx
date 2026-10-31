"use client";

import { useState, type ReactNode } from "react";
import styles from "./VoiceDebug.module.css";

// Development-only corner box that holds the microphone, camera, and dictation panels behind tabs.
// Folded by default so it does not cover the page's buttons. Every panel stays mounted while folded
// or while another tab is shown, so a microphone or camera that was turned on keeps running.

type Tab = { id: string; label: string; content: ReactNode };

export default function DevPanel({ tabs, initialOpen = false }: { tabs: Tab[]; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <aside className={styles.panel} aria-label="개발용">
      <div className={styles.box} hidden={!open}>
        {open && (
          <div className={styles.tabs} role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === active}
                aria-controls={`dev-panel-${tab.id}`}
                className={styles.tab}
                onClick={() => setActive(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {tabs.map((tab) => (
          <div key={tab.id} id={`dev-panel-${tab.id}`} role="tabpanel" hidden={!open || tab.id !== active}>
            {tab.content}
          </div>
        ))}
      </div>
      <button type="button" aria-expanded={open} className={styles.button} onClick={() => setOpen(!open)}>
        개발용
      </button>
    </aside>
  );
}
