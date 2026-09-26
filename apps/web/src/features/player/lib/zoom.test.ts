import { describe, expect, it } from "vitest";
import { clampViewStart, viewDurationAt, zoomView, ZOOM_LEVELS } from "./zoom";

const DURATION = 120;
const zoomIndexOf = (zoom: number) => ZOOM_LEVELS.indexOf(zoom);

describe("viewDurationAt", () => {
  it("divides the song by the zoom level", () => {
    expect(viewDurationAt(DURATION, 0)).toBe(120);
    expect(viewDurationAt(DURATION, zoomIndexOf(4))).toBe(30);
  });

  it("is 0 before the duration is known", () => {
    expect(viewDurationAt(0, 3)).toBe(0);
  });
});

describe("clampViewStart", () => {
  it("keeps the window inside the song", () => {
    const at4x = zoomIndexOf(4);
    expect(clampViewStart(-5, DURATION, at4x)).toBe(0);
    expect(clampViewStart(100, DURATION, at4x)).toBe(90);
    expect(clampViewStart(50, DURATION, at4x)).toBe(50);
  });
});

describe("zoomView", () => {
  it("holds the anchor point steady", () => {
    const view = { zoomIndex: zoomIndexOf(2), viewStart: 30 }; // shows 30..90
    const next = zoomView(view, 2, 0.5, DURATION); // 2x -> 4x, center stays at 60
    expect(next.zoomIndex).toBe(zoomIndexOf(4));
    expect(next.viewStart + viewDurationAt(DURATION, next.zoomIndex) / 2).toBe(60);
  });

  it("stops at the first and last level", () => {
    expect(zoomView({ zoomIndex: 0, viewStart: 0 }, -3, 0.5, DURATION).zoomIndex).toBe(0);
    expect(zoomView({ zoomIndex: 0, viewStart: 0 }, 99, 0.5, DURATION).zoomIndex).toBe(ZOOM_LEVELS.length - 1);
  });

  it("clamps when zooming out near the end", () => {
    const view = { zoomIndex: zoomIndexOf(4), viewStart: 90 };
    expect(zoomView(view, -2, 1, DURATION)).toEqual({ zoomIndex: zoomIndexOf(2), viewStart: 60 });
  });
});
