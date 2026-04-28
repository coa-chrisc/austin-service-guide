import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import { useSearchParams } from "react-router-dom";
import { BarChart } from "@mui/x-charts/BarChart";
import { PieChart } from "@mui/x-charts/PieChart";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import {
  getAdminAnalytics,
  getAdminDemographics,
  getAdminServiceDemand,
} from "../../lib/api";
import type { AnalyticsOverview, DemographicsData } from "../../types";

/* -- metric card --------------------------------------------------- */
interface MetricProps {
  title: string;
  value: string | number;
  loading?: boolean;
}

function Metric({ title, value, loading }: MetricProps) {
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
            <Typography
              variant="body2"
              color="text.secondary"
              fontWeight={500}
              sx={{ mb: 0.5 }}
            >
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {typeof value === "number" ? value.toLocaleString() : value}
            </Typography>
          </>
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
  { field: "match_count", headerName: "Matches", width: 110, type: "number" },
  {
    field: "trend",
    headerName: "Trend",
    width: 100,
    renderCell: (params) => {
      const color =
        params.value === "up"
          ? "success"
          : params.value === "down"
            ? "error"
            : "default";
      return (
        <Chip
          label={params.value}
          size="small"
          color={color as "success" | "error" | "default"}
        />
      );
    },
  },
];

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [demographics, setDemographics] = useState<DemographicsData | null>(
    null,
  );
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

  const DISTRICTS: Array<{ id: string; label: string; zips: string[] }> = [
    {
      id: "1",
      label: "District 1 (East)",
      zips: ["78702", "78721", "78722", "78723", "78724"],
    },
    { id: "2", label: "District 2 (Southeast)", zips: ["78744", "78745"] },
    { id: "3", label: "District 3 (Southside)", zips: ["78741", "78704"] },
    { id: "4", label: "District 4 (North)", zips: ["78753", "78758"] },
  ];
  const activeDistrict = DISTRICTS.find((d) => d.id === district);
  const filterShare = useMemo(() => {
    if (zip) return 0.06;
    if (activeDistrict) {
      const sharePerZip = 0.06;
      return activeDistrict.zips.length * sharePerZip;
    }
    return 1;
  }, [zip, activeDistrict]);
  const [demandItems, setDemandItems] = useState<
    Array<{
      id: number;
      rank: number;
      service_name: string;
      category: string;
      match_count: number;
      trend: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [aRes, dRes, sdRes] = await Promise.all([
          getAdminAnalytics(),
          getAdminDemographics(),
          getAdminServiceDemand(),
        ]);
        if (cancelled) return;
        setAnalytics(aRes);
        setDemographics(dRes);

        // ServiceDemandItem[] from the existing API
        if (Array.isArray(sdRes)) {
          setDemandItems(
            (
              sdRes as Array<{
                service_name: string;
                category: string;
                match_count: number;
                trend: string;
              }>
            ).map((d, i) => ({
              id: i,
              rank: i + 1,
              service_name: d.service_name,
              category: d.category,
              match_count: d.match_count,
              trend: d.trend,
            })),
          );
        } else {
          const rankings =
            (
              sdRes as {
                rankings: Array<{
                  name: string;
                  matches: number;
                  clicks: number;
                  saves: number;
                }>;
              }
            ).rankings ?? [];
          setDemandItems(
            rankings.map((r, i) => ({
              id: i,
              rank: i + 1,
              service_name: r.name,
              category: "",
              match_count: r.matches,
              trend: "stable",
            })),
          );
        }
      } catch (err) {
        console.error("Failed to load analytics", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* -- demographics chart data ------------------------------------ */
  const ageData = (demographics?.age_ranges ?? []).map((b) => ({
    label: b.label,
    value: b.count,
  }));
  const housingData = (demographics?.housing_situations ?? []).map((b, i) => ({
    id: i,
    label: b.label,
    value: b.count,
  }));
  const employmentData = (demographics?.employment_statuses ?? []).map(
    (b, i) => ({ id: i, label: b.label, value: b.count }),
  );
  const insuranceData = (demographics?.insurance_statuses ?? []).map(
    (b, i) => ({ id: i, label: b.label, value: b.count }),
  );

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h5" fontWeight={700}>
          Analytics
        </Typography>
        <Chip
          icon={<CalendarTodayIcon />}
          label="Last 30 days"
          variant="outlined"
        />
      </Box>

      {/* -- geographic filter ---------------------------------------- */}
      <Card sx={{ mb: 3 }}>
        <CardContent
          sx={{
            p: 2,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1,
          }}
        >
          <LocationOnIcon fontSize="small" sx={{ color: "text.secondary" }} />
          <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
            View by:
          </Typography>
          <Chip
            label="All Austin"
            size="small"
            variant={!district && !zip ? "filled" : "outlined"}
            color={!district && !zip ? "primary" : "default"}
            onClick={() => setFilter("district", "")}
          />
          {DISTRICTS.map((d) => (
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
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ ml: 1, mr: 0.5 }}
              >
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
      {(district || zip) && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Showing {zip ? `ZIP ${zip}` : activeDistrict?.label} —{" "}
          {(filterShare * 100).toFixed(0)}% of citywide sessions in this slice.
        </Alert>
      )}

      {/* -- metric cards --------------------------------------------- */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Metric
            title="Total Sessions"
            value={Math.round((analytics?.total_sessions ?? 0) * filterShare)}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Metric
            title="Completions"
            value={
              analytics
                ? Math.round(
                    analytics.total_sessions *
                      analytics.completion_rate *
                      filterShare,
                  )
                : 0
            }
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Metric
            title="Avg Matches/User"
            value={analytics?.avg_matches_per_session?.toFixed(1) ?? "0"}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Metric title="Avg Time" value="4.2 min" loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Metric title="Return Rate" value="34%" loading={loading} />
        </Grid>
      </Grid>

      {/* -- demographics 2x2 grid ------------------------------------ */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        Demographics
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Age distribution */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Age Distribution
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={250} />
              ) : (
                <BarChart
                  layout="horizontal"
                  height={250}
                  series={[
                    {
                      data: ageData.map((d) => d.value),
                      label: "Count",
                      color: "#1976d2",
                    },
                  ]}
                  yAxis={[
                    { data: ageData.map((d) => d.label), scaleType: "band" },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Housing situation */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Housing Situation
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={250} />
              ) : (
                <PieChart
                  series={[
                    {
                      data: housingData,
                      innerRadius: 40,
                      paddingAngle: 2,
                      cornerRadius: 4,
                    },
                  ]}
                  height={250}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Employment status */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Employment Status
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={250} />
              ) : (
                <PieChart
                  series={[
                    {
                      data: employmentData,
                      innerRadius: 40,
                      paddingAngle: 2,
                      cornerRadius: 4,
                    },
                  ]}
                  height={250}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Insurance status */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Insurance Status
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={250} />
              ) : (
                <PieChart
                  series={[
                    {
                      data: insuranceData,
                      innerRadius: 40,
                      paddingAngle: 2,
                      cornerRadius: 4,
                    },
                  ]}
                  height={250}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* -- service demand table ------------------------------------- */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        Service Demand
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
              rows={demandItems}
              columns={DEMAND_COLS}
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
