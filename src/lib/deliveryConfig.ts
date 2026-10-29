// Delivery score baselines for rehearsal mode (v0.2).
// These are design values chosen for a first version, not scientifically established ones.
// They are meant to be tuned after trying real rehearsals; change them only here.

/** A score and the value ranges that earn it. Ranges include both ends. */
export interface Band {
  score: number;
  ranges: [min: number, max: number][];
}

// Bands are checked from the best score down, so a value on a shared edge gets the better score
// (for example, exactly 330 syllables per minute scores 4, not 3).
// A value outside every band scores 1.
export const LOWEST_SCORE = 1;
export const MAX_ITEM_SCORE = 4;

// The voice tracker records the average volume this often.
export const VOLUME_SAMPLE_SECONDS = 0.1;

// Below this much speech the numbers swing too much to mean anything, so no score is given.
export const MIN_SPOKEN_SECONDS = 10;

// Syllables per minute of actual speaking time.
// Around 300 is the pace the app already assumes for estimates; 250–330 keeps a comfortable margin
// on both sides. Each step outward is about 30–40 syllables wide.
export const SPEED_BANDS: Band[] = [
  { score: 4, ranges: [[250, 330]] },
  { score: 3, ranges: [[220, 250], [330, 370]] },
  { score: 2, ranges: [[190, 220], [370, 410]] },
];

// A pause longer than this between two stretches of speech counts as a silence.
// Short breaths and sentence breaks are usually under 3 seconds.
export const SILENCE_SECONDS = 3;

// Number of silences. One long pause can be deliberate; several suggest losing the thread.
export const SILENCE_BANDS: Band[] = [
  { score: 4, ranges: [[0, 0]] },
  { score: 3, ranges: [[1, 1]] },
  { score: 2, ranges: [[2, 3]] },
];

// Average volume of the last quarter of speech divided by the first quarter.
// Only samples taken while speaking count, so pauses do not pull the average down.
// Dropping to below half of the opening volume is treated as clearly fading.
export const VOLUME_BANDS: Band[] = [
  { score: 4, ranges: [[0.8, Number.POSITIVE_INFINITY]] },
  { score: 3, ranges: [[0.65, 0.8]] },
  { score: 2, ranges: [[0.5, 0.65]] },
];

// Time from the first word to the last word, divided by the time limit.
// Finishing a little early is best; a small overrun is less bad than using only half the time.
export const TIME_BANDS: Band[] = [
  { score: 4, ranges: [[0.85, 1.0]] },
  { score: 3, ranges: [[0.7, 0.85], [1.0, 1.1]] },
  { score: 2, ranges: [[0.5, 0.7], [1.1, 1.25]] },
];
