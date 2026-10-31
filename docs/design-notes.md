# 디자인 노트 (v1.1 사이트 구조)

밤 작업 때 정한 "조용한 연습실"(칠판 초록, Pretendard) 디자인은 사용자가 고른 사이트 시안으로 바꿨다(2026-10-31). 예전 내용은 git 기록(9d75b9e)에 남아 있다.

## 기준 시안

- 파일: docs/design/site-mockup.html. 위에 메뉴가 있는 서비스 사이트(소개, 질문 연습, 리허설, 자주 묻는 질문).
- 시안의 중심 모양: 리허설 표시를 주황 연필로 적어 넣은 대본 한 장.
- 시안 HTML은 그대로 복사하지 않는다. 색·글꼴·간격만 globals.css의 변수로 옮기고, 화면은 앱 구조에 맞게 다시 만든다.
- 시안 문구 중 실제 앱과 다른 것은 화면을 만들 때 고친다(CLAUDE.md "시안 문구 고치기").

## 색 (밝은 화면 / 어두운 화면)

| 이름 | 쓰는 곳 | 밝은 화면 | 어두운 화면 |
|---|---|---|---|
| paper | 바탕 | #F5F6F8 | #11141A |
| sheet | 종이, 카드 | #FFFFFF | #191D26 |
| ink | 본문 글, 주 버튼 바탕, 질문 판 | #161B26 | #E9ECF2 |
| muted | 안내 글, 작은 이름표 | #586172 | #A3ABB8 |
| line | 가는 선, 테두리 | #DDE1E8 | #2B313D |
| spot | 주황: 로고 점, 물결 밑줄, 진행 막대, 고칠 한 가지 왼쪽 선 | #D9822B | #F0A64E |
| spot-ink | 진한 주황: 문장 표시 글자, 이름표 글자, 초점 테두리 | #8F4E0C | #F3B66F |
| spot-wash | 연한 주황: 문장 표시 바탕, 고칠 한 가지 판 | #FCEFDF | #2E2416 |
| good / good-wash | "브라우저 안" 표시, 권장 범위 띠 | #2F6B4F / #E3F1EA | #7CC3A0 / #16271F |
| danger / danger-surface | 오류 안내 (시안에 없어 전 값을 씀) | #A3291F / #FBEAE7 | #F2B3AB / #3A1C19 |
| warning / warning-surface / warning-text | 대본에서 찾지 못한 인용(노란색) (시안에 없어 전 값을 씀) | #B88A00 / #FFF3CC / #6E5200 | #D8AE3A / #362C12 / #F0D47E |
| focus-ring | 키보드 초점 테두리 (= spot-ink) | #8F4E0C | #F3B66F |

- 어두운 화면은 시스템 설정을 따르고(`prefers-color-scheme`), `<html data-theme="light|dark">`로 직접 고를 수도 있다.
- 지금 화면이 쓰는 옛 이름(background, foreground, border, surface, accent, accent-text, focus-surface)은 새 색으로 이어 두었다. 페이지를 다시 만들면 7단계에서 지운다.

## 대비 (WCAG 2)

글자는 4.5:1 이상, 초점 테두리는 3:1 이상. tests/designTokens.test.ts가 같은 짝을 globals.css에서 읽어 계산한다.

| 글자·표시 | 바탕 | 밝은 화면 | 어두운 화면 |
|---|---|---|---|
| ink | paper | 15.93 | 15.58 |
| ink | sheet | 17.23 | 14.25 |
| muted | paper | 5.77 | 7.97 |
| muted | sheet | 6.24 | 7.29 |
| paper (주 버튼 글자, 질문 판) | ink | 15.93 | 15.58 |
| spot-ink | spot-wash | 5.69 | 8.50 |
| spot-ink | sheet | 6.44 | 9.42 |
| spot-ink | paper | 5.95 | 10.30 |
| ink | spot-wash | 15.22 | 12.86 |
| muted | spot-wash | 5.51 | 6.58 |
| good | good-wash | 5.41 | 7.57 |
| good | sheet | 6.29 | 8.17 |
| danger | danger-surface | 6.23 | 8.68 |
| danger | sheet | 7.26 | 9.49 |
| warning-text | warning-surface | 6.60 | 9.45 |
| warning-text | sheet | 7.32 | 11.58 |
| ink | warning-surface | 15.54 | 11.63 |
| focus-ring | paper / sheet / spot-wash | 5.95 / 6.44 / 5.69 | 10.30 / 9.42 / 8.50 |

