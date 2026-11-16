import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ForumIcon from "@mui/icons-material/Forum";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SupportIcon from "@mui/icons-material/Support";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import { LineChart } from "@mui/x-charts/LineChart";
import { BarChart } from "@mui/x-charts/BarChart";

import { getAdminAnalytics, getAdminLanguages } from "../../lib/api";
import { categoryLabel } from "../../lib/categoryLabel";
import { countCell, isSmallCell, pct, shareCell, shortDay } from "./reports/format";
import type { LanguageRow, Overview } from "./reports/reportData";

/* ---------- metric card component --------------------------------- */
interface MetricCardProps {
  title: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  loading?: boolean;
}

function MetricCard({ title, value, detail, icon, loading }: MetricCardProps) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        {loading ? (
          <>
            <Skeleton width={100} />
            <Skeleton width={60} height={40} />
          </>
        ) : (
          <>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 1,
              }}
            >
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {title}
              </Typography>
              <Box sx={{ color: "text.secondary", opacity: 0.5 }}>{icon}</Box>
            </Box>
            <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
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

/* ---------- main component ---------------------------------------- */
export default function AdminDashboard() {
  const theme = useTheme();
  const [analytics, setAnalytics] = useState<Overview | null>(null);
  const [languages, setLanguages] = useState<LanguageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [analyticsRes, langRes] = await Promise.all([
          getAdminAnalytics(),
          getAdminLanguages(),
        ]);
        if (cancelled) return;
        setAnalytics(analyticsRes as Overview);
        setLanguages(langRes as LanguageRow[]);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* -- figures ------------------------------------------------------- */
  const total = analytics?.total_sessions ?? 0;
  const previous = analytics?.monthly_trend?.find((t) => t.months_ago === 1);
  const dailySessions = analytics?.daily_sessions ?? [];
  const topCategories = ((analytics?.top_categories ?? []) as Array<{
    name?: string;
    count?: number;
  }>).slice(0, 8);
  const unmetNeeds = (analytics?.unmet_needs ?? []).slice(0, 6);
  const shownLanguages = languages.filter((l) => !isSmallCell(l.session_count));

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Dashboard
      </Typography>

      {loadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Dashboard data could not be loaded. Refresh the page to try again.
        </Alert>
      )}

      {/* -- metric cards -------------------------------------------- */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Sessions (30 days)"
            value={countCell(total)}
            detail={previous ? `${countCell(previous.sessions)} in the previous 30 days` : undefined}
            icon={<ForumIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Completion rate"
            value={analytics ? pct(analytics.completion_rate * 100) : "—"}
            detail={
              previous && previous.sessions > 0
                ? `${pct((100 * previous.completed) / previous.sessions)} in the previous 30 days`
                : "Sessions that reached results"
            }
            icon={<CheckCircleIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Crisis resources shown"
            value={countCell(analytics?.crisis_resources_shown ?? 0)}
            detail="Citywide count only, last 30 days"
            icon={<SupportIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Services in catalog"
            value={countCell(analytics?.total_services ?? 0)}
            detail="Live catalog, not yet staff-verified"
            icon={<MenuBookIcon />}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* -- charts row ---------------------------------------------- */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Sessions per day
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={300} />
              ) : (
                <LineChart
                  height={300}
                  series={[
                    {
                      data: dailySessions.map((d) => d.count),
                      label: "Sessions",
                      color: theme.palette.primary.main,
                      showMark: false,
                    },
                  ]}
                  xAxis={[
                    {
                      data: dailySessions.map((d) => d.date),
                      scaleType: "point",
                      valueFormatter: (v: string) => shortDay(v),
                      tickLabelInterval: (_v: unknown, i: number) => i % 4 === 0,
                    },
                  ]}
                  slotProps={{ legend: { hidden: true } }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600}>
                Sessions by language
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Languages with fewer than 11 sessions are not charted.
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={280} sx={{ mt: 2 }} />
              ) : (
                <BarChart
                  layout="horizontal"
                  height={300}
                  series={[
                    {
                      data: shownLanguages.map((l) => l.session_count),
                      label: "Sessions",
                      color: theme.palette.primary.main,
                    },
                  ]}
                  yAxis={[
                    {
                      data: shownLanguages.map((l) => l.language_name),
                      scaleType: "band",
                    },
                  ]}
                  margin={{ left: 130, right: 16 }}
                  slotProps={{ legend: { hidden: true } }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* -- bottom row ---------------------------------------------- */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Top need categories
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={300} />
              ) : (
                <BarChart
                  layout="horizontal"
                  height={300}
                  series={[
                    {
                      data: topCategories.map((c) => c.count ?? 0),
                      label: "Sessions",
                      color: theme.palette.primary.main,
                    },
                  ]}
                  yAxis={[
                    {
                      data: topCategories.map((c) => c.name ?? ""),
                      scaleType: "band",
                    },
                  ]}
                  margin={{ left: 150, right: 16 }}
                  slotProps={{ legend: { hidden: true } }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1 }}>
                <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
                  Top unmet needs
                </Typography>
                <Button
                  size="small"
                  component={RouterLink}
                  to="/admin/reports/unmet-need-partner-gaps"
                >
                  Open the report
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Needs residents named that had no open matching service.
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={260} sx={{ mt: 1 }} />
              ) : (
                <Table size="small" sx={{ mt: 1 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Need</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Sessions</TableCell>
                      <TableCell align="right">Share</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {unmetNeeds.map((n) => (
                      <TableRow key={n.need}>
                        <TableCell>{n.need}</TableCell>
                        <TableCell>{categoryLabel(n.category)}</TableCell>
                        <TableCell align="right">{countCell(n.sessions)}</TableCell>
                        <TableCell align="right">{shareCell(n.sessions, total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
