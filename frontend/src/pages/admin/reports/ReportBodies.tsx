/** The body of each printable report, rendered from the admin endpoint data. */
import type { ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";

import { categoryLabel } from "../../../lib/categoryLabel";
import {
  countCell,
  gapCell,
  isSmallCell,
  pct,
  shareCell,
  shortDay,
  suppressInlineCounts,
  SUPPRESSED,
} from "./format";
import {
  completionRate,
  crisisWeeks,
  districtOfZip,
  districtRows,
  reportingPeriod,
  trendLabel,
  type ReportData,
} from "./reportData";
import {
  BulletList,
  ReportSection,
  ReportTable,
  StatRow,
} from "./ReportParts";

/** Charts are drawn once at print width; no animation so PDFs never catch a half-drawn bar. */
const CHART = { skipAnimation: true } as const;

/* -- methods notes ------------------------------------------------------ */

const SYNTHETIC_METHODS: ReactNode[] = [
  "Every figure in this report is synthetic demonstration data. No real residents are counted.",
  "In production these figures would come from anonymous aggregate counters that the intake increments. The service keeps no resident records and no per-session rows.",
  `Counts from 1 to 10 are suppressed and shown as "${SUPPRESSED}"; shares and rates built on them are not shown.`,
  "Matches are rules-engine matches between what a resident described and catalog services. They are not referrals, applications or enrolments.",
  "The service catalog has not been verified by staff. Confirm details with the provider.",
];

const EXTRA_METHODS: Record<string, ReactNode[]> = {
  "unmet-need-partner-gaps": [
    "An unmet need is a need a resident named that had no open matching service in the catalog, counted once per session.",
    "Referral and connection counts are totals the partners report; the portal does not follow residents to partners.",
  ],
  "language-access": [
    "Census share is a synthetic stand-in for the share of residents age 5+ who speak the language at home and speak English less than \"very well\" (ACS table C16001).",
    "Completion means the session reached the results page.",
  ],
  "equity-zip-district": [
    "Portal share is a district's or ZIP's share of all sessions. Census share is its share of the county population (synthetic).",
    "Match rate is the share of sessions with at least one match; the baseline is the citywide rate.",
  ],
  "crisis-summary": [
    "A crisis-resource display is any time the crisis panel was shown: a keyword interrupt or the assistant offering crisis lines. It is not a diagnosis, a call or a referral.",
    "Counts are citywide only. There is no ZIP breakdown and no per-session data.",
  ],
  "service-demand-zip": [
    "Top categories are the three categories residents in the ZIP asked about most.",
    "Heat-flagged sessions are sessions where the resident's ZIP is on the heat-risk list and the situation suggested heat vulnerability.",
  ],
};

const CATALOG_METHODS: ReactNode[] = [
  "This export is the live catalog residents see, built when you open or download it. It is not synthetic.",
  "No service has been verified by staff yet: verification_status is \"unverified\" until a staff member records a verification date and name.",
  "Inactive services are not included.",
];

export function methodsFor(id: string): ReactNode[] {
  if (id === "catalog-export") return CATALOG_METHODS;
  return [...SYNTHETIC_METHODS, ...(EXTRA_METHODS[id] ?? [])];
}

/* -- shared bits --------------------------------------------------------- */

function useChartColors() {
  const theme = useTheme();
  return {
    portal: theme.palette.primary.main,
    census: theme.palette.brand.noData,
    accent: theme.palette.brand.seriesAt(1),
  };
}

function LanguageMixTable({ data }: { data: ReportData }) {
  const total = data.overview.total_sessions;
  return (
    <ReportTable
      columns={[
        { label: "Language" },
        { label: "Sessions", numeric: true },
        { label: "Share", numeric: true },
      ]}
      rows={data.languages.map((l) => [
        l.language_name,
        countCell(l.session_count),
        shareCell(l.session_count, total),
      ])}
    />
  );
}

/* -- Monthly Service Navigation Summary ---------------------------------- */

function MonthlySummary({ data }: { data: ReportData }) {
  const colors = useChartColors();
  const { overview } = data;
  const period = reportingPeriod(overview);
  const days = overview.daily_sessions ?? [];
  const trend = overview.monthly_trend ?? [];
  const categories = (overview.top_categories ?? []) as Array<{
    name?: string;
    count?: number;
  }>;
  return (
    <>
      <StatRow
        items={[
          { label: "Sessions (30 days)", value: countCell(overview.total_sessions) },
          { label: "Completion rate", value: pct(100 * overview.completion_rate) },
          {
            label: "Crisis resources shown",
            value: countCell(overview.crisis_resources_shown ?? 0),
            detail: "count only",
          },
          {
            label: "Services in catalog",
            value: countCell(overview.total_services),
            detail: "live catalog",
          },
        ]}
      />
      {(overview.highlights ?? []).length > 0 && (
        <ReportSection title="What changed">
          <BulletList items={overview.highlights ?? []} />
        </ReportSection>
      )}
      <ReportSection
        title="Sessions per day"
        note={period ? `${shortDay(period.start)} to ${shortDay(period.end)}` : undefined}
      >
        <LineChart
          {...CHART}
          height={220}
          margin={{ top: 10, right: 16, bottom: 30, left: 44 }}
          series={[
            {
              data: days.map((d) => d.count),
              color: colors.portal,
              showMark: false,
              curve: "linear",
            },
          ]}
          xAxis={[
            {
              data: days.map((d) => d.date),
              scaleType: "point",
              valueFormatter: (v: string) => shortDay(v),
              tickLabelInterval: (_v: unknown, i: number) => i % 5 === 0,
            },
          ]}
        />
      </ReportSection>
      {trend.length > 0 && period && (
        <ReportSection title="Sessions and completion, last six periods">
          <ReportTable
            columns={[
              { label: "Period" },
              { label: "Sessions", numeric: true },
              { label: "Completed", numeric: true },
              { label: "Completion rate", numeric: true },
            ]}
            rows={trend.map((t) => [
              trendLabel(t, period.end),
              countCell(t.sessions),
              countCell(t.completed),
              t.sessions > 0 ? pct((100 * t.completed) / t.sessions) : "—",
            ])}
          />
        </ReportSection>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
          gap: 3,
        }}
      >
        <ReportSection title="Top need categories" note="Sessions naming each category.">
          <BarChart
            {...CHART}
            layout="horizontal"
            height={210}
            margin={{ top: 6, right: 12, bottom: 24, left: 120 }}
            series={[
              { data: categories.map((c) => c.count ?? 0), color: colors.portal },
            ]}
            yAxis={[{ data: categories.map((c) => c.name ?? ""), scaleType: "band" }]}
          />
        </ReportSection>
        <ReportSection title="Language mix">
          <LanguageMixTable data={data} />
        </ReportSection>
      </Box>
      <ReportSection title="Top matched services">
        <ReportTable
          columns={[
            { label: "#", numeric: true, width: "2.5em" },
            { label: "Service" },
            { label: "Category" },
            { label: "Matches", numeric: true },
          ]}
          rows={data.serviceDemand
            .slice(0, 10)
            .map((s, i) => [i + 1, s.service_name, s.category, countCell(s.match_count)])}
        />
      </ReportSection>
    </>
  );
}

/* -- Unmet Need and Partner Gap Report ------------------------------------ */

function UnmetNeedPartnerGaps({ data }: { data: ReportData }) {
  const colors = useChartColors();
  const total = data.overview.total_sessions;
  const needs = data.overview.unmet_needs ?? [];
  const charted = needs.filter((n) => !isSmallCell(n.sessions));
  const { totals, partners } = data.partnerGaps;
  return (
    <>
      <StatRow
        items={[
          {
            label: "Unmet-need mentions",
            value: countCell(needs.reduce((s, n) => s + n.sessions, 0)),
            detail: "summed across the needs below",
          },
          { label: "Partner referrals", value: countCell(totals.referrals) },
          { label: "Connections", value: countCell(totals.connections) },
          { label: "Connection rate", value: pct(100 * totals.connection_rate) },
        ]}
      />
      <ReportSection
        title="Top unmet needs"
        note="Needs residents named that had no open matching service in the catalog."
      >
        <BarChart
          {...CHART}
          layout="horizontal"
          height={40 + 30 * charted.length}
          margin={{ top: 6, right: 12, bottom: 24, left: 310 }}
          series={[{ data: charted.map((n) => n.sessions), color: colors.portal }]}
          yAxis={[{ data: charted.map((n) => n.need), scaleType: "band" }]}
        />
        <ReportTable
          columns={[
            { label: "Need" },
            { label: "Category" },
            { label: "Sessions", numeric: true },
            { label: "Share", numeric: true },
            { label: "Why it is unmet" },
          ]}
          rows={needs.map((n) => [
            n.need,
            categoryLabel(n.category),
            countCell(n.sessions),
            shareCell(n.sessions, total),
            n.note,
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Partner connection gaps"
        note="Referrals to each partner that did not lead to a connection, from partner-reported totals."
      >
        <ReportTable
          columns={[
            { label: "Partner", width: "24%" },
            { label: "Referrals", numeric: true },
            { label: "Connected", numeric: true },
            { label: "Gap", numeric: true },
            { label: "Rate", numeric: true },
            { label: "Most common reasons", width: "38%" },
          ]}
          rows={partners.map((p) => [
            <>
              <strong>{p.partner}</strong>
              <br />
              {categoryLabel(p.category)}
            </>,
            countCell(p.referrals),
            countCell(p.connections),
            countCell(p.gap),
            p.referrals > 0 ? pct((100 * p.connections) / p.referrals, 0) : "—",
            p.top_reasons.map(suppressInlineCounts).join("; "),
          ])}
        />
      </ReportSection>
    </>
  );
}

/* -- Language Access Report ------------------------------------------------ */

function LanguageAccess({ data }: { data: ReportData }) {
  const colors = useChartColors();
  const total = data.overview.total_sessions;
  const nonEnglish = data.languages.filter(
    (l) => l.census_lep_percentage !== null && l.census_lep_percentage !== undefined,
  );
  const shown = nonEnglish.filter((l) => !isSmallCell(l.session_count));
  const nonEnglishSessions = nonEnglish.reduce((s, l) => s + l.session_count, 0);
  return (
    <>
      <StatRow
        items={[
          { label: "Sessions (30 days)", value: countCell(total) },
          {
            label: "Sessions in a language other than English",
            value: countCell(nonEnglishSessions),
            detail: shareCell(nonEnglishSessions, total),
          },
          { label: "Languages used", value: String(data.languages.length) },
          { label: "Overall completion", value: pct(100 * data.overview.completion_rate) },
        ]}
      />
      <ReportSection
        title="Portal share vs census share with limited English"
        note={`Languages other than English with ${SUPPRESSED.replace("<", "")} or more sessions.`}
      >
        <BarChart
          {...CHART}
          height={240}
          margin={{ top: 40, right: 12, bottom: 30, left: 44 }}
          series={[
            {
              data: shown.map((l) => (100 * l.session_count) / total),
              label: "Share of portal sessions (%)",
              color: colors.portal,
            },
            {
              data: shown.map((l) => l.census_lep_percentage ?? 0),
              label: "Census share, limited English (%)",
              color: colors.census,
            },
          ]}
          xAxis={[{ data: shown.map((l) => l.language_name), scaleType: "band" }]}
        />
      </ReportSection>
      <ReportSection title="Sessions and completion by language">
        <ReportTable
          columns={[
            { label: "Language" },
            { label: "Sessions", numeric: true },
            { label: "Share of sessions", numeric: true },
            { label: "Census share, limited English", numeric: true },
            { label: "Completed", numeric: true },
            { label: "Completion rate", numeric: true },
          ]}
          rows={data.languages.map((l) => {
            const rate = completionRate(l);
            const hidden = isSmallCell(l.session_count) || isSmallCell(l.completed ?? 0);
            return [
              l.language_name,
              countCell(l.session_count),
              shareCell(l.session_count, total),
              l.census_lep_percentage === null || l.census_lep_percentage === undefined
                ? "n/a"
                : pct(l.census_lep_percentage),
              countCell(l.completed ?? 0),
              rate === null || hidden ? "—" : pct(100 * rate),
            ];
          })}
        />
      </ReportSection>
    </>
  );
}

/* -- Equity by ZIP and Council District ------------------------------------ */

function EquityZipDistrict({ data }: { data: ReportData }) {
  const colors = useChartColors();
  const total = data.overview.total_sessions;
  const districts = districtRows(data);
  const alerts = data.equity.disparity_alerts ?? [];
  const zips = [...data.demandMap].sort((a, b) => b.sessions - a.sessions);
  return (
    <>
      <ReportSection
        title="Portal share vs census share by council district"
        note="Gap is in percentage points; positive means more portal use than population share."
      >
        <BarChart
          {...CHART}
          height={230}
          margin={{ top: 40, right: 12, bottom: 30, left: 44 }}
          series={[
            { data: districts.map((d) => d.portal), label: "Portal %", color: colors.portal },
            { data: districts.map((d) => d.census ?? 0), label: "Census %", color: colors.census },
          ]}
          xAxis={[
            {
              data: districts.map((d) => (d.id === "rest" ? "Outside" : `District ${d.id}`)),
              scaleType: "band",
            },
          ]}
        />
        <ReportTable
          columns={[
            { label: "Area" },
            { label: "ZIPs" },
            { label: "Sessions", numeric: true },
            { label: "Portal %", numeric: true },
            { label: "Census %", numeric: true },
            { label: "Gap", numeric: true },
          ]}
          rows={districts.map((d) => [
            d.label,
            d.zips.join(", "),
            countCell(d.sessions),
            pct(d.portal),
            d.census === null ? "—" : pct(d.census),
            d.gap === null ? "—" : gapCell(d.gap),
          ])}
        />
      </ReportSection>
      {alerts.length > 0 && (
        <ReportSection
          title="Disparity alerts"
          note={`ZIPs where the match rate fell well below the citywide baseline (${alerts[0].baseline.toFixed(0)}%).`}
        >
          <ReportTable
            columns={[
              { label: "ZIP" },
              { label: "District" },
              { label: "Match rate", numeric: true },
              { label: "vs baseline", numeric: true },
              { label: "Severity" },
              { label: "Note", width: "42%" },
            ]}
            rows={alerts.map((a) => [
              <>
                <strong>{a.zip}</strong>
                <br />
                {a.label}
              </>,
              a.council_district,
              pct(a.match_rate, 0),
              gapCell(a.delta),
              a.severity,
              a.note,
            ])}
          />
        </ReportSection>
      )}
      <ReportSection title="ZIP detail">
        <ReportTable
          columns={[
            { label: "ZIP" },
            { label: "District" },
            { label: "Sessions", numeric: true },
            { label: "Portal %", numeric: true },
            { label: "Census %", numeric: true },
            { label: "Gap", numeric: true },
            { label: "Heat-flagged", numeric: true },
          ]}
          rows={zips.map((p) => {
            const portal = total > 0 ? (100 * p.sessions) / total : 0;
            return [
              p.zip,
              districtOfZip(data, p.zip) || "—",
              countCell(p.sessions),
              shareCell(p.sessions, total),
              p.census_percentage === undefined ? "—" : pct(p.census_percentage),
              p.census_percentage === undefined ? "—" : gapCell(portal - p.census_percentage),
              countCell(p.heat_vulnerable_sessions ?? 0),
            ];
          })}
        />
      </ReportSection>
    </>
  );
}

/* -- Crisis Resource Summary ------------------------------------------------ */

function CrisisSummary({ data }: { data: ReportData }) {
  const colors = useChartColors();
  const period = reportingPeriod(data.overview);
  const weeks = period ? crisisWeeks(data.overview, period.end) : [];
  return (
    <>
      <StatRow
        items={[
          {
            label: "Crisis resources shown (30 days)",
            value: countCell(data.overview.crisis_resources_shown ?? 0),
            detail: "citywide count",
          },
          { label: "Weeks shown", value: String(weeks.length) },
          {
            label: "Weeks suppressed",
            value: String(weeks.filter((w) => isSmallCell(w.count)).length),
            detail: `fewer than ${SUPPRESSED.replace("<", "")} displays`,
          },
        ]}
      />
      <ReportSection
        title={`Crisis-resource displays per week, last ${weeks.length} weeks, citywide`}
        note={`Suppressed weeks are left blank in the chart and shown as "${SUPPRESSED}" in the table.`}
      >
        <BarChart
          {...CHART}
          height={240}
          margin={{ top: 10, right: 12, bottom: 50, left: 44 }}
          series={[
            {
              data: weeks.map((w) => (isSmallCell(w.count) ? null : w.count)),
              color: colors.portal,
            },
          ]}
          xAxis={[
            {
              data: weeks.map((w) => w.label.split(" – ")[1]),
              scaleType: "band",
              label: "Week ending",
            },
          ]}
        />
        <ReportTable
          columns={[{ label: "Week" }, { label: "Displays", numeric: true }]}
          rows={weeks.map((w) => [w.label, countCell(w.count)])}
        />
      </ReportSection>
    </>
  );
}

/* -- Service Demand by ZIP ------------------------------------------------- */

function ServiceDemandZip({ data }: { data: ReportData }) {
  const total = data.overview.total_sessions;
  const zips = [...data.demandMap].sort((a, b) => b.sessions - a.sessions);
  return (
    <ReportSection title="Sessions and top categories by ZIP">
      <ReportTable
        columns={[
          { label: "#", numeric: true, width: "2.5em" },
          { label: "ZIP" },
          { label: "District" },
          { label: "Sessions", numeric: true },
          { label: "Share", numeric: true },
          { label: "Top categories" },
          { label: "Heat-flagged", numeric: true },
        ]}
        rows={zips.map((p, i) => [
          i + 1,
          p.zip,
          districtOfZip(data, p.zip) || "—",
          countCell(p.sessions),
          shareCell(p.sessions, total),
          p.top_categories.map(categoryLabel).join(", "),
          countCell(p.heat_vulnerable_sessions ?? 0),
        ])}
      />
    </ReportSection>
  );
}

/* -- Catalog export --------------------------------------------------------- */

function CatalogExport({ data }: { data: ReportData }) {
  const catalog = data.catalog;
  if (!catalog) return null;
  return (
    <>
      <StatRow
        items={[
          { label: "Services", value: String(catalog.services.length) },
          { label: "Verified by staff", value: "0", detail: "all unverified" },
          {
            label: "Categories used",
            value: String(new Set(catalog.services.flatMap((s) => s.categories)).size),
          },
        ]}
      />
      <ReportSection title="Services">
        <ReportTable
          columns={[
            { label: "Service" },
            { label: "Provider" },
            { label: "Categories" },
            { label: "Status" },
            { label: "Verification" },
          ]}
          rows={catalog.services.map((s) => [
            s.name,
            s.provider_name,
            s.categories.map((c) => catalog.categoryNames[c] ?? categoryLabel(c)).join(", "),
            s.status,
            "unverified",
          ])}
        />
      </ReportSection>
    </>
  );
}

const BODIES: Record<string, (props: { data: ReportData }) => ReactNode> = {
  "monthly-summary": MonthlySummary,
  "unmet-need-partner-gaps": UnmetNeedPartnerGaps,
  "language-access": LanguageAccess,
  "equity-zip-district": EquityZipDistrict,
  "crisis-summary": CrisisSummary,
  "service-demand-zip": ServiceDemandZip,
  "catalog-export": CatalogExport,
};

export function ReportBody({ id, data }: { id: string; data: ReportData }) {
  const Body = BODIES[id];
  if (!Body) {
    return (
      <Typography color="text.secondary">
        This report has no view yet.
      </Typography>
    );
  }
  return <Body data={data} />;
}
