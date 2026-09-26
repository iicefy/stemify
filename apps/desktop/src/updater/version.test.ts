import { describe, expect, it } from "vitest";
import { isNewer } from "./version.js";

describe("isNewer", () => {
  it("compares numerically, part by part", () => {
    expect(isNewer("0.6.1", "0.6.0")).toBe(true);
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("1.0.0", "0.99.99")).toBe(true);
  });

  it("is false for the same or an older version", () => {
    expect(isNewer("0.6.0", "0.6.0")).toBe(false);
    expect(isNewer("0.5.9", "0.6.0")).toBe(false);
  });

  it("treats missing parts as 0", () => {
    expect(isNewer("1.1", "1.0.9")).toBe(true);
    expect(isNewer("1", "1.0.0")).toBe(false);
  });
});
