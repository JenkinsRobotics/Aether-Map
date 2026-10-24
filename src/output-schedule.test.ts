import { describe, expect, it } from "vitest";
import { clockMinutes, clockText, describeSchedule, scheduleActive } from "./output-schedule";
import { emptyShow, newOutput, sceneLayers, showForOutput } from "./document";

/** Local time, which is what a projector's own clock reads. */
const at = (day: number, hours: number, minutes = 0) => {
  // 2026-09-20 is a Sunday, so day 0..6 maps onto the 20th..26th.
  const date = new Date(2026, 8, 20 + day, hours, minutes, 0, 0);
  expect(date.getDay()).toBe(day);
  return date;
};

describe("scheduleActive", () => {
  it("no schedule always runs; a zero-length one never does", () => {
    expect(scheduleActive(undefined, at(1, 12))).toBe(true);
    expect(scheduleActive({ fromMinutes: 600, toMinutes: 600 }, at(1, 10))).toBe(false);
  });

  it("runs inside a same-day window and not outside it", () => {
    const evening = { fromMinutes: 18 * 60, toMinutes: 23 * 60 };
    expect(scheduleActive(evening, at(1, 17, 59))).toBe(false);
    expect(scheduleActive(evening, at(1, 18, 0))).toBe(true);
    expect(scheduleActive(evening, at(1, 22, 59))).toBe(true);
    // The end is exclusive: 23:00 is when it stops, not a last minute on.
    expect(scheduleActive(evening, at(1, 23, 0))).toBe(false);
  });

  it("carries a window through midnight", () => {
    const late = { fromMinutes: 22 * 60, toMinutes: 2 * 60 };
    expect(scheduleActive(late, at(1, 21, 59))).toBe(false);
    expect(scheduleActive(late, at(1, 22, 0))).toBe(true);
    expect(scheduleActive(late, at(1, 23, 30))).toBe(true);
    expect(scheduleActive(late, at(2, 1, 30))).toBe(true);
    expect(scheduleActive(late, at(2, 2, 0))).toBe(false);
  });

  it("an overnight window belongs to the day it opened", () => {
    // Friday night only. Half past midnight is still Friday's show, and
    // Saturday night must not start one.
    const friday = { fromMinutes: 22 * 60, toMinutes: 2 * 60, days: [5] };
    expect(scheduleActive(friday, at(5, 23, 0))).toBe(true);
    expect(scheduleActive(friday, at(6, 0, 30))).toBe(true);
    expect(scheduleActive(friday, at(6, 23, 0))).toBe(false);
    expect(scheduleActive(friday, at(0, 0, 30))).toBe(false);
  });

  it("honours a weekday list for a same-day window", () => {
    const weekend = { fromMinutes: 10 * 60, toMinutes: 12 * 60, days: [0, 6] };
    expect(scheduleActive(weekend, at(0, 11))).toBe(true);
    expect(scheduleActive(weekend, at(6, 11))).toBe(true);
    expect(scheduleActive(weekend, at(3, 11))).toBe(false);
  });
});

describe("clock text", () => {
  it("round-trips a time field", () => {
    expect(clockText(0)).toBe("00:00");
    expect(clockText(18 * 60 + 5)).toBe("18:05");
    expect(clockMinutes("18:05")).toBe(1085);
    expect(clockMinutes("7:30")).toBe(450);
  });

  it("refuses what is not a time", () => {
    expect(clockMinutes("")).toBeNull();
    expect(clockMinutes("25:00")).toBeNull();
    expect(clockMinutes("12:60")).toBeNull();
    expect(clockMinutes("evening")).toBeNull();
  });
});

describe("describeSchedule", () => {
  it("says what a row has no room to show", () => {
    expect(describeSchedule(undefined)).toBe("Always on");
    expect(describeSchedule({ fromMinutes: 1080, toMinutes: 1380 })).toBe("Daily 18:00–23:00");
    expect(describeSchedule({ fromMinutes: 1080, toMinutes: 1380, days: [5, 6] }))
      .toBe("Fri Sat 18:00–23:00");
    expect(describeSchedule({ fromMinutes: 0, toMinutes: 60, days: [0, 1, 2, 3, 4, 5, 6] }))
      .toBe("Daily 00:00–01:00");
  });
});

describe("an output out of hours", () => {
  it("is dark, the same as one bound to nothing", () => {
    const show = emptyShow();
    const output = {
      ...newOutput("Porch", show.scenes[0].id),
      schedule: { fromMinutes: 18 * 60, toMinutes: 23 * 60 },
    };

    // In hours it renders its scene; out of hours there is nothing to draw,
    // which is the same answer the chokepoint gives an unbound output.
    expect(showForOutput(show, output, at(1, 20)).activeSceneId).toBe(show.scenes[0].id);
    expect(sceneLayers(showForOutput(show, output, at(1, 20)))).toHaveLength(1);
    expect(sceneLayers(showForOutput(show, output, at(1, 9)))).toEqual([]);
  });

  it("runs unrestricted when it has no schedule", () => {
    const show = emptyShow();
    expect(sceneLayers(showForOutput(show, show.outputs[0], at(1, 4)))).toHaveLength(1);
  });
});

describe("a schedule survives the show file", () => {
  it("round-trips, and a nonsense one reads as always on", async () => {
    const { parseShow } = await import("./show-file");
    const show = emptyShow();
    show.outputs = [{ ...show.outputs[0], schedule: { fromMinutes: 1320, toMinutes: 120, days: [5, 6] } }];

    const reopened = parseShow(JSON.stringify(show));
    expect(reopened.outputs[0].schedule).toEqual({ fromMinutes: 1320, toMinutes: 120, days: [5, 6] });

    // Garbage is refused rather than projected: no window means always on.
    const broken = JSON.parse(JSON.stringify(show));
    broken.outputs[0].schedule = { fromMinutes: 99 * 60, toMinutes: "evening", days: ["Friday"] };
    expect(parseShow(JSON.stringify(broken)).outputs[0].schedule).toBeUndefined();

    // All seven days is stored as absent, so a file carries one spelling of it.
    const everyDay = JSON.parse(JSON.stringify(show));
    everyDay.outputs[0].schedule = { fromMinutes: 600, toMinutes: 700, days: [0, 1, 2, 3, 4, 5, 6] };
    expect(parseShow(JSON.stringify(everyDay)).outputs[0].schedule).toEqual({ fromMinutes: 600, toMinutes: 700 });
  });
});
