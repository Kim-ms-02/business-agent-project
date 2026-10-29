public/vad/ 폴더의 파일은 npm run dev 또는 npm run build를 할 때 scripts/copy-vad-assets.mjs가
node_modules에서 자동으로 복사합니다. 이 폴더(licenses/vad)의 라이선스 문구도 함께 복사됩니다.

- vad.worklet.bundle.min.js: @ricky0123/vad-web 0.0.31 (ISC, ricky0123) → LICENSE-vad-web-and-silero-vad.txt
- silero_vad_v5.onnx: 말소리 판별 모델 Silero VAD (MIT, Silero Team) → LICENSE-vad-web-and-silero-vad.txt
- ort-wasm-simd-threaded.mjs, ort-wasm-simd-threaded.wasm: onnxruntime-web 1.31.1 (MIT, Microsoft Corporation) → LICENSE-onnxruntime-web.txt

라이선스 원문 출처 (npm 패키지 안에는 라이선스 파일이 들어 있지 않아 저장소에서 가져왔습니다):
- https://github.com/ricky0123/vad/blob/master/LICENSE
- https://github.com/microsoft/onnxruntime/blob/main/LICENSE
