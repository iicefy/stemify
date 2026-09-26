import { describe, expect, it } from "vitest";
import { pickTickStep, tickTimesInRange } from "./timelineTicks";

describe("timeline ticks", () => {
  it("picks a step giving at most ~10 ticks", () => {
    expect(pickTickStep(8)).toBe(1);
    expect(pickTickStep(95)).toBe(10);
    expect(pickTickStep(240)).toBe(30);
  });

  it("aligns ticks to the step from t=0, not the window start", () => {
    expect(tickTimesInRange(12, 20)).toEqual([12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]);
    expect(tickTimesInRange(13, 20)).toEqual([14, 16, 18, 20, 22, 24, 26, 28, 30, 32]);
  });

  it("is empty for an empty window", () => {
    expect(tickTimesInRange(0, 0)).toEqual([]);
  });
});
