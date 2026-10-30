import type { Metadata } from "next";
import { QUESTION_COUNT } from "@/lib/coachConfig";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "발표 코치",
  description: `대본을 넣으면 예상 질문 ${QUESTION_COUNT}개를 소리로 물어보고, 다 답하면 대본과 답변 평가를 보여 주는 연습 도구`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
