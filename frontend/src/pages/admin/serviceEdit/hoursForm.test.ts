import { describe, expect, it } from "vitest";
import { isOpenNow } from "@/lib/hours";
import type { ServiceLocation } from "@/types";
import { hoursToRows, rowError, rowsToHours, type HoursRow } from "./hoursForm";

const WIC = {
  monday: "8:00 AM – 5:00 PM",
  tuesday: "8:00 AM – 5:00 PM",
  wednesday: "8:00 AM – 5:00 PM",
  thursday: "8:00 AM – 5:00 PM",
  friday: "8:00 AM – 5:00 PM",
  saturday: "Closed",
  sunday: "Closed",
};

function location(hours: Record<string, string>): ServiceLocation {
  return {
    id: "loc-1",
    service_id: "svc-1",
    name: "Office",
    address: "1 Main St",
    city: "Austin",
    state: "TX",
    zip_code: "78701",
    latitude: 30.2,
    longitude: -97.7,
    phone: "",
    is_primary: true,
    hours,
  };
}

describe("hours editor rows", () => {
  it("has seven rows, Monday first", () => {
    expect(hoursToRows({}).map((r) => r.day)).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
  });

  it("round-trips pack hours exactly", () => {
    expect(rowsToHours(hoursToRows(WIC))).toEqual(WIC);
  });

  it("keeps days with no listed hours absent (unknown, not closed)", () => {
    expect(rowsToHours(hoursToRows({}))).toEqual({});
    expect(rowsToHours(hoursToRows({ monday: "9:00 AM – 1:00 PM" }))).toEqual({
      monday: "9:00 AM – 1:00 PM",
    });
  });

  it("produces a day-to-label object, never a string", () => {
    const rows = hoursToRows({});
    rows[0] = { ...rows[0], mode: "open", open: "09:30", close: "17:00" };
    const hours = rowsToHours(rows);
    expect(typeof hours).toBe("object");
    expect(hours).toEqual({ monday: "9:30 AM – 5:00 PM" });
  });

  it("writes labels the open-now parser reads", () => {
    const rows = hoursToRows({});
    rows[0] = { ...rows[0], mode: "open", open: "09:00", close: "17:00" };
    rows[1] = { ...rows[1], mode: "24h" };
    const loc = location(rowsToHours(rows));
    // 2026-11-16 is a Monday; 2026-11-17 a Tuesday.
    expect(isOpenNow(loc, new Date(2026, 10, 16, 10, 0))).toBe(true);
    expect(isOpenNow(loc, new Date(2026, 10, 16, 18, 0))).toBe(false);
    expect(isOpenNow(loc, new Date(2026, 10, 17, 3, 0))).toBe(true);
    expect(isOpenNow(loc, new Date(2026, 10, 18, 10, 0))).toBe(false);
  });

  it("reads noon and midnight and appointment-only labels", () => {
    const rows = hoursToRows({
      monday: "12:00 PM – 12:30 PM",
      tuesday: "By appointment",
      wednesday: "24 hours",
    });
    expect(rows[0]).toMatchObject({ mode: "open", open: "12:00", close: "12:30" });
    expect(rows[1].mode).toBe("appointment");
    expect(rows[2].mode).toBe("24h");
    expect(rowsToHours(rows)).toEqual({
      monday: "12:00 PM – 12:30 PM",
      tuesday: "By appointment",
      wednesday: "24 hours",
    });
  });

  it("keeps a label it cannot parse as text instead of dropping it", () => {
    const rows = hoursToRows({ friday: "First Friday only" });
    expect(rows[4]).toMatchObject({ mode: "text", text: "First Friday only" });
    expect(rowsToHours(rows)).toEqual({ friday: "First Friday only" });
  });

  it("flags equal or missing times; an overnight range is allowed", () => {
    const row: HoursRow = { day: "monday", mode: "open", open: "17:00", close: "17:00", text: "" };
    expect(rowError(row)).toMatch(/differ/);
    expect(rowError({ ...row, close: "18:00" })).toBeNull();
    // The open-now parsers read close < open as past midnight.
    expect(rowError({ ...row, open: "22:00", close: "06:00" })).toBeNull();
    expect(rowError({ ...row, open: "" })).toMatch(/opening/);
    expect(rowError({ ...row, mode: "text", text: " " })).toMatch(/text/);
  });
});
