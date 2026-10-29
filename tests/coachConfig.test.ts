import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FEEDBACK_SENTENCES,
  IMPROVEMENT_COUNT,
  MAX_SUMMARY_SENTENCES,
  QUESTION_COUNT,
  STRENGTH_COUNT,
} from "@/lib/coachConfig";
import { loadSkill } from "@/lib/skill";
import { QUESTION_TYPES } from "@/lib/types";
import { REQUIRED_COUNTS } from "@/lib/validate";

const skill = loadSkill();
const skillFile = readFileSync("skills/presentation-coach/SKILL.md", "utf8");

// The skill file writes some counts as Korean number words, as in "세 문장".
const KOREAN_COUNTS: Record<number, string> = { 1: "한", 2: "두", 3: "세", 4: "네", 5: "다섯" };

/** The numbered items right after the line that contains `marker`. */
function numberedItemsAfter(marker: string): string[] {
  const lines = skill.split("\n");
  const start = lines.findIndex((line) => line.includes(marker));
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\d+\. /.test(line)) break;
    items.push(line.trim());
  }
  return items;
}

describe("coach counts", () => {
  it("has one question type per question", () => {
    expect(QUESTION_TYPES).toHaveLength(QUESTION_COUNT);
  });

  it("are the counts the result check enforces", () => {
    expect(REQUIRED_COUNTS).toEqual({
      strengths: STRENGTH_COUNT,
      improvements: IMPROVEMENT_COUNT,
      questions: QUESTION_COUNT,
    });
  });
});

describe("SKILL.md uses the same counts as coachConfig", () => {
  it("strengths and improvements", () => {
    expect(skill).toContain(`잘한 점은 정확히 ${STRENGTH_COUNT}개`);
    expect(skill).toContain(`고칠 점은 정확히 ${IMPROVEMENT_COUNT}개`);
    expect(skillFile).toContain(`잘한 점 ${STRENGTH_COUNT}개와 고칠 점 ${IMPROVEMENT_COUNT}개`);
  });

  it("questions", () => {
    expect(skill).toContain(`질문은 정확히 ${QUESTION_COUNT}개`);
    expect(skill).toContain(`가장 아픈 ${QUESTION_COUNT}개`);
    expect(skill).toContain(`고른 ${QUESTION_COUNT}개만`);
    expect(skill).toContain(`질문 ${QUESTION_COUNT}개에 대한 답변 ${QUESTION_COUNT}개`);
  });

  it("answer feedback sentences", () => {
    expect(skill).toContain(`피드백은 정확히 ${KOREAN_COUNTS[FEEDBACK_SENTENCES]} 문장`);
    expect(numberedItemsAfter("피드백은 정확히")).toHaveLength(FEEDBACK_SENTENCES);
  });

  it("summary sentences", () => {
    expect(skill).toContain(`총평은 최대 ${MAX_SUMMARY_SENTENCES}문장`);
    expect(numberedItemsAfter("총평은 최대")).toHaveLength(MAX_SUMMARY_SENTENCES);
  });
});
