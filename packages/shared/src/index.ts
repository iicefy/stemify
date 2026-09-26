/**
 * The contract between the API and the web app: the JSON shapes the API sends
 * and accepts, plus the limits both sides enforce. Types only change here, so
 * the two can't quietly drift apart.
 */
export * from "./song.js";
export * from "./settings.js";
export * from "./events.js";
export * from "./uploads.js";
