import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR, Noto_Serif_KR } from "next/font/google";
import { QUESTION_COUNT } from "@/lib/coachConfig";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import DevTools from "./DevTools";
import DraftProvider from "./DraftProvider";
import "./globals.css";
import PracticeProvider from "./PracticeProvider";
import RehearsalProvider from "./RehearsalProvider";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

// next/font downloads these once at dev/build time and serves them from the app, so no font
// server is asked while the app runs. All three are under the SIL Open Font License 1.1.
// Korean fonts come in many small pieces, so nothing is preloaded; the browser fetches the pieces it needs.
const serif = Noto_Serif_KR({ weight: ["600", "800"], variable: "--font-serif-kr", display: "swap", preload: false });
const sans = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans-kr",
  display: "swap",
  preload: false,
});
const mono = IBM_Plex_Mono({ weight: "500", subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "발표 코치",
  description: `대본을 넣으면 예상 질문 ${QUESTION_COUNT}개를 소리로 물어보고, 다 답하면 대본과 답변 평가를 보여 주는 연습 도구`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <DraftProvider>
          <PracticeProvider>
            <RehearsalProvider>
              <SiteHeader />
              <div id="content" tabIndex={-1}>
                {children}
              </div>
              <SiteFooter />
              {process.env.NODE_ENV === "development" && <DevTools />}
            </RehearsalProvider>
          </PracticeProvider>
        </DraftProvider>
      </body>
    </html>
  );
}
