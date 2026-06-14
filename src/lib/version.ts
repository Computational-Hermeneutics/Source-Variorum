// Single source of truth for version display in the UI.
//
// David's scheme is a four-segment version 0.5.1.x where only `x` increments.
// package.json's `version` must be valid (three-segment) semver, so it holds the
// frozen base "0.5.1" and we append the patch counter `x` here.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BASE: string = require("../../package.json").version; // "0.5.1"

/** The patch counter `x` in 0.5.1.x — bump this on each release. */
export const PATCH_X = 2;

export const APP_VERSION = `${BASE}.${PATCH_X}`;
