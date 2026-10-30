public/face/ 폴더의 파일은 npm run dev 또는 npm run build를 할 때 scripts/prepare-face-assets.mjs가
준비합니다. 이 폴더(licenses/face)의 라이선스 문구도 함께 복사됩니다.

- vision_wasm_internal.js, vision_wasm_internal.wasm: @mediapipe/tasks-vision 1.1.1
  (Apache-2.0, Google) → LICENSE-mediapipe-apache-2.0.txt
  node_modules에서 복사합니다.
- face_landmarker.task: MediaPipe Face Landmarker 모델 (float16, 버전 1)
  (Apache-2.0, Google, 모델 설명서 기준) → LICENSE-mediapipe-apache-2.0.txt
  파일이 없거나 지문(SHA-256)이 다를 때만 아래 주소에서 내려받습니다.
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

라이선스 원문 출처 (npm 패키지 안에는 라이선스 파일이 들어 있지 않아 저장소에서 가져왔습니다):
- https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE

모델 설명서 (라이선스와 사용 범위):
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf
- https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf
설명서의 사용 범위: 감시나 신원 확인에 쓰지 않고, 사람에게 중요한 결정에 쓰지 않습니다.
