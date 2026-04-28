import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminEquity } from "../../lib/api";
import type { EquityData } from "../../types";

/* -- status chip helper ------------------------------------------- */
function statusChip(status: string) {
  const map: Record<string, "success" | "warning" | "error" | "default"> = {
    Good: "success",
    good: "success",
    Fair: "warning",
    fair: "warning",
    Low: "error",
    low: "error",
    "under-represented": "error",
    "over-represented": "warning",
    representative: "success",
  };
  return <Chip label={status} size="small" color={map[status] ?? "default"} />;
}

/* -- column definitions ------------------------------------------- */
const AGE_COLS: GridColDef[] = [
  { field: "group", headerName: "Age Group", flex: 1 },
  {
    field: "portal_pct",
    headerName: "Portal %",
    width: 100,
    type: "number",
    valueFormatter: (v: number) => `${v?.toFixed(1)}%`,
  },
  {
    field: "census_pct",
    headerName: "Census %",
    width: 100,
    type: "number",
    valueFormatter: (v: number) => `${v?.toFixed(1)}%`,
  },
  {
    field: "status",
    headerName: "Status",
    width: 120,
    renderCell: (p) => statusChip(p.value),
  },
];

const LANG_COLS: GridColDef[] = [
  { field: "language", headerName: "Language", flex: 1 },
  { field: "sessions", headerName: "Sessions", width: 110, type: "number" },
  {
    field: "status",
    headerName: "Status",
    width: 120,
    renderCell: (p) => statusChip(p.value),
  },
];

const GEO_COLS: GridColDef[] = [
  { field: "zip", headerName: "Zip Code", width: 100 },
  {
    field: "usage_per_capita",
    headerName: "Usage / Capita",
    width: 130,
    type: "number",
    valueFormatter: (v: number) => v?.toFixed(3),
  },
  {
    field: "median_income",
    headerName: "Median Income",
    width: 130,
    type: "number",
    valueFormatter: (v: number) => `$${v?.toLocaleString()}`,
  },
  {
    field: "status",
    headerName: "Status",
    width: 120,
    renderCell: (p) => statusChip(p.value),
  },
];

