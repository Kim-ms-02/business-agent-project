import { FACE_PRACTICE_NOTICE } from "@/lib/faceScore";
import { UNVERIFIED_NUMBER_NOTE } from "@/lib/validate";
import styles from "./faq.module.css";

// FAQ page (v1.1 step 6), built after docs/design/site-mockup.html. Answers say what the app does
// and what was checked, and no more (CLAUDE.md "시안 문구 고치기").

const QUESTIONS: { question: string; answer: string }[] = [
  {
    question: "녹음이나 영상이 저장되나요?",
    answer:
      "저장하지 않아요. 리허설 소리와 카메라 영상은 브라우저 안에서만 계산해요. 말로 답할 때와 리허설 받아쓰기를 켰을 때는 받아쓰기를 위해 목소리가 구글 서버로 전송돼요. 평가를 위해 Claude API로 보내는 것은 대본·주제·듣는 사람, 답변 글, 점수 숫자와 문장별 표시예요.",
  },
  {
    question: "카메라 없이도 쓸 수 있나요?",
    answer:
      "네. 카메라는 선택이에요. 끄면 얼굴 행동 점수와 시선이 낮았던 문장 표시만 빠지고, 질문 연습과 말투 점수는 그대로 나와요.",
  },
  {
    question: "점수는 어떻게 매기나요?",
    answer: `정해 둔 기준표로 코드가 계산해요. 코치는 그 숫자를 풀어 설명할 뿐 점수를 바꾸지 않아요. 앱이 보내지 않은 숫자가 코치 글에 남으면 '${UNVERIFIED_NUMBER_NOTE}'로 표시해요. 기준선은 설계 값이라 참고로만 봐 주세요. ${FACE_PRACTICE_NOTICE}`,
  },
  {
    question: "어떤 브라우저에서 되나요?",
    answer: "리허설 받아쓰기는 크롬·엣지에서만 켤 수 있어요. 받아쓰기가 안 되는 브라우저에서는 글로 답할 수 있어요.",
  },
  {
    question: "면접 연습도 되나요?",
    answer: "지금은 발표와 질의응답만 다뤄요.",
  },
];

export default function FaqPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>자주 묻는 질문</h1>
      </header>
      {/* <details> opens with Enter or Space from the keyboard, with no script. */}
      <div className={styles.faq}>
        {QUESTIONS.map(({ question, answer }, i) => (
          <details key={question} open={i === 0}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </main>
  );
}
