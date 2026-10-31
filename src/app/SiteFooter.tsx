import Link from "next/link";
import { READY_PAGES } from "./siteNav";
import styles from "./site.module.css";

// Footer shown on every page. Links follow the menu, so a page that is not built yet is not linked.

const GROUPS = [
  { title: "연습", hrefs: ["/practice", "/rehearsal"] },
  { title: "안내", hrefs: ["/", "/faq"] },
];

export default function SiteFooter() {
  const groups = GROUPS.map((group) => ({
    title: group.title,
    pages: READY_PAGES.filter((page) => group.hrefs.includes(page.href)),
  })).filter((group) => group.pages.length > 0);

  return (
    <footer className={styles.footer}>
      <div className={styles.foot}>
        <div>
          <Link className={styles.brand} href="/">
            <i aria-hidden="true" />
            발표 연습실
          </Link>
          <p>연습을 돕는 도구예요. 평가 내용이 맞는지는 직접 판단해 주세요.</p>
        </div>
        {groups.map((group) => (
          <div key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.pages.map((page) => (
                <li key={page.href}>
                  <Link href={page.href}>{page.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className={styles.legal}>기준선은 설계 값이에요. 얼굴 행동 점수는 연습용 참고 점수예요.</p>
    </footer>
  );
}