- 밝은 화면의 주황(spot)은 바탕 위에서 2.71~2.93이라 3:1에 못 미친다. 그래서 글자와 초점 테두리에는 쓰지 않고, 옆에 글자가 함께 있는 꾸밈(로고 점, 밑줄, 왼쪽 선, 그래프의 범위 밖 점)에만 쓴다. 시안은 초점 테두리에 이 주황을 썼지만 진한 주황으로 바꿨다.

## 글꼴

| 역할 | 글꼴 | 굵기 | 라이선스 |
|---|---|---|---|
| 제목(h1~h3), 질문 글, 목표 | Noto Serif KR | 600, 800 | SIL OFL 1.1 (Google) |
| 본문 | IBM Plex Sans KR | 400, 500, 600 | SIL OFL 1.1 (Mike Abbink, Bold Monday) |
| 숫자 표시(점수, 문장 번호, 표시 글자) | IBM Plex Mono | 500 | SIL OFL 1.1 (Mike Abbink, Bold Monday) |

- 라이선스는 구글 폰트 저장소의 METADATA.pb(`license: "OFL"`)로 확인했다. 앱에 넣어 쓰는 것은 허용, 글꼴 파일만 따로 파는 것은 안 된다.
- next/font로 개발 서버·빌드 때 한 번 내려받아 앱 안에서 내보낸다. 실행 중에는 글꼴 서버로 요청하지 않는다(빌드 결과 CSS에 fonts.googleapis.com·fonts.gstatic.com 0개, 화면에서 바깥 글꼴 요청 0개 확인). 처음 개발 서버를 켜거나 빌드할 때는 인터넷이 필요하다.
- 한글 글꼴은 조각이 많아(빌드 결과 글꼴 파일 503개, 12MB) 미리 불러오지 않고, 브라우저가 쓰는 글자 조각만 받는다.
- IBM Plex Mono에는 한글이 없어서 "점", "초" 같은 글자는 본문 글꼴로 이어 보인다.
- Pretendard는 v1.1 7단계에서 지운다.

## 간격과 모양

| 이름 | 값 | 쓰는 곳 |
|---|---|---|
| space-xs / sm / md / lg / xl | 6 / 10 / 18 / 28 / 48px | 요소 사이 |
| space-section | 64px | 소개 페이지 구역 사이 |
| page-max | 1120px | 머리글·본문·바닥글 최대 너비 |
| gutter | 24px (480px 이하 16px) | 양옆 여백 |
| radius-mark / button / card / stage / pill | 4 / 10 / 14 / 18 / 999px | 문장 표시, 버튼, 카드, 질문 판, 메뉴·이름표 |

- 버튼과 입력 칸은 높이 44px 이상.
- 좁은 화면(900px 미만)에서는 메뉴를 로고 아래 둘째 줄로 내린다(시안은 메뉴를 숨겼지만 그러면 휴대폰에서 페이지를 옮길 수 없다).

## 지키는 것

- 기능, 계산, 서버 코드, 안내 문구(연습용 참고 점수, 구글 서버 전송, 카메라 영상, 설계 값, 즉흥 발표)는 바꾸지 않는다.
- 상태 표시(판정, 멈춤, 시선 낮음, 빠름, 건너뜀, 읽지 않음, 노란 인용, 그래프의 범위 밖 구간)는 색만이 아니라 글자로 보인다.
- 시안의 깜빡이는 녹음 점은 움직임 줄이기 설정을 켠 사람에게는 멈춘다.
- 개발용 칸은 꾸미지 않는다.