export default function AdminEquity() {
  const [data, setData] = useState<EquityData | null>(null);
  /* extended response shape from the API */
  const [extended, setExtended] = useState<{
    overall_score?: number;
    previous_score?: number;
    race_comparison?: Array<{
      group: string;
      portal_pct: number;
      census_pct: number;
      gap: number;
    }>;
    age_comparison?: Array<{
      group: string;
      portal_pct: number;
      census_pct: number;
      status: string;
    }>;
    language_access?: Array<{
      language: string;
      sessions: number;
      status: string;
    }>;
    geographic_equity?: Array<{
      zip: string;
      usage_per_capita: number;
      median_income: number;
      status: string;
    }>;
    trend?: Array<{ week: string; score: number }>;
    disparity_alerts?: Array<{
      zip: string;
      council_district: string;
      label: string;
      match_rate: number;
      baseline: number;
      delta: number;
      severity: "critical" | "high" | "medium";
      note: string;
      sparkline: number[];
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminEquity();
        if (cancelled) return;
        setData(res as EquityData);
        setExtended(res as unknown as typeof extended);
      } catch (err) {
        console.error("Failed to load equity data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* -- derived values --------------------------------------------- */
  const overallScore = extended?.overall_score ?? 72;
  const previousScore = extended?.previous_score ?? 68;
  const scoreDelta = overallScore - previousScore;
  const positive = scoreDelta >= 0;

  /* -- race comparison chart data --------------------------------- */
  const raceData =
    extended?.race_comparison ??
    (data?.race_ethnicity ?? []).map((b) => ({
      group: b.label,
      portal_pct: b.portal_percentage,
      census_pct: b.census_percentage,
      gap: b.gap,
    }));
  const raceGroups = raceData.map((r) => r.group);
  const racePortal = raceData.map((r) => r.portal_pct);
  const raceCensus = raceData.map((r) => r.census_pct);

  /* -- age comparison --------------------------------------------- */
  const ageRows = (extended?.age_comparison ?? []).map((r, i) => ({
    id: i,
    ...r,
  }));

  /* -- language access -------------------------------------------- */
  const langRows = (
    extended?.language_access ??
    (data?.language_access ?? []).map((b) => ({
      language: b.label,
      sessions: 0,
      status: b.gap > 0 ? "Low" : "Good",
    }))
  ).map((r, i) => ({ id: i, ...r }));

  /* -- geographic equity ------------------------------------------ */
  const geoRows = (
    extended?.geographic_equity ??
    (data?.geographic ?? []).map((b) => ({
      zip: b.label,
      usage_per_capita: 0,
      median_income: 0,
      status: b.gap > 0 ? "Low" : "Good",
    }))
  ).map((r, i) => ({ id: i, ...r }));

  /* -- trend chart ------------------------------------------------ */
  const trendWeeks = (extended?.trend ?? []).map((t) => t.week);
  const trendScores = (extended?.trend ?? []).map((t) => t.score);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Equity Dashboard
      </Typography>

      {/* -- equity score card ---------------------------------------- */}
      <Card sx={{ mb: 3 }}>
        <CardContent
          sx={{ p: 3, display: "flex", alignItems: "center", gap: 4 }}
        >
          {loading ? (
            <Skeleton variant="circular" width={100} height={100} />
          ) : (
            <Box
              sx={{
                width: 100,
                height: 100,
                borderRadius: "50%",
                border: "6px solid",
                borderColor:
                  overallScore >= 70
                    ? "success.main"
                    : overallScore >= 50
                      ? "warning.main"
                      : "error.main",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Typography variant="h4" fontWeight={800}>
                {overallScore}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                /100
              </Typography>
            </Box>
          )}
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Overall Equity Score
            </Typography>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}
            >
              {positive ? (
                <TrendingUpIcon sx={{ fontSize: 18, color: "success.main" }} />
              ) : (
                <TrendingDownIcon sx={{ fontSize: 18, color: "error.main" }} />
              )}
              <Typography
                variant="body2"
                color={positive ? "success.main" : "error.main"}
                fontWeight={600}
              >
                {positive ? "+" : ""}
                {scoreDelta} points
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ ml: 0.5 }}
              >
                from previous period ({previousScore})
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              This score measures how equitably portal services reach Austin
              communities compared to census demographics.
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* -- disparity alerts ----------------------------------------- */}
      {(extended?.disparity_alerts ?? []).length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}
            >
              <WarningAmberIcon sx={{ color: "error.main" }} />
              <Typography variant="h6" fontWeight={600}>
                Disparity Alerts
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Zips where match-rate has dropped meaningfully below the citywide
              baseline ({(extended?.disparity_alerts ?? [])[0]?.baseline ?? 62}
              %). Each sparkline is the trailing 8-week trend.
            </Typography>
            <Grid container spacing={2}>
              {(extended?.disparity_alerts ?? []).map((a) => {
                const sevColor =
                  a.severity === "critical"
                    ? "error.main"
                    : a.severity === "high"
                      ? "warning.main"
                      : "info.main";
                return (
                  <Grid key={a.zip} size={{ xs: 12, md: 6 }}>
                    <Box
                      sx={{
                        display: "flex",
                        gap: 2,
                        p: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        borderLeft: "4px solid",
                        borderLeftColor: sevColor,
                        borderRadius: 1,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          <Typography variant="body1" fontWeight={700}>
                            ZIP {a.zip}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            District {a.council_district} · {a.label}
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 1,
                            mt: 0.5,
                          }}
                        >
                          <Typography
                            variant="h5"
                            fontWeight={700}
                            color={sevColor}
                          >
                            {a.match_rate.toFixed(0)}%
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            match rate ({a.delta > 0 ? "+" : ""}
                            {a.delta.toFixed(0)} vs baseline)
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.75 }}
                        >
                          {a.note}
                        </Typography>
                      </Box>
                      <Box sx={{ width: 120, flexShrink: 0 }}>
                        <SparkLineChart
                          data={a.sparkline}
                          height={56}
                          showHighlight
                          showTooltip
                          colors={["#D32F2F"]}
                        />
                      </Box>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* -- race comparison bar chart -------------------------------- */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Portal Users vs Census — Race/Ethnicity
          </Typography>
          {loading ? (
            <Skeleton variant="rectangular" height={300} />
          ) : (
            <BarChart
              height={300}
              series={[
                { data: racePortal, label: "Portal %", color: "#1976d2" },
                { data: raceCensus, label: "Census %", color: "#bdbdbd" },
              ]}
              xAxis={[{ data: raceGroups, scaleType: "band" }]}
            />
          )}
        </CardContent>
      </Card>

      {/* -- tables grid ---------------------------------------------- */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Age comparison */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Age Group Access
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={250} />
              ) : (
                <DataGrid
                  rows={ageRows}
                  columns={AGE_COLS}
                  pageSizeOptions={[10]}
                  disableRowSelectionOnClick
                  sx={{ border: "none" }}
                  autoHeight
                  hideFooter={ageRows.length <= 10}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Language access */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Language Access
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={250} />
              ) : (
                <DataGrid
                  rows={langRows}
                  columns={LANG_COLS}
                  pageSizeOptions={[10]}
                  disableRowSelectionOnClick
                  sx={{ border: "none" }}
                  autoHeight
                  hideFooter={langRows.length <= 10}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* -- geographic equity ---------------------------------------- */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Geographic Equity
          </Typography>
          {loading ? (
            <Skeleton variant="rectangular" height={300} />
          ) : (
            <DataGrid
              rows={geoRows}
              columns={GEO_COLS}
              pageSizeOptions={[10, 25]}
              disableRowSelectionOnClick
              sx={{ border: "none" }}
              autoHeight
            />
          )}
        </CardContent>
      </Card>

      {/* -- equity trend line chart ---------------------------------- */}
      {trendWeeks.length > 0 && (
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Equity Score Trend (12 Weeks)
            </Typography>
            <LineChart
              height={280}
              series={[
                { data: trendScores, label: "Equity Score", color: "#2e7d32" },
              ]}
              xAxis={[{ data: trendWeeks, scaleType: "band" }]}
            />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
