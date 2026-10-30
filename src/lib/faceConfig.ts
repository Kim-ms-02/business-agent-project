import type { Band } from "./deliveryConfig";

// Face behavior score baselines for rehearsal mode (v0.3).
// These are design values chosen for a first version, not scientifically established ones.
// They are meant to be tuned after trying real rehearsals; change them only here.

// Bands are checked from the best score down, so a value on a shared edge gets the better score
// (for example, looking at the screen in exactly 50% of frames scores 3, not 2).
// Single-frame rules below use the strict comparisons written in the design table
// (exactly 15 degrees is not "looking at the screen").
export const MAX_FACE_ITEM_SCORE = 4;

// The face tracker measures about 10 times a second.
export const FACE_SAMPLE_SECONDS = 0.1;

// With the face found in less than half the frames, the numbers say more about the camera than the speaker.
export const MIN_MEASURED_RATIO = 0.5;

// Before the rehearsal the speaker looks at the screen for this long to set the reference pose.
// A laptop camera sits above the screen, so looking at the screen can read as a lowered head.
// Eye and mouth values are not 0 on a usual face either (one speaker read 0.3 eyes-down while looking
// at the screen), so they are measured as well and every face value is judged as a difference from it.
// If the face was found in less than this share of those frames, the speaker is asked to measure again.
export const BASELINE_SECONDS = 3;
export const BASELINE_MIN_RATIO = 0.5;

// Looking at the screen: head within these angles of the reference pose and eyes not lowered or turned aside
// more than these amounts beyond the reference pose. 15 degrees allows small natural turns.
// Eye values run 0–1; 0.3 more than usual is a clear look down at the script or to the side,
// while smaller changes are normal eye movement. Eyes lowered less than usual are not a problem.
export const LOOK_MAX_YAW = 15;
export const LOOK_MAX_PITCH = 15;
export const LOOK_MAX_EYE_DOWN = 0.3;
export const LOOK_MAX_EYE_AWAY = 0.3;

// Share of frames looking at the screen. Below 10% the speaker was almost always reading.
export const GAZE_LOWEST_SCORE = 0;
export const GAZE_BANDS: Band[] = [
  { score: 4, ranges: [[0.7, 1]] },
  { score: 3, ranges: [[0.5, 0.7]] },
  { score: 2, ranges: [[0.3, 0.5]] },
  { score: 1, ranges: [[0.1, 0.3]] },
];

// A 10-second stretch where the speaker looked at the screen less than this share is shown on the result.
// Same as the line between 3 and 2 points for gaze.
export const LOW_GAZE_WINDOW_SECONDS = 10;
export const LOW_GAZE_RATIO = 0.5;

// A frame counts as smiling when the mouth-smile value (0–1) is more than this above the reference pose.
// Smaller rises are often talking or a neutral mouth rather than a smile.
export const SMILE_MIN = 0.2;

// Share of frames smiling. A presentation does not need constant smiling, so 15% already scores 4.
export const EXPRESSION_LOWEST_SCORE = 1;
export const EXPRESSION_BANDS: Band[] = [
  { score: 4, ranges: [[0.15, 1]] },
  { score: 3, ranges: [[0.08, 0.15]] },
  { score: 2, ranges: [[0.03, 0.08]] },
];

// Head movement: the spread (standard deviation) of left-right head angle within each second,
// averaged over the rehearsal. A second with fewer frames than this cannot show a spread and is skipped.
export const HEAD_WINDOW_SECONDS = 1;
export const HEAD_MIN_FRAMES = 2;

// Both a frozen head and a head that keeps shaking lose points; 2–8 degrees is natural movement.
export const HEAD_LOWEST_SCORE = 1;
export const HEAD_BANDS: Band[] = [
  { score: 4, ranges: [[2, 8]] },
  { score: 3, ranges: [[1, 2], [8, 12]] },
  { score: 2, ranges: [[0, 1], [12, 18]] },
];

// Face width divided by frame width. Below 0.15 the speaker is far away or small in the frame;
// above 0.5 the face is too close and partly cut off. Both ends count as well framed.
export const FACE_WIDTH_MIN = 0.15;
export const FACE_WIDTH_MAX = 0.5;

export const FRAMING_LOWEST_SCORE = 1;
export const FRAMING_BANDS: Band[] = [
  { score: 4, ranges: [[0.9, 1]] },
  { score: 3, ranges: [[0.75, 0.9]] },
  { score: 2, ranges: [[0.5, 0.75]] },
];
