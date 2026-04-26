import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import AssessmentIcon from "@mui/icons-material/Assessment";
import DownloadIcon from "@mui/icons-material/Download";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DescriptionIcon from "@mui/icons-material/Description";

import { getAdminReports, type AdminReport } from "../../lib/api";

const CATEGORY_COLORS: Record<
  string,
  "primary" | "secondary" | "success" | "warning" | "default"
> = {
  Operations: "primary",
  Equity: "success",
  Analytics: "secondary",
  Catalog: "warning",
  System: "default",
};

const FORMAT_LABEL_COLORS: Record<string, string> = {
  PDF: "#D32F2F",
  CSV: "#1E88E5",
  "PDF + CSV": "#6A1B9A",
};

function formatTimestamp(iso: string) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function downloadCsv(report: AdminReport) {
  const header = ["report_id", "title", "category", "row_count", "last_run"];
  const row = [
    report.id,
    `"${report.title.replace(/"/g, '""')}"`,
    report.category,
    String(report.row_count),
    report.last_run,
  ];
  const csv = `${header.join(",")}\n${row.join(",")}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.id}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminReports() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminReports();
        if (cancelled) return;
        setReports(res);
      } catch (err) {
        console.error("Failed to load reports", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(reports.map((r) => r.category))).sort(),
    [reports],
  );

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return reports;
    return reports.filter((r) => r.category === categoryFilter);
  }, [reports, categoryFilter]);

  const handleRun = (report: AdminReport) => {
    setRunningId(report.id);
    setSnackbar(`Running "${report.title}"…`);
    setTimeout(() => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, last_run: new Date().toISOString() } : r,
        ),
      );
      setRunningId(null);
      setSnackbar(`"${report.title}" finished — ${report.row_count} rows`);
    }, 900);
  };

  const handleDownload = (report: AdminReport) => {
    downloadCsv(report);
    setSnackbar(`Downloaded ${report.id}.csv`);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <AssessmentIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Reports
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Prebuilt scheduled reports. Run on demand or download the latest output.
      </Typography>

      {/* -- summary --------------------------------------------------- */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap">
        <Card sx={{ flex: 1, minWidth: 180 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Total Reports
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {loading ? <Skeleton width={60} /> : reports.length}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 180 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Scheduled Daily
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {loading ? (
                <Skeleton width={60} />
              ) : (
                reports.filter((r) => r.schedule.startsWith("Daily")).length
              )}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 180 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Categories
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {loading ? <Skeleton width={60} /> : categories.length}
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* -- filters --------------------------------------------------- */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All categories</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {/* -- report cards --------------------------------------------- */}
      {loading ? (
        <Grid container spacing={2}>
          {[...Array(6)].map((_, i) => (
            <Grid key={i} size={{ xs: 12, md: 6 }}>
              <Skeleton variant="rectangular" height={180} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={2}>
          {filtered.map((report) => (
            <Grid key={report.id} size={{ xs: 12, md: 6 }}>
              <Card
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <CardContent
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.25,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1.5,
                    }}
                  >
                    <DescriptionIcon
                      sx={{
                        color: FORMAT_LABEL_COLORS[report.format] ?? "#999",
                        mt: 0.5,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {report.title}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.25 }}
                      >
                        {report.description}
                      </Typography>
                    </Box>
                  </Box>

                  <Stack
                    direction="row"
                    spacing={1}
                    flexWrap="wrap"
                    sx={{ gap: 0.75 }}
                  >
                    <Chip
                      label={report.category}
                      size="small"
                      color={CATEGORY_COLORS[report.category] ?? "default"}
                    />
                    <Chip
                      label={report.format}
                      size="small"
                      variant="outlined"
                      sx={{
                        borderColor:
                          FORMAT_LABEL_COLORS[report.format] ?? "#999",
                        color: FORMAT_LABEL_COLORS[report.format] ?? "#666",
                        fontWeight: 600,
                      }}
                    />
                    <Chip
                      label={`${report.row_count.toLocaleString()} rows`}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      mt: 0.5,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                      }}
                    >
                      <ScheduleIcon
                        fontSize="small"
                        sx={{ color: "text.secondary" }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {report.schedule}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Last run: {formatTimestamp(report.last_run)}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      mt: "auto",
                      pt: 1.5,
                    }}
                  >
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PlayArrowIcon />}
                      onClick={() => handleRun(report)}
                      disabled={runningId === report.id}
                    >
                      {runningId === report.id ? "Running…" : "Run Now"}
                    </Button>
                    <Tooltip title="Download latest output">
                      <IconButton
                        size="small"
                        onClick={() => handleDownload(report)}
                      >
                        <DownloadIcon />
                      </IconButton>
                    </Tooltip>
                    <Box sx={{ flex: 1 }} />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ alignSelf: "center" }}
                    >
                      {report.owner}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
      >
        <Alert
          onClose={() => setSnackbar(null)}
          severity="success"
          variant="filled"
        >
          {snackbar}
        </Alert>
      </Snackbar>
    </Box>
  );
}
