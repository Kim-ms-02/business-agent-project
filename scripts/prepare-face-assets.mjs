// Prepares the face measurement files that run in the browser in public/face/, together with their license.
// Runs before `npm run dev` and `npm run build`. public/face/ is in .gitignore, so nothing here is committed.
// - The wasm files are copied from node_modules (only the SIMD build, which is what browsers like Chrome load).
// - The face model is downloaded from a versioned URL only when it is missing or its SHA-256 does not match.
//   If the download fails, a build stops; the dev server only warns, and the camera part shows its own message.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "public/face";
const WASM_DIR = "node_modules/@mediapipe/tasks-vision/wasm";
const WASM_FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];
const LICENSE_DIR = "licenses/face";

const MODEL_FILE = "face_landmarker.task";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";

const strict = process.env.npm_lifecycle_event === "prebuild";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function ensureModel() {
  const target = join(OUT_DIR, MODEL_FILE);
  if (existsSync(target) && sha256(target) === MODEL_SHA256) return;

  console.log(`얼굴 모델을 내려받는 중: ${MODEL_URL}`);
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const hash = createHash("sha256").update(data).digest("hex");
  if (hash !== MODEL_SHA256) throw new Error(`지문이 다릅니다 (${hash})`);

  const partial = `${target}.download`;
  writeFileSync(partial, data);
  renameSync(partial, target);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const name of WASM_FILES) copyFileSync(join(WASM_DIR, name), join(OUT_DIR, name));
for (const name of readdirSync(LICENSE_DIR)) copyFileSync(join(LICENSE_DIR, name), join(OUT_DIR, name));

try {
  await ensureModel();
} catch (error) {
  console.error(`얼굴 모델을 준비하지 못했습니다: ${error.message}`);
  if (strict) process.exit(1);
  console.error("개발 서버는 그대로 켭니다. 카메라 측정은 모델을 불러오지 못했다고 안내합니다.");
}

for (const name of readdirSync(OUT_DIR).sort()) {
  console.log(`${OUT_DIR}/${name}  ${statSync(join(OUT_DIR, name)).size.toLocaleString("en-US")} B`);
}
