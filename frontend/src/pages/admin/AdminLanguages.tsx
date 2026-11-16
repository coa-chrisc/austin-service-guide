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
import { BarChart } from "@mui/x-charts/BarChart";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminLanguages } from "../../lib/api";
import { countCell, isSmallCell, pct, shareCell } from "./reports/format";
import { completionRate, type LanguageRow } from "./reports/reportData";

interface Row {
  id: string;
  language: string;
  sessions: string;
  share: string;
  census: string;
  completed: string;
  rate: string;
}

const COLS: GridColDef<Row>[] = [
  { field: "language", headerName: "Language", flex: 1, minWidth: 140 },
  { field: "sessions", headerName: "Sessions", width: 90, align: "right", headerAlign: "right" },
  { field: "share", headerName: "Share", width: 80, align: "right", headerAlign: "right" },
  {
    field: "census",
    headerName: "Census",
    width: 90,
    align: "right",
    headerAlign: "right",
  },
  { field: "completed", headerName: "Completed", width: 100, align: "right", headerAlign: "right" },
  {
    field: "rate",
    headerName: "Completion rate",
    width: 130,
    align: "right",
    headerAlign: "right",
  },
];

export default function AdminLanguages() {
  const theme = useTheme();
  const [languages, setLanguages] = useState<LanguageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminLanguages();
        if (!cancelled) setLanguages(res as LanguageRow[]);
      } catch (err) {
        console.error("Failed to load language data", err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = languages.reduce((s, l) => s + l.session_count, 0);
  const charted = languages.filter((l) => !isSmallCell(l.session_count));
  const rows: Row[] = languages.map((l) => {
    const rate = completionRate(l);
    const hidden = isSmallCell(l.session_count) || isSmallCell(l.completed ?? 0);
    return {
      id: l.language_code,
      language: l.language_name,
      sessions: countCell(l.session_count),
      share: shareCell(l.session_count, total),
      census:
        l.census_lep_percentage === null || l.census_lep_percentage === undefined
          ? "n/a"
          : pct(l.census_lep_percentage),
      completed: l.completed === undefined ? "—" : countCell(l.completed),
      rate: rate === null || hidden ? "—" : pct(100 * rate),
    };
  });

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            Language Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
            Sessions by the language the resident used, last 30 days (synthetic
            sample data). Counts under 11 are shown as "&lt;11" and the shares
            built on them are hidden.
          </Typography>
        </Box>
        <Button variant="outlined" component={RouterLink} to="/admin/reports/language-access">
          Open the report
        </Button>
      </Box>

      {loadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Language data could not be loaded. Refresh the page to try again.
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600}>
                Sessions by language
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Languages with fewer than 11 sessions are not charted.
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={300} sx={{ mt: 2 }} />
              ) : (
                <BarChart
                  layout="horizontal"
                  height={Math.max(200, 50 + 40 * charted.length)}
                  series={[
                    {
                      data: charted.map((l) => l.session_count),
                      label: "Sessions",
                      color: theme.palette.primary.main,
                    },
                  ]}
                  yAxis={[{ data: charted.map((l) => l.language_name), scaleType: "band" }]}
                  margin={{ left: 130, right: 16, top: 10 }}
                  slotProps={{ legend: { hidden: true } }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600}>
                Sessions and completion
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Census column: share of residents who speak the language at
                home and speak English less than "very well".
              </Typography>
              {loading ? (
                <Box sx={{ mt: 2 }}>
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} height={44} sx={{ mb: 1 }} />
                  ))}
                </Box>
              ) : (
                <DataGrid
                  rows={rows}
                  columns={COLS}
                  disableRowSelectionOnClick
                  sx={{ border: "none", mt: 1 }}
                  autoHeight
                  hideFooter
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
