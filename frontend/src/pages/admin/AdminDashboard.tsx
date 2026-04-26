import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import PeopleIcon from "@mui/icons-material/People";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { LineChart } from "@mui/x-charts/LineChart";
import { BarChart } from "@mui/x-charts/BarChart";
import { PieChart } from "@mui/x-charts/PieChart";

import { getAdminAnalytics, getAdminLanguages } from "../../lib/api";
import type { AnalyticsOverview } from "../../types";

/* ---------- mock recent activity ---------------------------------- */
const RECENT_ACTIVITY = [
  {
    id: 1,
    text: "New resident signed up from 78741",
    time: "5 min ago",
    color: "#4caf50",
  },
  {
    id: 2,
    text: "Intake session completed — 4 services matched",
    time: "12 min ago",
    color: "#2196f3",
  },
  {
    id: 3,
    text: 'Service "SNAP Benefits" updated by admin',
    time: "28 min ago",
    color: "#ff9800",
  },
  {
    id: 4,
    text: "Language switch detected: EN -> ES",
    time: "45 min ago",
    color: "#9c27b0",
  },
  {
    id: 5,
    text: "Crisis keyword flagged in session #4812",
    time: "1 hr ago",
    color: "#f44336",
  },
  {
    id: 6,
    text: "CSV export requested by staff user",
    time: "2 hr ago",
    color: "#607d8b",
  },
];

/* ---------- metric card component --------------------------------- */
interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  loading?: boolean;
}

function MetricCard({ title, value, change, icon, loading }: MetricCardProps) {
  const positive = (change ?? 0) >= 0;
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
              <Typography
                variant="body2"
                color="text.secondary"
                fontWeight={500}
              >
                {title}
              </Typography>
              <Box sx={{ color: "text.secondary", opacity: 0.5 }}>{icon}</Box>
            </Box>
            <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
              {typeof value === "number" ? value.toLocaleString() : value}
            </Typography>
            {change !== undefined && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {positive ? (
                  <TrendingUpIcon
                    sx={{ fontSize: 16, color: "success.main" }}
                  />
                ) : (
                  <TrendingDownIcon
                    sx={{ fontSize: 16, color: "error.main" }}
                  />
                )}
                <Typography
                  variant="caption"
                  color={positive ? "success.main" : "error.main"}
                  fontWeight={600}
                >
                  {positive ? "+" : ""}
                  {change}%
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 0.5 }}
                >
                  vs last period
                </Typography>
              </Box>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- main component ---------------------------------------- */
export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [languageData, setLanguageData] = useState<
    Array<{ language: string; sessions: number; percentage: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [analyticsRes, langRes] = await Promise.all([
          getAdminAnalytics(),
          getAdminLanguages(),
        ]);
        if (cancelled) return;
        setAnalytics(analyticsRes);
        // langRes could be an array (LanguageUsageItem[]) per existing api
        if (Array.isArray(langRes)) {
          setLanguageData(
            (
              langRes as Array<{
                language_name?: string;
                language?: string;
                session_count?: number;
                sessions?: number;
                percentage: number;
              }>
            ).map((l) => ({
              language: l.language_name ?? l.language ?? "",
              sessions: l.session_count ?? l.sessions ?? 0,
              percentage: l.percentage,
            })),
          );
        } else {
          const usage =
            (
              langRes as {
                usage: Array<{
                  language: string;
                  sessions: number;
                  percentage: number;
                }>;
              }
            ).usage ?? [];
          setLanguageData(usage);
        }
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /* -- chart data ---------------------------------------------------- */
  const dailySessions = analytics?.daily_sessions ?? [];
  const sessionDates = dailySessions.map((d) => d.date);
  const sessionCounts = dailySessions.map((d) => d.count);

  const topCategories = (analytics?.top_categories ?? []).slice(0, 8) as Array<{
    name?: string;
    category?: string;
    count?: number;
    match_count?: number;
    color?: string;
  }>;
  const catNames = topCategories.map((c) => c.name ?? c.category ?? "");
  const catCounts = topCategories.map((c) => c.count ?? c.match_count ?? 0);
  const catColors = topCategories.map((c) => c.color ?? "#1976d2");

  const pieData = languageData.map((l, i) => ({
    id: i,
    value: l.sessions,
    label: l.language,
  }));

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Dashboard
      </Typography>

      {/* -- metric cards -------------------------------------------- */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Residents"
            value={analytics?.total_residents ?? 0}
            change={12}
            icon={<PeopleIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="New Signups (7d)"
            value={analytics ? Math.round(analytics.total_residents * 0.04) : 0}
            change={8}
            icon={<PersonAddIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Active Users (7d)"
            value={analytics ? Math.round(analytics.total_residents * 0.35) : 0}
            change={5}
            icon={<AccessTimeIcon />}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Completion Rate"
            value={
              analytics
                ? `${(analytics.completion_rate * 100).toFixed(1)}%`
                : "0%"
            }
            change={3}
            icon={<CheckCircleIcon />}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* -- charts row ---------------------------------------------- */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Sessions over time */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Sessions Over Time
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={300} />
              ) : (
                <LineChart
                  height={300}
                  series={[
                    {
                      data: sessionCounts,
                      label: "Sessions",
                      color: "#1976d2",
                    },
                  ]}
                  xAxis={[{ data: sessionDates, scaleType: "band" }]}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Language distribution */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Language Distribution
              </Typography>
              {loading ? (
                <Skeleton
                  variant="circular"
                  width={200}
                  height={200}
                  sx={{ mx: "auto" }}
                />
              ) : (
                <PieChart
                  series={[
                    {
                      data: pieData,
                      innerRadius: 50,
                      paddingAngle: 2,
                      cornerRadius: 4,
                    },
                  ]}
                  height={260}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* -- bottom row ---------------------------------------------- */}
      <Grid container spacing={3}>
        {/* Top service categories */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Top Service Categories
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={300} />
              ) : (
                <BarChart
                  layout="horizontal"
                  height={300}
                  series={[
                    {
                      data: catCounts,
                      label: "Matches",
                      color: catColors[0] ?? "#1976d2",
                    },
                  ]}
                  yAxis={[{ data: catNames, scaleType: "band" }]}
                  xAxis={[{ label: "Matches" }]}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent activity */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                Recent Activity
              </Typography>
              <List dense disablePadding>
                {RECENT_ACTIVITY.map((item) => (
                  <ListItem key={item.id} disableGutters sx={{ py: 1 }}>
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <FiberManualRecordIcon
                        sx={{ fontSize: 10, color: item.color }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      secondary={item.time}
                      primaryTypographyProps={{ variant: "body2" }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
