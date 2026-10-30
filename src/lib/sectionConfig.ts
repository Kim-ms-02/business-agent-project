// Section feedback (v0.4) values. These are design values chosen for a first version, not
// scientifically established ones. They are meant to be tuned after real rehearsals; change them only here.

// ---------- Matching dictation to the script ----------

// A dictated piece matches part of the script when at least this share of its letters line up
// (1 − edit distance ÷ letters in the piece). Below that it is most likely improvised speech or a
// badly misheard line, and the position stays where it was.
export const MATCH_MIN_SIMILARITY = 0.6;

// Where to look for the next piece: one sentence back, since speakers often repeat a sentence,
// up to five ahead, so a skipped sentence or two can still be followed.
export const SEARCH_BACK_SENTENCES = 1;
export const SEARCH_AHEAD_SENTENCES = 5;

// A piece shorter than this many letters (after spaces, punctuation, and hesitation sounds are removed)
// matches too easily: "감사" fits any closing line. Such a piece never moves the position.
export const MIN_MATCH_LETTERS = 4;

// A sentence counts as read when at least half of its letters were matched.
export const READ_MIN_COVERAGE = 0.5;

// While the speaker talks, dictation normally sends something every few seconds. More than this many
// seconds of speech with nothing back means dictation stopped; sentences said then are unknown, not skipped.
export const DICTATION_GAP_SECONDS = 5;
