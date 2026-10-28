import { readFileSync } from "node:fs";
import path from "node:path";

// Server-only: reads the coaching rules that are sent to Claude as instructions.
const SKILL_PATH = path.join(process.cwd(), "skills", "presentation-coach", "SKILL.md");

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function stripFrontmatter(text: string): string {
  return text.replace(FRONTMATTER, "").trimStart();
}

let cached: string | null = null;

export function loadSkill(): string {
  cached ??= stripFrontmatter(readFileSync(SKILL_PATH, "utf8"));
  return cached;
}
