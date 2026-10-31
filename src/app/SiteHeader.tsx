"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { READY_PAGES } from "./siteNav";
import styles from "./site.module.css";

// Top bar shown on every page: brand, menu, and the start button.

export function SiteNavBar({ current }: { current: string }) {
  return (
    <header className={styles.header}>
      <a className={styles.skip} href="#content">
        본문으로 건너뛰기
      </a>
      <div className={styles.bar}>
        <Link className={styles.brand} href="/">
          <i aria-hidden="true" />
          발표 연습실
        </Link>
        <nav className={styles.nav} aria-label="주 메뉴">
          {READY_PAGES.map((page) => (
            <Link key={page.href} href={page.href} aria-current={page.href === current ? "page" : undefined}>
              {page.label}
            </Link>
          ))}
        </nav>
        <Link className={styles.start} href="/practice">
          대본 넣고 시작
        </Link>
      </div>
    </header>
  );
}

export default function SiteHeader() {
  return <SiteNavBar current={usePathname()} />;
}
