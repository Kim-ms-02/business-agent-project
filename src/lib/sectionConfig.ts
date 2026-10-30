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

// After this many pieces in a row match nothing near the current position, the speaker has probably
// jumped further than five sentences (a whole paragraph skipped, or gone back to the start), so the
// piece is looked for in the whole script. Fewer would let one stretch of improvised speech jump the
// position to a look-alike sentence far away; more would leave the position lost for too long.
export const MISSES_BEFORE_FULL_SEARCH = 3;

// A piece shorter than this many letters (after spaces, punctuation, and hesitation sounds are removed)
// matches too easily: "감사" fits any closing line. Such a piece never moves the position.
export const MIN_MATCH_LETTERS = 4;

// A sentence counts as read when at least half of its letters were matched.
export const READ_MIN_COVERAGE = 0.5;

// While the speaker talks, dictation normally sends something every few seconds. More than this many
// seconds of speech with nothing back means dictation stopped; sentences said then are unknown, not skipped.
export const DICTATION_GAP_SECONDS = 5;

// ---------- Sentence marks ----------

// A sentence is judged for low gaze only when at least this many frames with a face fall inside it
// (about one second at ten measurements a second). Fewer frames swing too much on a single glance.
// The low-gaze share itself is the same as the 10-second stretches on the face result (LOW_GAZE_RATIO).
export const SENTENCE_GAZE_MIN_FRAMES = 10;

// A sentence is fast when its pace is at least this many times the whole rehearsal's pace...
export const FAST_PACE_RATIO = 1.2;
// ...and over the top of the 4-point speed band, so a slow speaker's normal sentence is not called fast.
export const FAST_PACE_MIN = 330;
// Sentences spoken for less than this many seconds are not judged. Dictation results can arrive 1–2 s
// early or late, which moves that much speaking time between neighbouring sentences: for a 2-second
// sentence that is a 50–100% error in pace, far more than the 1.2× being looked for. At 5 seconds
// (about 25 syllables, a longish sentence) the error is 20–40%. Fewer sentences are judged, but a
// wrong "빠름" pointing at the wrong sentence is worse than one that is not shown.
export const FAST_MIN_SPOKEN_SECONDS = 5;

// Filler words counted from dictation, only when a whole word is exactly one of these. "그" is also an
// ordinary word ("그 결과"), so the count is shown as low accuracy and never scored.
export const FILLER_WORDS = ["음", "어", "그", "그니까", "약간"];
