/** @type {readonly ["2x3", "3x2", "9x16", "16x9"]} */
export const AVATAR_ASPECT_RATIOS = Object.freeze(["2x3", "3x2", "9x16", "16x9"]);

/** @type {(typeof AVATAR_ASPECT_RATIOS)[number]} */
export const AVATAR_ASPECT_RATIO_DEFAULT = "16x9";

export const AVATAR_ASPECT_RATIO_LOOKUP = new Set(AVATAR_ASPECT_RATIOS);
