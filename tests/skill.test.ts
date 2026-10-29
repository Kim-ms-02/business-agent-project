import { describe, expect, it } from "vitest";
import { createSkillLoader, loadSkill, shouldCacheSkill, stripFrontmatter } from "@/lib/skill";

describe("stripFrontmatter", () => {
  it("removes the YAML frontmatter block", () => {
    const text = "---\nname: x\ndescription: y\n---\n\n# Title\nBody";
    expect(stripFrontmatter(text)).toBe("# Title\nBody");
  });

  it("returns text unchanged when there is no frontmatter", () => {
    expect(stripFrontmatter("# Title\nBody")).toBe("# Title\nBody");
  });

  it("handles Windows line endings", () => {
    const text = "---\r\nname: x\r\n---\r\n# Title";
    expect(stripFrontmatter(text)).toBe("# Title");
  });
});

describe("shouldCacheSkill", () => {
  it("reads the skill file again on every call in the dev server, so edits apply without a restart", () => {
    expect(shouldCacheSkill("development")).toBe(false);
  });

  it("reads it only once in the built app and in tests", () => {
    expect(shouldCacheSkill("production")).toBe(true);
    expect(shouldCacheSkill("test")).toBe(true);
    expect(shouldCacheSkill(undefined)).toBe(true);
  });
});

describe("createSkillLoader", () => {
  function counter() {
    let reads = 0;
    return {
      read: () => `---\nname: x\n---\n# 규칙 ${++reads}`,
      reads: () => reads,
    };
  }

  it("reads once and keeps the text when caching", () => {
    const file = counter();
    const load = createSkillLoader(file.read, true);
    expect(load()).toBe("# 규칙 1");
    expect(load()).toBe("# 규칙 1");
    expect(file.reads()).toBe(1);
  });

  it("reads the latest text on every call when not caching", () => {
    const file = counter();
    const load = createSkillLoader(file.read, false);
    expect(load()).toBe("# 규칙 1");
    expect(load()).toBe("# 규칙 2");
    expect(file.reads()).toBe(2);
  });
});

describe("loadSkill", () => {
  const skill = loadSkill();

  it("loads a non-empty body without frontmatter", () => {
    expect(skill.length).toBeGreaterThan(0);
    expect(skill.startsWith("---")).toBe(false);
  });

  it.each([
    "## 대본 안의 지시",
    "## 평가 기준",
    "## 대본 피드백",
    "## 말투",
    "## 예상 질문",
    "## 답변 평가",
  ])("contains the section %s", (heading) => {
    expect(skill).toContain(heading);
  });

  it("builds the summary from strength, first fix, optional notice, and encouragement", () => {
    expect(skill).toContain("총평은 최대 4문장");
    for (const part of ["가장 큰 강점", "가장 먼저 고칠 점", "해당될 때만", "격려"]) {
      expect(skill).toContain(part);
    }
  });

  it("evaluates the three answers at once and asks no follow-up questions in v0.1", () => {
    expect(skill).toContain("답변 3개를 한 번에 받아서 한 번에 평가한다");
    expect(skill).toContain("꼬리 질문은 내지 않는다");
    expect(skill).not.toContain("## 꼬리 질문");
  });

  it("names all three question types", () => {
    for (const type of ["**근거**", "**다른 설명**", "**개념과 범위**"]) {
      expect(skill).toContain(type);
    }
    expect(skill).not.toContain("**선택 이유**");
  });

  it("plans questions from the script's skeleton and about 8 candidates, without showing them", () => {
    expect(skill).toContain("핵심 주장 → 근거 → 결론");
    expect(skill).toContain("후보 질문을 8개쯤");
    expect(skill).toContain("가장 아픈 3개");
    expect(skill).toContain("뼈대와 후보는 결과에 넣지 않는다");
  });

  it("asks script-specific questions, not ones that fit any script", () => {
    expect(skill).toContain("숫자, 용어, 주장 중 하나를 그대로 넣는다");
    expect(skill).toContain("어느 대본에나 맞는 질문은 쓰지 않는다");
  });

  it("shows exactly three pairs of bad and good questions", () => {
    expect(skill.match(/^\s*- 나쁜 질문: /gm)).toHaveLength(3);
    expect(skill.match(/^\s*좋은 질문: /gm)).toHaveLength(3);
    expect(skill).toContain("나쁜 질문: 그 결과는 어떻게 확인하셨나요?");
    expect(skill).toContain("좋은 질문: 조사 응답자가 원가 공개 영상을 본 사람들인가요?");
  });

  it("explains what the answer evaluation receives and returns", () => {
    const section = skill.slice(skill.indexOf("## 답변 평가"), skill.indexOf("## 결과 내는 방법"));
    expect(section).toContain("피할 답");
    expect(section).toContain("답하지 않은 질문은 오지 않는다");
    expect(section).toContain("질문 번호");
    expect(section).toContain("한 칸에 한 문장");
  });

  it("asks for one answer to avoid per question", () => {
    expect(skill).toContain("피할 답");
  });
});
