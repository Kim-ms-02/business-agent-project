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

  it("evaluates the three answers at once and asks no follow-up questions in v0.1", () => {
    expect(skill).toContain("답변 3개를 한 번에 받아서 한 번에 평가한다");
    expect(skill).toContain("꼬리 질문은 내지 않는다");
    expect(skill).not.toContain("## 꼬리 질문");
  });

  it("names all three question types", () => {
    for (const type of ["근거", "선택 이유", "한계"]) {
      expect(skill).toContain(type);
    }
  });

  it("states the fixed feedback counts", () => {
    expect(skill).toContain("잘한 점은 정확히 2개");
    expect(skill).toContain("고칠 점은 정확히 3개");
  });
});
