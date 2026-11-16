import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import AssessmentIcon from "@mui/icons-material/Assessment";
import DownloadIcon from "@mui/icons-material/Download";
import ScheduleIcon from "@mui/icons-material/Schedule";
import DescriptionIcon from "@mui/icons-material/Description";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import VisibilityIcon from "@mui/icons-material/Visibility";

import { getAdminReports } from "../../lib/api";
import { localRunTime } from "./reports/format";
import { hasCsv, hasPdf, loadReportData, type ReportDef } from "./reports/reportData";
import { downloadPdf, downloadReportCsv } from "./reports/reportActions";

const CATEGORY_COLORS: Record<
  string,
  "primary" | "secondary" | "success" | "warning" | "info" | "default"
> = {
  Leadership: "primary",
  Programs: "secondary",
  Equity: "success",
  Analytics: "info",
  Catalog: "warning",
};

export default function AdminReports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await getAdminReports()) as ReportDef[];
        if (!cancelled) setReports(res);
      } catch (err) {
        console.error("Failed to load reports", err);
        if (!cancelled) setLoadError(true);
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

  const filtered = useMemo(
    () =>
      categoryFilter === "all"
        ? reports
        : reports.filter((r) => r.category === categoryFilter),
    [reports, categoryFilter],
  );

  const handlePdf = async (report: ReportDef) => {
    setBusyId(report.id);
    const ok = await downloadPdf(report.id);
    setBusyId(null);
    // No pre-rendered file for this deployment: print the live view instead.
    if (!ok) navigate(`/admin/reports/${report.id}?print=1`);
  };

  const handleCsv = async (report: ReportDef) => {
    setBusyId(report.id);
    try {
      const data = await loadReportData(report.id === "catalog-export");
      downloadReportCsv(report.id, data);
    } catch (err) {
      console.error("Failed to build CSV", err);
      setToast({ text: "The CSV could not be built. Try again.", error: true });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <AssessmentIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Reports
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 760 }}>
        Aggregate reports for leadership, programs and equity staff. Open a
        report to read or print it, or download it as a PDF or CSV. Figures are
        synthetic demonstration data; counts under 11 are shown as "&lt;11".
      </Typography>

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

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          The report list could not be loaded. Refresh the page to try again.
        </Alert>
      )}

      {loading ? (
        <Grid container spacing={2}>
          {[...Array(6)].map((_, i) => (
            <Grid key={i} size={{ xs: 12, md: 6 }}>
              <Skeleton variant="rectangular" height={200} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={2}>
          {filtered.map((report) => {
            const lastRun =
              report.cadence === "on_demand" ? "" : localRunTime(report.last_run);
            const busy = busyId === report.id;
            return (
              <Grid key={report.id} size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: "100%" }}>
                  <CardContent
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.25,
                      height: "100%",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
                      <DescriptionIcon color="primary" sx={{ mt: 0.25 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {report.title}
                        </Typography>
                        {report.audience && (
                          <Typography variant="caption" color="text.secondary">
                            For: {report.audience}
                          </Typography>
                        )}
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {report.description}
                        </Typography>
                      </Box>
                    </Box>

                    <Stack direction="row" flexWrap="wrap" useFlexGap sx={{ gap: 0.75 }}>
                      <Chip
                        label={report.category}
                        size="small"
                        color={CATEGORY_COLORS[report.category] ?? "default"}
                      />
                      <Chip label={report.format} size="small" variant="outlined" />
                    </Stack>

                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                        columnGap: 2,
                        rowGap: 0.5,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <ScheduleIcon fontSize="small" sx={{ color: "text.secondary" }} />
                        <Typography variant="caption" color="text.secondary">
                          {report.schedule}
                        </Typography>
                      </Box>
                      {lastRun && (
                        <Typography variant="caption" color="text.secondary">
                          Last run: {lastRun}
                        </Typography>
                      )}
                    </Box>

                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 1,
                        mt: "auto",
                        pt: 1,
                      }}
                    >
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<VisibilityIcon />}
                        onClick={() => navigate(`/admin/reports/${report.id}`)}
                      >
                        View report
                      </Button>
                      {hasPdf(report) && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PictureAsPdfIcon />}
                          disabled={busy}
                          onClick={() => handlePdf(report)}
                        >
                          Download PDF
                        </Button>
                      )}
                      {hasCsv(report) && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<DownloadIcon />}
                          disabled={busy}
                          onClick={() => handleCsv(report)}
                        >
                          Download CSV
                        </Button>
                      )}
                      <Box sx={{ flex: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        {report.owner}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert
          onClose={() => setToast(null)}
          severity={toast?.error ? "error" : "success"}
          variant="filled"
        >
          {toast?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}
