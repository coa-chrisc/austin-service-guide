import { describe, expect, it } from "vitest";
import type { Service } from "../../../types";
import { toCsv } from "./format";
import {
  crisisWeeks,
  districtRows,
  reportCsv,
  reportingPeriod,
  type ReportData,
} from "./reportData";

function fixture(): ReportData {
  return {
    overview: {
      total_sessions: 300,
      total_residents: 3,
      total_services: 2,
      avg_matches_per_session: 5,
      completion_rate: 0.7,
      crisis_detections: 30,
      crisis_resources_shown: 30,
      crisis_weekly: [12, 9, 14],
      top_categories: [],
      daily_sessions: [
        { date: "2026-10-16", count: 100 },
        { date: "2026-11-14", count: 200 },
      ],
      unmet_needs: [
        { need: "Rent deposit", category: "housing", sessions: 40, note: "Closed" },
        { need: "Halal pantry", category: "food", sessions: 7, note: "Small" },
      ],
      council_districts: [
        { id: "1", label: "District 1", zips: ["78702", "78721"], census_percentage: 10 },
      ],
    },
    languages: [
      {
        language_code: "es",
        language_name: "Spanish",
        session_count: 120,
        percentage: 40,
        completed: 90,
        census_lep_percentage: 11.8,
      },
      {
        language_code: "fr",
        language_name: "French",
        session_count: 8,
        percentage: 2.7,
        completed: 6,
        census_lep_percentage: 0.1,
      },
    ],
    equity: {
      race_ethnicity: [],
      income_levels: [],
      geographic: [],
      language_access: [],
      disparity_alerts: [],
    },
    demandMap: [
      { zip: "78702", lat: 0, lng: 0, sessions: 150, top_categories: ["food"], intensity: "high", census_percentage: 6, heat_vulnerable_sessions: 20 },
      { zip: "78721", lat: 0, lng: 0, sessions: 90, top_categories: ["housing", "legal"], intensity: "medium", census_percentage: 4, heat_vulnerable_sessions: 4 },
      { zip: "78701", lat: 0, lng: 0, sessions: 60, top_categories: [], intensity: "low", census_percentage: 1 },
    ],
    partnerGaps: {
      totals: { referrals: 20, connections: 12, gap: 8, connection_rate: 0.6 },
      partners: [
        {
          partner: "Pantry",
          category: "food",
          referrals: 20,
          connections: 12,
          gap: 8,
          primary_languages: ["ar"],
          top_reasons: ["Hours (12)", "Stock-out (1)"],
          trend: [],
        },
      ],
    },
    serviceDemand: [],
  };
}

describe("report CSVs", () => {
  it("builds one row per partner and unmet need, suppressing small cells", () => {
    const table = reportCsv("unmet-need-partner-gaps", fixture());
    expect(table?.rows).toHaveLength(3);
    const csv = toCsv(table!);
    expect(csv.split("\r\n")[0]).toBe(
      "record_type,name,category,sessions_or_referrals,connections,gap,connection_rate_pct,notes",
    );
    expect(csv).toContain("unmet_need,Halal pantry,Food,<11,");
    expect(csv).toContain("partner_gap,Pantry,Food,20,12,<11,60.0,Hours (12); Stock-out (<11)");
  });

  it("hides the share and completion rate of a suppressed language", () => {
    const rows = reportCsv("language-access", fixture())!.rows;
    expect(rows[0]).toEqual(["es", "Spanish", "120", "40.0", 11.8, "90", "75.0"]);
    expect(rows[1]).toEqual(["fr", "French", "<11", "—", 0.1, "<11", ""]);
  });

  it("ranks ZIPs by sessions with category names and suppressed heat counts", () => {
    const rows = reportCsv("service-demand-zip", fixture())!.rows;
    expect(rows.map((r) => r[1])).toEqual(["78702", "78721", "78701"]);
    expect(rows[1]).toEqual([2, "78721", "1", "90", "30.0", "Housing", "Legal", "", "<11"]);
  });

  it("puts districts, the remainder, then ZIPs in the equity CSV", () => {
    const rows = reportCsv("equity-zip-district", fixture())!.rows;
    expect(rows[0].slice(0, 7)).toEqual(["district", "District 1", "1", "240", "80.0", "10.0", "+70.0"]);
    expect(rows[1].slice(0, 7)).toEqual(["district", "Outside these districts", "", "60", "20.0", "90.0", "-70.0"]);
    expect(rows[2][0]).toBe("zip");
  });

  it("exports the catalog with category names and verification status", () => {
    const data = fixture();
    const service = {
      id: "svc-1",
      name: "Food, Inc",
      slug: "food-inc",
      provider_name: "=cmd",
      categories: ["food", "smoking_cessation"],
      status: "active",
      phone: "512-555-0100",
      website_url: "https://example.org",
      languages_offered: ["en", "es"],
      locations: [{ hours_verified: false }],
    } as unknown as Service;
    data.catalog = { services: [service], categoryNames: { food: "Food Assistance" } };
    const csv = toCsv(reportCsv("catalog-export", data)!);
    expect(csv).toContain(
      'svc-1,"Food, Inc",food-inc,\'=cmd,Food Assistance; Smoking Cessation,active,unverified,no,512-555-0100,https://example.org,en; es',
    );
  });

  it("has no CSV for PDF-only reports", () => {
    expect(reportCsv("monthly-summary", fixture())).toBeNull();
    expect(reportCsv("crisis-summary", fixture())).toBeNull();
  });
});

describe("derived figures", () => {
  it("reads the reporting window from the daily series", () => {
    expect(reportingPeriod(fixture().overview)).toEqual({
      start: "2026-10-16",
      end: "2026-11-14",
    });
  });

  it("labels crisis weeks so the last one ends on the period end", () => {
    expect(crisisWeeks(fixture().overview, "2026-11-14")).toEqual([
      { label: "Oct 25 – Oct 31", count: 12 },
      { label: "Nov 1 – Nov 7", count: 9 },
      { label: "Nov 8 – Nov 14", count: 14 },
    ]);
  });

  it("computes district portal share from the demand map", () => {
    const [district, rest] = districtRows(fixture());
    expect(district.sessions).toBe(240);
    expect(district.portal).toBeCloseTo(80);
    expect(rest.census).toBeCloseTo(90);
  });
});
