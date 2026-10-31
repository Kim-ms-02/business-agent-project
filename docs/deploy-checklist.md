# 배포 체크리스트 (Vercel)

이 문서는 배포 준비로 확인한 내용과, 나중에 직접 배포할 때 할 일의 순서를 적은 것이다. 아직 배포하지 않았다.

## 미리 확인한 것 (2026-10-31)

| 확인한 것 | 결과 | 근거 |
|---|---|---|
| 말소리 판별 파일(public/vad)과 얼굴 모델(public/face)이 배포 서버의 설치·빌드에서도 준비되는지 | 된다 | 저장소를 새로 받아(이 두 폴더가 없는 상태) `npm ci` → `npm run build`를 실행했더니, 빌드 전에 두 폴더가 만들어지고 빌드가 끝났다. 얼굴 모델은 인터넷에서 내려받고 SHA-256을 검사한다 |
| Vercel이 위 준비 단계를 실행하는지 | 된다(설정을 바꾸지 않을 때) | Vercel 문서: Next.js 프로젝트는 package.json의 `build` 명령을 쓴다. 그러면 npm이 `prebuild`(파일 준비)를 먼저 실행한다. 빌드 명령을 `next build`로 직접 바꾸면 준비 단계가 빠지므로 바꾸지 않는다 |
| 질문 만들기 요청이 함수 시간 제한에 걸리는지 | 지금은 설정이 필요 없다 | Vercel 문서: 기본(fluid compute 켜짐) 시간 제한은 무료(Hobby)·Pro 모두 300초. 질문 만들기는 로컬에서 30~50초쯤 걸린다. 배포 후 실제로 60초를 넘기는 일이 잦으면 그때 다시 본다 |
| 테스트용 jsdom이 앱 패키지가 아닌 개발용(devDependencies)에 있는지 | 있다 | package.json의 devDependencies에 `jsdom 30.1.2` |
| 저장소에 API 키, .env 파일, 개인정보, 큰 파일이 있는지 | 없다 | 커밋된 파일 전체 검사: `sk-ant` 키 없음, .env 파일은 빈 값의 `.env.example`만, 이메일·전화번호 없음(커밋 서명의 noreply 주소 제외), 500KB 넘는 파일 없음. public/vad, public/face, .env*, .next는 .gitignore에 있다 |

## 배포 순서 (내가 할 일)

1. main에 v1.1을 합친 뒤, 원격 저장소(GitHub)에 main을 올린다.
2. Vercel에 로그인해 "New Project"에서 이 저장소를 가져온다. Framework는 Next.js로 잡히는지 본다.
3. Build Command는 비워 두거나 `npm run build`로 둔다. `next build`로 바꾸지 않는다(말소리·얼굴 모델 파일이 빠진다).
4. Install Command는 기본값(npm install 또는 npm ci)을 둔다. 개발용 패키지도 설치되는 기본 동작을 끄지 않는다.
5. Node.js 버전은 Project Settings에서 24.x로 맞춘다(로컬이 v24).
6. Environment Variables에 넣는다.
   - `ANTHROPIC_API_KEY`: 내 Claude API 키. 화면이나 채팅에 붙여 넣지 않고 Vercel 설정 칸에만 넣는다.
   - `COACH_MODEL`: 선택. 비워 두면 claude-sonnet-5-5.
7. Deploy를 누르고 빌드 기록에서 다음 두 줄이 있는지 본다.
   - `public/vad/silero_vad_v5.onnx` 복사
   - `얼굴 모델을 내려받는 중` 다음에 오류가 없음
8. 배포된 주소에서 확인한다.
   - `/vad/silero_vad_v5.onnx`, `/face/face_landmarker.task` 주소를 열면 파일이 내려받아지는지
   - 질문 연습: 대본을 넣고 "질문 받기" → 질문 3개가 오는지, 걸린 시간
   - 리허설: 마이크를 켜고 "말하는 중 / 조용함"이 바뀌는지, 카메라를 켜고 얼굴을 찾는지
   - 받아쓰기는 https 주소에서만 되므로 배포 주소(https)에서 크롬으로 확인
9. 사용 요금이 걱정되면 Anthropic 콘솔에서 월 사용 한도를 정해 둔다. 이 앱에는 아직 요청 횟수 제한이 없다(CLAUDE.md "나중에").

## 배포 후 알려진 위험

- 주소를 아는 사람은 누구나 질문 만들기를 눌러 내 API 키로 요금이 나가게 할 수 있다. 요청 횟수 제한은 아직 없다.
- 얼굴 모델은 빌드할 때마다 Google 저장소에서 내려받는다. 그 주소가 바뀌거나 막히면 빌드가 멈춘다(일부러 그렇게 만들었다: 모델 없이 배포되지 않게).
- 무료(Hobby) 요금제의 사용 범위(상업 이용 금지 등)는 배포 전에 Vercel 약관에서 직접 확인한다.
