import { describe, expect, it } from "vitest";
import {
  countCell,
  csvCell,
  localRunTime,
  shareCell,
  shortDay,
  suppressInlineCounts,
  toCsv,
} from "./format";

describe("small-cell suppression", () => {
  it("shows counts from 1 to 10 as <11 and leaves 0 and 11+ alone", () => {
    expect(countCell(0)).toBe("0");
    expect(countCell(1)).toBe("<11");
    expect(countCell(10)).toBe("<11");
    expect(countCell(11)).toBe("11");
    expect(countCell(1247)).toBe("1,247");
  });

  it("hides shares derived from a suppressed count", () => {
    expect(shareCell(8, 1247)).toBe("—");
    expect(shareCell(324, 1247)).toBe("26.0%");
  });

  it("suppresses small counts inside free text", () => {
    expect(suppressInlineCounts("Phone disconnected (15)")).toBe(
      "Phone disconnected (15)",
    );
    expect(suppressInlineCounts("Halal stock-out reported (1)")).toBe(
      "Halal stock-out reported (<11)",
    );
  });
});

describe("dates", () => {
  it("keeps a zone-less run time at its scheduled local hour", () => {
    // The backend sends local wall times; they must not shift from UTC.
    expect(localRunTime("2026-11-01T07:00:00")).toBe("Nov 1, 7:00 AM");
    expect(localRunTime("")).toBe("");
  });

  it("formats chart day labels like Nov 5", () => {
    expect(shortDay("2026-11-05")).toBe("Nov 5");
  });
});

describe("CSV", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Say "hi", then go')).toBe('"Say ""hi"", then go"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
  });

  it("neutralises spreadsheet formulas but not negative numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-48.5")).toBe("-48.5");
    expect(csvCell(-2)).toBe("-2");
  });

  it("writes a header and one line per row with CRLF endings", () => {
    const csv = toCsv({
      headers: ["zip", "sessions"],
      rows: [
        ["78741", 178],
        ["78701", "<11"],
      ],
    });
    expect(csv).toBe("zip,sessions\r\n78741,178\r\n78701,<11\r\n");
  });
});
