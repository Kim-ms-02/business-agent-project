// Copies the voice activity detection files that run in the browser from node_modules into
// public/vad/, together with their licenses. Runs before `npm run dev` and `npm run build`.
// public/vad/ is in .gitignore, so these files are never committed.
import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "public/vad";
const FILES = [
  ["node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js", "vad.worklet.bundle.min.js"],
  ["node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx", "silero_vad_v5.onnx"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.mjs"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.wasm"],
];
const LICENSE_DIR = "licenses/vad";

mkdirSync(OUT_DIR, { recursive: true });
for (const [from, to] of FILES) copyFileSync(from, join(OUT_DIR, to));
for (const name of readdirSync(LICENSE_DIR)) copyFileSync(join(LICENSE_DIR, name), join(OUT_DIR, name));

for (const name of readdirSync(OUT_DIR).sort()) {
  console.log(`${OUT_DIR}/${name}  ${statSync(join(OUT_DIR, name)).size.toLocaleString("en-US")} B`);
}
