/**
 * Data behind the admin reports: one bundle loaded from the admin endpoints,
 * the report catalog types, and the CSV table for each report.
 */
import {
  getAdminAnalytics,
  getAdminDemandMap,
  getAdminEquity,
  getAdminLanguages,
  getAdminPartnerGaps,
  getAdminServiceDemand,
  getCategories,
  getServices,
  type AdminReport,
  type DemandMapPoint,
  type PartnerGapsResponse,
} from "../../../lib/api";
import { categoryLabel } from "../../../lib/categoryLabel";
import type {
  AnalyticsOverview,
  EquityData,
  LanguageUsageItem,
  Service,
  ServiceDemandItem,
} from "../../../types";
import {
  addDays,
  countCell,
  gapCell,
  parseLocal,
  shareCell,
  shortDay,
  suppressInlineCounts,
  type CsvTable,
} from "./format";

/* -- payload shapes (fields the admin endpoints add to the shared types) -- */

export interface UnmetNeed {
  need: string;
  category: string;
  sessions: number;
  note: string;
}

export interface TrendPeriod {
  months_ago: number;
  sessions: number;
  completed: number;
}

export interface Overview extends AnalyticsOverview {
  crisis_resources_shown?: number;
  crisis_weekly?: number[];
  monthly_trend?: TrendPeriod[];
  highlights?: string[];
  unmet_needs?: UnmetNeed[];
  council_districts: Array<{
    id: string;
    label: string;
    zips: string[];
    census_percentage?: number;
  }>;
}

export interface LanguageRow extends LanguageUsageItem {
  completed?: number;
  census_lep_percentage?: number | null;
}

export interface DisparityAlert {
  zip: string;
  council_district: string;
  label: string;
  match_rate: number;
  baseline: number;
  delta: number;
  severity: "critical" | "high" | "medium";
  note: string;
  sparkline: number[];
}

export interface Equity extends EquityData {
  disparity_alerts?: DisparityAlert[];
}

export interface DemandPoint extends DemandMapPoint {
  census_percentage?: number;
}

/** A report in the catalog (GET /admin/reports). */
export interface ReportDef extends Omit<AdminReport, "row_count"> {
  audience?: string;
  cadence?: string;
}

export function hasPdf(report: Pick<ReportDef, "format">): boolean {
  return report.format.includes("PDF");
}

export function hasCsv(report: Pick<ReportDef, "format">): boolean {
  return report.format.includes("CSV");
}

export interface ReportData {
  overview: Overview;
  languages: LanguageRow[];
  equity: Equity;
  demandMap: DemandPoint[];
  partnerGaps: PartnerGapsResponse;
  serviceDemand: ServiceDemandItem[];
  /** Only loaded for the catalog export. */
  catalog?: { services: Service[]; categoryNames: Record<string, string> };
}

/** Every service residents can see, across all pages of the catalog API. */
async function loadCatalog(): Promise<NonNullable<ReportData["catalog"]>> {
  const [first, categories] = await Promise.all([
    getServices({ page: 1, page_size: 100 }),
    getCategories(),
  ]);
  const services = [...first.items];
  for (let page = 2; page <= first.total_pages; page++) {
    services.push(...(await getServices({ page, page_size: 100 })).items);
  }
  const categoryNames = Object.fromEntries(
    categories.map((c) => [c.slug, c.name]),
  );
  return { services, categoryNames };
}

export async function loadReportData(
  withCatalog: boolean,
): Promise<ReportData> {
  const [
    overview,
    languages,
    equity,
    demandMap,
    partnerGaps,
    serviceDemand,
    catalog,
  ] = await Promise.all([
    getAdminAnalytics(),
    getAdminLanguages(),
    getAdminEquity(),
    getAdminDemandMap(),
    getAdminPartnerGaps(),
    getAdminServiceDemand(),
    withCatalog ? loadCatalog() : Promise.resolve(undefined),
  ]);
  return {
    overview: overview as Overview,
    languages: languages as LanguageRow[],
    equity: equity as Equity,
    demandMap: demandMap as DemandPoint[],
    partnerGaps,
    serviceDemand,
    catalog,
  };
}

/* -- derived figures -------------------------------------------------- */

