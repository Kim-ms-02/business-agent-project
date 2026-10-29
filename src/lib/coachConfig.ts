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
