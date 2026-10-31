import Link from "next/link";
import { QUESTION_COUNT } from "@/lib/coachConfig";
import { SPEED_BANDS } from "@/lib/deliveryConfig";
import { QUESTION_TYPES, VERDICTS } from "@/lib/types";
import styles from "./intro.module.css";
import { READY_PAGES } from "./siteNav";

// Intro page (v1.1 step 3), built after docs/design/site-mockup.html. Words that did not match
// the app were fixed (CLAUDE.md "시안 문구 고치기"); numbers and names come from the app's own settings.

const [SPEED_LOW, SPEED_HIGH] = SPEED_BANDS[0].ranges[0];
const rehearsalReady = READY_PAGES.some((page) => page.href === "/rehearsal");

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="intro-title">
        <div>
          <p className={styles.eyebrow}>AI 발표 연습 코치</p>
          <h1 id="intro-title">
            교수님이 묻기 전에
            <br />
            <em>먼저 질문받아</em> 보세요
          </h1>
          <p className={styles.lede}>
            대본을 넣으면 심사위원처럼 질문 {QUESTION_COUNT}개를 소리로 물어봐요. 다 답하면 대본과 답변을 평가하고,
            리허설에서는 어느 문장에서 멈췄는지, 카메라를 켜면 시선이 낮았던 문장도 짚어 줘요.
          </p>
          <div className={styles.ctas}>
            <Link className={styles.primary} href="/practice">
              질문 연습 시작
            </Link>
            {rehearsalReady && (
              <Link className={styles.secondary} href="/rehearsal">
                리허설 하기
              </Link>
            )}
          </div>
          <ul className={styles.trust}>
            <li>가입 없이 바로</li>
            <li>리허설 소리는 저장하지 않음</li>
            <li>카메라는 선택</li>
          </ul>
        </div>

        <figure className={styles.script} aria-label="리허설 표시가 달린 대본 예시">
          <figcaption className={styles.scriptHead}>
            <span>예시 · 대본 일부</span>
            <span>0:58 / 1:00</span>
          </figcaption>
          <p className={styles.line}>
            <span className={styles.n}>1</span>안녕하세요. 오늘은 아침 식사가 수업 집중에 주는 영향을 말씀드리겠습니다.
          </p>
          <p className={styles.line}>
            <span className={styles.n}>2</span>저는 지난 2주 동안 아침을 먹은 날과 먹지 않은 날의{" "}
            <span className={styles.under}>집중 시간을 직접 기록했습니다.</span>
            <span className={styles.mark}>시선 낮음</span>
          </p>
          <p className={styles.line}>
            <span className={styles.n}>3</span>아침을 먹은 날은 평균 40분, 먹지 않은 날은 25분에 그쳤습니다.
            <span className={styles.mark}>빠름 · 분당 372음절</span>
          </p>
          <p className={styles.line}>
            <span className={styles.n}>4</span>
            <span className={styles.pause}>멈춤 5초</span>물론 한 사람의 기록이라 모두에게 같다고 말할 수는 없습니다.
          </p>
          <div className={styles.bubble}>
            <p className={styles.bubbleLabel}>
              질문 1 / {QUESTION_COUNT} · {QUESTION_TYPES[0]}
            </p>
            <p className={styles.bubbleQuestion}>
              먹은 날 40분, 먹지 않은 날 25분이라고 하셨는데, 집중한 시간은 무엇을 기준으로 재셨나요?
            </p>
          </div>
        </figure>
      </section>

      <section className={styles.block} aria-labelledby="intro-scenes">
        <p className={styles.eyebrow}>이런 순간을 연습해요</p>
        <h2 id="intro-scenes">질문이 오는 발표라면 어디든</h2>
        <p className={styles.intro}>발표가 끝난 뒤 받는 질문까지가 발표예요. 미리 받아 보고, 미리 답해 보세요.</p>
        <div className={styles.scenarios}>
          <div className={styles.card}>
            <p className={styles.cardLabel}>수업</p>
            <h3>조별 과제 발표</h3>
            <p>근거 없는 주장, 출처 없는 숫자를 질문으로 미리 짚어요.</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>프로젝트</p>
            <h3>시연과 질의응답</h3>
            <p>&ldquo;왜 이 방법을 골랐나요?&rdquo;에 답하는 연습을 해요.</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>졸업·연구</p>
            <h3>중간·최종 발표</h3>
            <p>결론이 근거보다 넓어진 곳을 찾아 범위를 좁혀요.</p>
          </div>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="intro-how">
        <p className={styles.eyebrow}>사용 방법</p>
        <h2 id="intro-how">대본 하나로 두 가지를 연습해요</h2>
        <p className={styles.intro}>
          처음엔 질문으로, 그다음엔 리허설로. 리허설 결과는 &apos;가장 먼저 고칠 한 가지&apos;부터 보여 줘요.
        </p>
        <ol className={styles.steps}>
          <li>
            <p className={styles.stepLabel}>01 · 대본</p>
            <h3>대본을 넣어요</h3>
            <p>발표할 말을 그대로 붙여 넣고, 듣는 사람과 제한 시간을 적어요.</p>
          </li>
          <li>
            <p className={styles.stepLabel}>02 · 질문</p>
            <h3>소리로 묻고, 말로 답해요</h3>
            <p>
              {QUESTION_TYPES.join(", ")}. 대본의 약한 곳을 겨냥한 질문 {QUESTION_COUNT}개가 하나씩 나와요.
            </p>
          </li>
          <li>
            <p className={styles.stepLabel}>03 · 리허설</p>
            <h3>문장마다 짚어 줘요</h3>
            <p>멈춘 곳을 대본 위에 표시해요. 받아쓰기를 켜면 빨라진 문장, 카메라를 켜면 시선이 낮았던 문장도 짚어요.</p>
          </li>
        </ol>
      </section>

      <section className={styles.block} aria-labelledby="intro-what">
        <p className={styles.eyebrow}>무엇을 봐 주나요</p>
        <h2 id="intro-what">내용, 전달, 시선을 나눠서 봐요</h2>
        <p className={styles.intro}>
          숫자는 정해 둔 기준표로 코드가 재고, 코치는 그 숫자만 근거로 설명해요. 대본에 없는 숫자나 &ldquo;긴장해
          보여요&rdquo; 같은 판단은 쓰지 않아요.
        </p>
        <div className={styles.cats}>
          <div className={styles.cat}>
            <p className={styles.chip}>질문 연습</p>
            <h3>내용</h3>
            <p className={styles.why}>질문은 주장과 근거 사이가 빈 곳에서 나와요.</p>
            <ul>
              <li>잘한 점 2개, 고칠 점 3개 (대본 인용)</li>
              <li>고칠 점마다 &ldquo;이렇게 말해 보기&rdquo;</li>
              <li>답변 판정: {VERDICTS.join(" · ")}</li>
            </ul>
          </div>
          <div className={styles.cat}>
            <p className={styles.chip}>리허설 · 마이크</p>
            <h3>전달</h3>
            <p className={styles.why}>같은 내용도 빠르거나 오래 멈추면 놓쳐요.</p>
            <ul>
              <li>
                말 속도: 분당 {SPEED_LOW}~{SPEED_HIGH}음절 권장
              </li>
              <li>3초 넘게 멈춘 곳과 그 문장</li>
              <li>끝으로 갈수록 작아지는 목소리, 제한 시간</li>
            </ul>
          </div>
          <div className={styles.cat}>
            <p className={styles.chip}>리허설 · 카메라 선택</p>
            <h3>시선과 자세</h3>
            <p className={styles.why}>화면을 덜 보면 청중과 멀어져요.</p>
            <ul>
              <li>화면을 본 시간, 시선이 낮았던 문장</li>
              <li>평소보다 웃은 시간</li>
              <li>고개 움직임, 화면 안 자세</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="intro-privacy">
        <p className={styles.eyebrow}>개인정보</p>
        <h2 id="intro-privacy">무엇이 어디로 가는지 먼저 알려 드려요</h2>
        <p className={styles.intro}>녹음과 영상은 저장하지 않아요. 밖으로 나가는 것은 아래 두 가지뿐이에요.</p>
        <div className={styles.privacy}>
          <div>
            <p className={`${styles.tag} ${styles.stay}`}>브라우저 안</p>
            <h3>리허설 소리와 카메라 영상</h3>
            <p>저장하지 않고 브라우저 밖으로 보내지 않아요. 말한 구간과 얼굴 값만 계산해요.</p>
          </div>
          <div>
            <p className={`${styles.tag} ${styles.go}`}>구글 서버</p>
            <h3>말로 한 답변과 켜 둔 받아쓰기</h3>
            <p>받아쓰기를 위해 목소리가 구글 서버로 전송돼요. 이 앱은 녹음을 저장하지 않아요.</p>
          </div>
          <div>
            <p className={`${styles.tag} ${styles.go}`}>Claude API</p>
            <h3>대본·주제·듣는 사람, 답변 글, 점수 숫자와 문장별 표시</h3>
            <p>평가를 위해 보내요. 영상, 사진, 소리는 보내지 않아요.</p>
          </div>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="intro-start">
        <div>
          <h2 id="intro-start">다음 발표 대본, 지금 넣어 보세요</h2>
          <p>질문 준비에 30~50초쯤 걸려요.</p>
        </div>
        <Link className={styles.closingButton} href="/practice">
          질문 연습 시작
        </Link>
      </section>
    </main>
  );
}
