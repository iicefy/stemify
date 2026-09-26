const STEP_CANDIDATES = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function pickTickStep(rangeDuration: number): number {
  for (const step of STEP_CANDIDATES) {
    if (rangeDuration / step <= 10) return step;
  }
  return STEP_CANDIDATES[STEP_CANDIDATES.length - 1];
}

/**
 * Nice tick marks within an arbitrary visible window (e.g. a zoomed-in
 * and panned view) - ticks land on step boundaries relative to t=0, not
 * the window's own start, so they don't jump around as you pan.
 */
export function tickTimesInRange(rangeStart: number, rangeDuration: number): number[] {
  if (rangeDuration <= 0) return [];
  const step = pickTickStep(rangeDuration);
  const rangeEnd = rangeStart + rangeDuration;
  const firstTick = Math.ceil(rangeStart / step) * step;
  const ticks: number[] = [];
  for (let t = firstTick; t <= rangeEnd; t += step) ticks.push(t);
  return ticks;
}
