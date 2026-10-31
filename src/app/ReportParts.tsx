import type { ReactNode } from "react";
import styles from "./practice/page.module.css";

// Small pieces shared by the question practice and rehearsal pages.

export const SERVER_UNREACHABLE = "앱 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인하고 다시 시도해 주세요.";

export function Quote({ text, found }: { text: string; found: boolean }) {
  return (
    <blockquote className={found ? styles.quote : `${styles.quote} ${styles.quoteMissing}`}>
      {text}
      {!found && <span className={styles.quoteNote}>대본에서 찾지 못한 문장이에요. 대본과 비교해 확인해 주세요.</span>}
    </blockquote>
  );
}

export function Detail({ label, muted = false, children }: { label: string; muted?: boolean; children: ReactNode }) {
  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd className={muted ? styles.muted : undefined}>{children}</dd>
    </div>
  );
}
