import { describe, expect, it } from "vitest";
import { floatKaju, isLateCancel, planKaju } from "@/lib/kaju";
import { istDay, istHHMM, istMinuteOfDay, istTimeToday } from "@/lib/time";
import { nearestPlace } from "@/lib/places";

const now = new Date("2026-10-17T04:30:00Z"); // 10:00 IST

describe("kaju rules", () => {
  it("pays more for early plans", () => {
    expect(planKaju(180)).toBe(15);
    expect(planKaju(45)).toBe(10);
    expect(planKaju(5)).toBe(5);
  });
  it("pays floats per full 15 minutes, capped per day", () => {
    expect(floatKaju(14, 0)).toBe(0);
    expect(floatKaju(60, 0)).toBe(20);
    expect(floatKaju(600, 100)).toBe(20);
  });
  it("calls a cancel late inside 30 minutes or after departure", () => {
    expect(isLateCancel(new Date(now.getTime() + 31 * 60_000), now)).toBe(false);
    expect(isLateCancel(new Date(now.getTime() + 29 * 60_000), now)).toBe(true);
    expect(isLateCancel(new Date(now.getTime() - 5 * 60_000), now)).toBe(true);
  });
});

describe("IST time", () => {
  it("formats and parses in India time", () => {
    expect(istHHMM(now)).toBe("10:00am");
    expect(istDay(now)).toBe("2026-10-17");
    expect(istMinuteOfDay(now)).toBe(600);
    expect(istTimeToday("4pm", now)!.toISOString()).toBe("2026-10-17T10:30:00.000Z");
    expect(istTimeToday("16:15", now)!.toISOString()).toBe("2026-10-17T10:45:00.000Z");
    // 7am already passed by more than an hour → tomorrow
    expect(istDay(istTimeToday("7am", now)!)).toBe("2026-10-18");
    expect(istTimeToday("25:00", now)).toBeNull();
  });
});

describe("places", () => {
  it("finds the nearest spot", () => {
    expect(nearestPlace({ lat: 15.6508, lng: 73.7163 }).place.id).toBe("circle");
  });
});
