// Single source of truth for version display in the UI — read from package.json
// so components never hardcode the string.

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const APP_VERSION: string = require("../../package.json").version;
