import { describe, expect, it } from "vitest";
import { loadSkill, stripFrontmatter } from "@/lib/skill";

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

  it("asks for one answer to avoid per question", () => {
    expect(skill).toContain("피할 답");
  });

  it("states the fixed feedback counts", () => {
    expect(skill).toContain("잘한 점은 정확히 2개");
    expect(skill).toContain("고칠 점은 정확히 3개");
  });
});
