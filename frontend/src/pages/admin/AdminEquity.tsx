import { useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useBrandConfig } from "@/hooks/useBrandConfig";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { BarChart } from "@mui/x-charts/BarChart";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminEquity } from "../../lib/api";
import type { EquityBucket } from "../../types";
import { gapCell, pct } from "./reports/format";
import type { Equity } from "./reports/reportData";

/** Portal %, Census % and Gap columns after a first label column. */
function shareColumns(label: string, labelMinWidth: number): GridColDef[] {
  return [
    { field: "label", headerName: label, flex: 1, minWidth: labelMinWidth },
    {
      field: "portal_percentage",
      headerName: "Portal %",
      width: 90,
      type: "number",
      valueFormatter: (v: number) => pct(v),
    },
    {
      field: "census_percentage",
      headerName: "Census %",
      width: 90,
      type: "number",
      valueFormatter: (v: number) => pct(v),
    },
    {
      field: "gap",
      headerName: "Gap (pts)",
      width: 90,
      type: "number",
      valueFormatter: (v: number) => gapCell(v),
    },
  ];
}

const LANG_COLS = shareColumns("Language", 140);
const GEO_COLS = shareColumns("Geographic area", 220);

function withIds(rows: EquityBucket[]) {
  return rows.map((r) => ({ id: r.label, ...r }));
}

function ComparisonChart({ rows }: { rows: EquityBucket[] }) {
  const theme = useTheme();
  return (
    <BarChart
      layout="horizontal"
      height={Math.max(260, rows.length * 56 + 80)}
      margin={{ left: 170, right: 16 }}
      series={[
        {
          data: rows.map((r) => r.portal_percentage),
          label: "Portal %",
          color: theme.palette.primary.main,
          valueFormatter: (v) => (v === null ? "" : pct(v)),
        },
        {
          data: rows.map((r) => r.census_percentage),
          label: "Census %",
          color: theme.palette.brand.noData,
          valueFormatter: (v) => (v === null ? "" : pct(v)),
        },
      ]}
      yAxis={[{ data: rows.map((r) => r.label), scaleType: "band" }]}
    />
  );
}

function SectionCard({
  title,
  note,
  loading,
  children,
}: {
  title: string;
  note?: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={600}>
          {title}
        </Typography>
        {note && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {note}
          </Typography>
        )}
        <Box sx={{ mt: 2 }}>
          {loading ? <Skeleton variant="rectangular" height={260} /> : children}
        </Box>
      </CardContent>
    </Card>
  );
}

export default function AdminEquity() {
  const theme = useTheme();
  const { region } = useBrandConfig();
  const [data, setData] = useState<Equity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminEquity();
        if (!cancelled) setData(res as Equity);
      } catch (err) {
        console.error("Failed to load equity data", err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const alerts = data?.disparity_alerts ?? [];

  return (
    <Box>
      <Typography variant="h5" fontWeight={700}>
        Equity Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3, maxWidth: 820 }}>
        How portal use across {region.cityName} compares with census
        population shares, by group and by area. Gap is portal share minus
        census share, in percentage points. All figures are synthetic sample
        data; a live deployment would draw them from anonymous aggregate counts.
      </Typography>

      {loadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Equity data could not be loaded. Refresh the page to try again.
        </Alert>
      )}

      {/* -- disparity alerts ----------------------------------------- */}
      {alerts.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <WarningAmberIcon sx={{ color: "error.main" }} />
              <Typography variant="h6" fontWeight={600}>
                Disparity Alerts
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              ZIPs where the match rate has fallen well below the citywide
              baseline ({alerts[0].baseline.toFixed(0)}%). Each sparkline is
              the trailing 8-week match rate.
            </Typography>
            <Grid container spacing={2}>
              {alerts.map((a) => {
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
                        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
                          <Typography variant="body1" fontWeight={700}>
                            ZIP {a.zip}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            District {a.council_district} · {a.label}
                          </Typography>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mt: 0.5 }}>
                          <Typography variant="h5" fontWeight={700} color={sevColor}>
                            {a.match_rate.toFixed(0)}%
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            match rate ({gapCell(a.delta)} pts vs baseline)
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                          {a.note}
                        </Typography>
                      </Box>
                      <Box sx={{ width: 120, flexShrink: 0 }}>
                        <SparkLineChart
                          data={a.sparkline}
                          height={56}
                          showHighlight
                          showTooltip
                          colors={[theme.palette.brand.dataScale[0]]}
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

      {/* -- group comparisons ---------------------------------------- */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard
            title="Race and ethnicity: portal vs census"
            note="Portal shares would come from optional, anonymous self-report."
            loading={loading}
          >
            <ComparisonChart rows={data?.race_ethnicity ?? []} />
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard
            title="Income level: portal vs census"
            note="Income relative to the federal poverty level (FPL)."
            loading={loading}
          >
            <ComparisonChart rows={data?.income_levels ?? []} />
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard
            title="Language Access"
            note="Share of sessions by language vs share of residents who speak it at home."
            loading={loading}
          >
            <DataGrid
              rows={withIds(data?.language_access ?? [])}
              columns={LANG_COLS}
              disableRowSelectionOnClick
              sx={{ border: "none" }}
              autoHeight
              hideFooter
            />
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard
            title="Geographic Equity"
            note="Share of sessions by council district vs share of county population."
            loading={loading}
          >
            <DataGrid
              rows={withIds(data?.geographic ?? [])}
              columns={GEO_COLS}
              disableRowSelectionOnClick
              sx={{ border: "none" }}
              autoHeight
              hideFooter
            />
          </SectionCard>
        </Grid>
      </Grid>
    </Box>
  );
}
