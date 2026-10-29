import { readFileSync } from "node:fs";
import path from "node:path";

// Server-only: reads the coaching rules that are sent to Claude as instructions.
const SKILL_PATH = path.join(process.cwd(), "skills", "presentation-coach", "SKILL.md");

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function stripFrontmatter(text: string): string {
  return text.replace(FRONTMATTER, "").trimStart();
}

// The dev server reads the file on every call so edits to the rules apply without a restart.
// The built app reads it once.
export function shouldCacheSkill(env: string | undefined): boolean {
  return env !== "development";
}

export function createSkillLoader(read: () => string, cache: boolean): () => string {
  let cached: string | null = null;
  return () => {
    if (!cache) return stripFrontmatter(read());
    cached ??= stripFrontmatter(read());
    return cached;
  };
}

export const loadSkill = createSkillLoader(
  () => readFileSync(SKILL_PATH, "utf8"),
  shouldCacheSkill(process.env.NODE_ENV),
);