/** First and last day of the 30-day reporting window (from the daily series). */
export function reportingPeriod(
  overview: Overview,
): { start: string; end: string } | null {
  const days = overview.daily_sessions ?? [];
  if (days.length === 0) return null;
  return { start: days[0].date, end: days[days.length - 1].date };
}

export interface WeekCount {
  /** "Nov 8 – Nov 14" */
  label: string;
  count: number;
}

/** crisis_weekly as labelled weeks; the last week ends on `periodEnd`. */
export function crisisWeeks(overview: Overview, periodEnd: string): WeekCount[] {
  const weekly = overview.crisis_weekly ?? [];
  const end = parseLocal(periodEnd);
  if (!end) return [];
  return weekly.map((count, i) => {
    const weekEnd = addDays(end, -7 * (weekly.length - 1 - i));
    return {
      label: `${shortDay(addDays(weekEnd, -6))} – ${shortDay(weekEnd)}`,
      count,
    };
  });
}

/** Label for a trend period: month name, or "Last 30 days" for the current one. */
export function trendLabel(period: TrendPeriod, periodEnd: string): string {
  if (period.months_ago === 0) return "Last 30 days";
  const end = parseLocal(periodEnd) ?? new Date();
  const d = new Date(end.getFullYear(), end.getMonth() - period.months_ago, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export interface DistrictRow {
  id: string;
  label: string;
  zips: string[];
  sessions: number;
  portal: number;
  census: number | null;
  gap: number | null;
}

/** Council districts with portal share from the demand map; then "rest". */
export function districtRows(data: ReportData): DistrictRow[] {
  const total = data.overview.total_sessions;
  const byZip = new Map(data.demandMap.map((p) => [p.zip, p.sessions]));
  const rows: DistrictRow[] = data.overview.council_districts.map((d) => {
    const sessions = d.zips.reduce((s, z) => s + (byZip.get(z) ?? 0), 0);
    const portal = total > 0 ? (100 * sessions) / total : 0;
    const census = d.census_percentage ?? null;
    return {
      id: d.id,
      label: d.label,
      zips: d.zips,
      sessions,
      portal,
      census,
      gap: census === null ? null : portal - census,
    };
  });
  const inDistrict = new Set(rows.flatMap((r) => r.zips));
  const rest = data.demandMap.filter((p) => !inDistrict.has(p.zip));
  if (rest.length > 0) {
    const sessions = rest.reduce((s, p) => s + p.sessions, 0);
    const portal = total > 0 ? (100 * sessions) / total : 0;
    const known = rows.every((r) => r.census !== null);
    const census = known
      ? 100 - rows.reduce((s, r) => s + (r.census ?? 0), 0)
      : null;
    rows.push({
      id: "rest",
      label: "Outside these districts",
      zips: rest.map((p) => p.zip),
      sessions,
      portal,
      census,
      gap: census === null ? null : portal - census,
    });
  }
  return rows;
}

export function districtOfZip(data: ReportData, zip: string): string {
  return data.overview.council_districts.find((d) => d.zips.includes(zip))?.id ?? "";
}

export function completionRate(row: LanguageRow): number | null {
  if (row.completed === undefined || row.session_count <= 0) return null;
  return row.completed / row.session_count;
}

/* -- CSV tables --------------------------------------------------------- */

/** CSV table for a report, or null when it has no CSV output. */
export function reportCsv(id: string, data: ReportData): CsvTable | null {
  const total = data.overview.total_sessions;
  switch (id) {
    case "unmet-need-partner-gaps":
      return {
        headers: [
          "record_type",
          "name",
          "category",
          "sessions_or_referrals",
          "connections",
          "gap",
          "connection_rate_pct",
          "notes",
        ],
        rows: [
          ...(data.overview.unmet_needs ?? []).map((n) => [
            "unmet_need",
            n.need,
            categoryLabel(n.category),
            countCell(n.sessions),
            "",
            "",
            "",
            n.note,
          ]),
          ...data.partnerGaps.partners.map((p) => [
            "partner_gap",
            p.partner,
            categoryLabel(p.category),
            countCell(p.referrals),
            countCell(p.connections),
            countCell(p.gap),
            p.referrals > 0 ? ((100 * p.connections) / p.referrals).toFixed(1) : "",
            p.top_reasons.map(suppressInlineCounts).join("; "),
          ]),
        ],
      };
    case "language-access":
      return {
        headers: [
          "language_code",
          "language",
          "sessions",
          "share_of_sessions_pct",
          "census_lep_share_pct",
          "completed",
          "completion_rate_pct",
        ],
        rows: data.languages.map((l) => {
          const rate = completionRate(l);
          const suppressed =
            countCell(l.session_count).startsWith("<") ||
            countCell(l.completed ?? 0).startsWith("<");
          return [
            l.language_code,
            l.language_name,
            countCell(l.session_count),
            shareCell(l.session_count, total).replace("%", ""),
            l.census_lep_percentage ?? "",
            countCell(l.completed ?? 0),
            rate === null || suppressed ? "" : (100 * rate).toFixed(1),
          ];
        }),
      };
    case "equity-zip-district": {
      const districts = districtRows(data);
      return {
        headers: [
          "record_type",
          "area",
          "council_district",
          "sessions",
          "portal_share_pct",
          "census_share_pct",
          "gap_pct_points",
          "notes",
        ],
        rows: [
          ...districts.map((d) => [
            "district",
            d.label,
            d.id === "rest" ? "" : d.id,
            countCell(d.sessions),
            d.portal.toFixed(1),
            d.census?.toFixed(1) ?? "",
            d.gap === null ? "" : gapCell(d.gap),
            "",
          ]),
          ...[...data.demandMap]
            .sort((a, b) => b.sessions - a.sessions)
            .map((p) => {
              const portal = total > 0 ? (100 * p.sessions) / total : 0;
              return [
                "zip",
                p.zip,
                districtOfZip(data, p.zip),
                countCell(p.sessions),
                shareCell(p.sessions, total).replace("%", ""),
                p.census_percentage?.toFixed(1) ?? "",
                p.census_percentage === undefined
                  ? ""
                  : gapCell(portal - p.census_percentage),
                "",
              ];
            }),
          ...(data.equity.disparity_alerts ?? []).map((a) => [
            "disparity_alert",
            `${a.zip} ${a.label}`,
            a.council_district,
            "",
            "",
            "",
            "",
            `${a.severity}: match rate ${a.match_rate.toFixed(0)}% vs ${a.baseline.toFixed(0)}% baseline (${gapCell(a.delta)} points). ${a.note}`,
          ]),
          ...data.equity.race_ethnicity.map((b) => [
            "race_ethnicity",
            b.label,
            "",
            "",
            b.portal_percentage.toFixed(1),
            b.census_percentage.toFixed(1),
            gapCell(b.gap),
            "",
          ]),
        ],
      };
    }
    case "service-demand-zip":
      return {
        headers: [
          "rank",
          "zip",
          "council_district",
          "sessions",
          "share_of_sessions_pct",
          "top_category_1",
          "top_category_2",
          "top_category_3",
          "heat_flagged_sessions",
        ],
        rows: [...data.demandMap]
          .sort((a, b) => b.sessions - a.sessions)
          .map((p, i) => [
            i + 1,
            p.zip,
            districtOfZip(data, p.zip),
            countCell(p.sessions),
            shareCell(p.sessions, total).replace("%", ""),
            ...[0, 1, 2].map((k) =>
              p.top_categories[k] ? categoryLabel(p.top_categories[k]) : "",
            ),
            countCell(p.heat_vulnerable_sessions ?? 0),
          ]),
      };
    case "catalog-export": {
      const catalog = data.catalog;
      if (!catalog) return null;
      return {
        headers: [
          "id",
          "name",
          "slug",
          "provider",
          "categories",
          "status",
          "verification_status",
          "hours_verified",
          "phone",
          "website",
          "languages_offered",
        ],
        rows: catalog.services.map((s) => {
          const record = s as Service & {
            last_verified_date?: string;
            verified_by?: string;
          };
          const verified = Boolean(record.last_verified_date && record.verified_by);
          const locations = s.locations ?? [];
          return [
            s.id,
            s.name,
            s.slug,
            s.provider_name,
            s.categories
              .map((c) => catalog.categoryNames[c] ?? categoryLabel(c))
              .join("; "),
            s.status,
            verified ? `verified ${record.last_verified_date}` : "unverified",
            locations.length > 0 && locations.every((l) => l.hours_verified)
              ? "yes"
              : "no",
            s.phone ?? "",
            s.website_url ?? "",
            (s.languages_offered ?? []).join("; "),
          ];
        }),
      };
    }
    default:
      return null;
  }
}
