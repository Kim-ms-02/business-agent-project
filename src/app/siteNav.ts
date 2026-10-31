// The site's menu pages (v1.1). A page is linked from the header and footer only once it is
// built (`ready`), so the menu never leads to a missing page while the site is being made.

export interface SitePage {
  href: string;
  label: string;
  ready: boolean;
}

export const SITE_PAGES: SitePage[] = [
  { href: "/", label: "소개", ready: true },
  { href: "/practice", label: "질문 연습", ready: true },
  { href: "/rehearsal", label: "리허설", ready: true },
  { href: "/faq", label: "자주 묻는 질문", ready: true },
];

export const READY_PAGES = SITE_PAGES.filter((page) => page.ready);
