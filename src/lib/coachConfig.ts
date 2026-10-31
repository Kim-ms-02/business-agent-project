// Counts the coach works with. SKILL.md states the same numbers in words, and
// tests/coachConfig.test.ts fails when the two disagree, so change both together.

// Questions asked per practice round.
// One question per type in QUESTION_TYPES (src/lib/types.ts): 근거, 다른 설명, 개념과 범위.
// Changing this count means deciding how to split the types first (for example, which type
// gets a second question, or which type is dropped). That decision is not made yet.
export const QUESTION_COUNT = 3;

export const STRENGTH_COUNT = 2;
export const IMPROVEMENT_COUNT = 3;

// Answer feedback: what went well, what is missing, and one sentence to try.
export const FEEDBACK_SENTENCES = 3;

// Summary: biggest strength, first fix, an optional notice, and encouragement.
export const MAX_SUMMARY_SENTENCES = 4;

// Rehearsal feedback must describe behavior with numbers, not guess feelings (design principle 5).
// If the coach's text contains one of these, it is asked once more; an item that still has one is left out.
// Matching ignores spaces, so "자신 없" also catches "자신없어".
export const FEEDBACK_BANNED_WORDS = ["긴장", "자신감", "자신 없", "불안", "떨", "표정이 어둡"];

// Words whose plain form would catch too much or too little, with the forms actually searched for.
// "떨" alone would also catch 떨어지다 ("시선이 떨어진 구간", to drop), which is not about feelings,
// so only the trembling forms are searched. 어둡다 changes to 어두워 in speech, so both forms are searched.
export const BANNED_WORD_FORMS: Record<string, string[]> = {
  떨: ["떨리", "떨려", "떨렸", "떨림"],
  "표정이 어둡": ["표정이 어둡", "표정이 어두"],
};

// Words that show a try-this line is telling the speaker what to do ("숫자로 넣어 말해 보세요")
// instead of being a sentence to say. Matched without spaces. Plain requests to the audience
// ("여러분도 휴대폰을 열어 보세요") are left alone, so only instruction-like verbs are listed.
export const TRY_THIS_GUIDANCE = ["넣어", "이렇게말해", "말해보세요", "덧붙여보세요", "확인해보세요", "바꿔보세요"];
