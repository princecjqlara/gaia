import {
  alignToHourOnOrAfter,
  getFibonacciDelayHours,
  shouldAlignToBestTime,
} from "../utils/followUpCadence";

describe("followUpCadence", () => {
  test("returns fibonacci delays in hours", () => {
    expect(getFibonacciDelayHours(1)).toBe(1);
    expect(getFibonacciDelayHours(2)).toBe(2);
    expect(getFibonacciDelayHours(5)).toBe(8);
  });

  test("applies aggressiveness shift by moving fibonacci index earlier", () => {
    expect(getFibonacciDelayHours(3, 1)).toBe(2);
  });

  test("aligns to same-day hour when target hour is ahead", () => {
    const base = new Date(2026, 1, 20, 8, 30, 0, 0);
    const aligned = alignToHourOnOrAfter(base, 10);

    expect(aligned.getHours()).toBe(10);
    expect(aligned.getDate()).toBe(base.getDate());
  });

  test("aligns to next day when hour already passed", () => {
    const base = new Date(2026, 1, 20, 18, 30, 0, 0);
    const aligned = alignToHourOnOrAfter(base, 10);

    expect(aligned.getHours()).toBe(10);
    expect(aligned.getTime()).toBeGreaterThan(base.getTime());
    expect(aligned.getDate()).toBe(base.getDate() + 1);
  });

  test("uses best-time alignment for daily-plus delays", () => {
    expect(shouldAlignToBestTime(8)).toBe(false);
    expect(shouldAlignToBestTime(24)).toBe(true);
  });
});
