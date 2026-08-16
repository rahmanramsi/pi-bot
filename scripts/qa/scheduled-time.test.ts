import { describe, expect, it } from "vitest";
import { scheduledDateFromWallClock } from "@/scheduled-time";

describe("scheduled wall-clock parsing", () => {
  it("uses the schedule timezone instead of the machine timezone", () => {
    expect(scheduledDateFromWallClock("2026-01-15T09:30", "America/New_York")?.toISOString()).toBe("2026-01-15T14:30:00.000Z");
  });

  it("rejects a wall-clock time removed by a daylight-saving transition", () => {
    expect(scheduledDateFromWallClock("2026-03-08T02:30", "America/New_York")).toBeNull();
  });
});
