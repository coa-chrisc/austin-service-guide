import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useBrandConfig } from "@/hooks/useBrandConfig";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import { useSearchParams } from "react-router-dom";
import { BarChart } from "@mui/x-charts/BarChart";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import {
  getAdminAnalytics,
  getAdminDemandMap,
  getAdminDemographics,
  getAdminServiceDemand,
} from "../../lib/api";
import type {
  DemographicBucket,
  DemographicsData,
  ServiceDemandItem,
} from "../../types";
import { countCell, longDay, pct } from "./reports/format";
import { reportingPeriod, type DemandPoint, type Overview } from "./reports/reportData";

/* -- metric card --------------------------------------------------- */
interface MetricProps {
  title: string;
  value: string;
  detail?: string;
  loading?: boolean;
}

function Metric({ title, value, detail, loading }: MetricProps) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        {loading ? (
          <>
            <Skeleton width={100} />
            <Skeleton width={60} height={36} />
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {value}
            </Typography>
            {detail && (
              <Typography variant="caption" color="text.secondary">
                {detail}
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* -- demographic bars ------------------------------------------------ */
function BucketBars({
  title,
  buckets,
  loading,
}: {
  title: string;
  buckets: DemographicBucket[];
  loading: boolean;
}) {
  const theme = useTheme();
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          {title}
        </Typography>
        {loading ? (
          <Skeleton variant="rectangular" height={240} />
        ) : (
          <BarChart
            layout="horizontal"
            height={Math.max(160, 40 + 34 * buckets.length)}
            series={[
              {
                data: buckets.map((b) => b.count),
                label: "Sessions",
                color: theme.palette.primary.main,
                valueFormatter: (v) => (v === null ? "" : countCell(v)),
              },
            ]}
            yAxis={[{ data: buckets.map((b) => b.label), scaleType: "band" }]}
            margin={{ left: 170, right: 16, top: 10 }}
            slotProps={{ legend: { hidden: true } }}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* -- demand table columns ------------------------------------------ */
const DEMAND_COLS: GridColDef[] = [
  { field: "rank", headerName: "#", width: 60 },
  { field: "service_name", headerName: "Service", flex: 1, minWidth: 200 },
  { field: "category", headerName: "Category", flex: 0.7, minWidth: 140 },
  {
    field: "match_count",
    headerName: "Matches",
    width: 110,
    type: "number",
    valueFormatter: (v: number) => countCell(v),
  },
  {
    field: "trend",
    headerName: "Trend",
    width: 100,
    renderCell: (params) => {
      const color =
        params.value === "up" ? "success" : params.value === "down" ? "error" : "default";
      return <Chip label={params.value} size="small" color={color} />;
    },
  },
];

export default function AdminAnalytics() {
  const { region } = useBrandConfig();
  const [analytics, setAnalytics] = useState<Overview | null>(null);
  const [demographics, setDemographics] = useState<DemographicsData | null>(null);
  const [demandMap, setDemandMap] = useState<DemandPoint[]>([]);
  const [demand, setDemand] = useState<ServiceDemandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const district = searchParams.get("district") ?? "";
  const zip = searchParams.get("zip") ?? "";

  const setFilter = (key: "district" | "zip", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (next.get(key) === value || !value) next.delete(key);
    else next.set(key, value);
    if (key === "district") next.delete("zip");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [aRes, dRes, mapRes, sdRes] = await Promise.all([
          getAdminAnalytics(),
          getAdminDemographics(),
          getAdminDemandMap(),
          getAdminServiceDemand(),
        ]);
        if (cancelled) return;
        setAnalytics(aRes as Overview);
        setDemographics(dRes);
        setDemandMap(mapRes as DemandPoint[]);
        setDemand(sdRes);
      } catch (err) {
        console.error("Failed to load analytics", err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Geographic filter chips come from the data pack's admin demo data.
  const districts = analytics?.council_districts ?? [];
  const activeDistrict = districts.find((d) => d.id === district);
  const total = analytics?.total_sessions ?? 0;

  /** Sessions in the selected area, summed from the demand map's ZIPs. */
  const sliceSessions = useMemo(() => {
    const zips = zip ? [zip] : activeDistrict ? activeDistrict.zips : null;
    if (!zips) return total;
    return demandMap
      .filter((p) => zips.includes(p.zip))
      .reduce((s, p) => s + p.sessions, 0);
  }, [zip, activeDistrict, demandMap, total]);
  const filtered = Boolean(zip || activeDistrict);
  const period = analytics ? reportingPeriod(analytics) : null;

  const demandRows = demand.map((d, i) => ({ id: i, rank: i + 1, ...d }));

  return (
    <Box>
      <Typography variant="h5" fontWeight={700}>
        Analytics
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        {period
          ? `${longDay(period.start)} to ${longDay(period.end)}. `
          : ""}
        Synthetic sample data, shown as aggregate counts only.
      </Typography>

      {loadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Analytics could not be loaded. Refresh the page to try again.
        </Alert>
      )}

      {/* -- geographic filter ---------------------------------------- */}
      {districts.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
            <LocationOnIcon fontSize="small" sx={{ color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
              View by:
            </Typography>
            <Chip
              label={`All ${region.cityName}`}
              size="small"
              variant={!filtered ? "filled" : "outlined"}
              color={!filtered ? "primary" : "default"}
              onClick={() => setFilter("district", "")}
            />
            {districts.map((d) => (
              <Chip
                key={d.id}
                label={d.label}
                size="small"
                variant={district === d.id ? "filled" : "outlined"}
                color={district === d.id ? "primary" : "default"}
                onClick={() => setFilter("district", d.id)}
              />
            ))}
            {activeDistrict && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mr: 0.5 }}>
                  ZIPs:
                </Typography>
                {activeDistrict.zips.map((z) => (
                  <Chip
                    key={z}
                    label={z}
                    size="small"
                    variant={zip === z ? "filled" : "outlined"}
                    color={zip === z ? "secondary" : "default"}
                    onClick={() => setFilter("zip", z)}
                  />
                ))}
              </>
            )}
          </CardContent>
        </Card>
      )}
      {filtered && !loading && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {zip ? `ZIP ${zip}` : activeDistrict?.label}: {countCell(sliceSessions)} sessions,{" "}
          {total > 0 ? pct((100 * sliceSessions) / total) : "—"} of citywide sessions. The
          area filter applies to session counts; the other figures on this page are citywide.
        </Alert>
      )}

      {/* -- metric cards --------------------------------------------- */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title={filtered ? "Sessions in this area" : "Sessions"}
            value={countCell(sliceSessions)}
            detail={filtered ? `of ${countCell(total)} citywide` : "Last 30 days"}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title="Completed sessions"
            value={analytics ? countCell(Math.round(total * analytics.completion_rate)) : "—"}
            detail="Citywide; reached the results page"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title="Completion rate"
            value={analytics ? pct(100 * analytics.completion_rate) : "—"}
            detail="Citywide"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title="Matches per session"
            value={analytics?.avg_matches_per_session?.toFixed(1) ?? "—"}
            detail="Citywide average, rules-engine matches"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* -- demographics --------------------------------------------- */}
      <Typography variant="h6" fontWeight={600}>
        What residents shared
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Citywide counts of sessions by what the resident described during
        intake. Residents can skip any question.
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <BucketBars title="Age range" buckets={demographics?.age_ranges ?? []} loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <BucketBars
            title="Housing situation"
            buckets={demographics?.housing_situations ?? []}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <BucketBars
            title="Employment status"
            buckets={demographics?.employment_statuses ?? []}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <BucketBars
            title="Health insurance"
            buckets={demographics?.insurance_statuses ?? []}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* -- service demand table ------------------------------------- */}
      <Typography variant="h6" fontWeight={600}>
        Most-matched services
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Rules-engine matches, citywide. A match is not a referral or an enrolment.
      </Typography>
      <Card>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ p: 3 }}>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} height={44} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : (
            <DataGrid
              rows={demandRows}
              columns={DEMAND_COLS}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              pageSizeOptions={[10, 25]}
              disableRowSelectionOnClick
              sx={{ border: "none" }}
              autoHeight
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
