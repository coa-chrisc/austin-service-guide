import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import { PieChart } from "@mui/x-charts/PieChart";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminLanguages } from "../../lib/api";

/* -- types for the two possible API response shapes --------------- */
interface LangUsageRow {
  id: number;
  language: string;
  language_native?: string;
  sessions: number;
  percentage: number;
}

interface LangSwitchRow {
  id: number;
  from_lang: string;
  to_lang: string;
  count: number;
}

interface TopQueryRow {
  id: number;
  query: string;
  language: string;
  count: number;
  category: string;
}

/* -- column defs -------------------------------------------------- */
const USAGE_COLS: GridColDef[] = [
  { field: "language", headerName: "Language", flex: 1 },
  { field: "sessions", headerName: "Sessions", width: 120, type: "number" },
  {
    field: "percentage",
    headerName: "Share",
    width: 110,
    type: "number",
    valueFormatter: (v: number) => `${v?.toFixed(1)}%`,
  },
];

const SWITCH_COLS: GridColDef[] = [
  { field: "from_lang", headerName: "From", flex: 1 },
  { field: "to_lang", headerName: "To", flex: 1 },
  { field: "count", headerName: "Count", width: 100, type: "number" },
];

const QUERY_COLS: GridColDef[] = [
  { field: "query", headerName: "Query", flex: 1.5, minWidth: 200 },
  { field: "language", headerName: "Language", width: 120 },
  { field: "count", headerName: "Count", width: 90, type: "number" },
  {
    field: "category",
    headerName: "Category",
    width: 150,
    renderCell: (p) => <Chip label={p.value} size="small" variant="outlined" />,
  },
];

export default function AdminLanguages() {
  const [usageRows, setUsageRows] = useState<LangUsageRow[]>([]);
  const [switchRows, setSwitchRows] = useState<LangSwitchRow[]>([]);
  const [queryRows, setQueryRows] = useState<TopQueryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminLanguages();
        if (cancelled) return;

        // Handle both possible response shapes
        if (Array.isArray(res)) {
          // LanguageUsageItem[]
          const items = res as Array<{
            language_code?: string;
            language_name?: string;
            language?: string;
            session_count?: number;
            sessions?: number;
            percentage: number;
          }>;
          setUsageRows(
            items.map((l, i) => ({
              id: i,
              language: l.language_name ?? l.language ?? l.language_code ?? "",
              sessions: l.session_count ?? l.sessions ?? 0,
              percentage: l.percentage,
            })),
          );
          // No switch or query data in the simple response
          setSwitchRows([]);
          setQueryRows([]);
        } else {
          // Rich response with usage, switches, top_queries
          const rich = res as {
            usage: Array<{
              language: string;
              language_native?: string;
              sessions: number;
              percentage: number;
            }>;
            switches: Array<{
              from_lang: string;
              to_lang: string;
              count: number;
            }>;
            top_queries: Array<{
              query: string;
              language: string;
              count: number;
              category: string;
            }>;
          };
          setUsageRows(
            (rich.usage ?? []).map((u, i) => ({
              id: i,
              language: u.language,
              language_native: u.language_native,
              sessions: u.sessions,
              percentage: u.percentage,
            })),
          );
          setSwitchRows((rich.switches ?? []).map((s, i) => ({ id: i, ...s })));
          setQueryRows(
            (rich.top_queries ?? []).map((q, i) => ({ id: i, ...q })),
          );
        }
      } catch (err) {
        console.error("Failed to load language data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* -- pie data ---------------------------------------------------- */
  const pieData = usageRows.map((r) => ({
    id: r.id,
    value: r.sessions,
    label: r.language,
  }));

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Language Analytics
      </Typography>

      {/* -- usage donut + table ------------------------------------- */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Language Usage
              </Typography>
              {loading ? (
                <Skeleton
                  variant="circular"
                  width={240}
                  height={240}
                  sx={{ mx: "auto" }}
                />
              ) : (
                <PieChart
                  series={[
                    {
                      data: pieData,
                      innerRadius: 60,
                      paddingAngle: 2,
                      cornerRadius: 4,
                    },
                  ]}
                  height={300}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Usage Breakdown
              </Typography>
              {loading ? (
                <Box>
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} height={44} sx={{ mb: 1 }} />
                  ))}
                </Box>
              ) : (
                <DataGrid
                  rows={usageRows}
                  columns={USAGE_COLS}
                  pageSizeOptions={[10]}
                  disableRowSelectionOnClick
                  sx={{ border: "none" }}
                  autoHeight
                  hideFooter={usageRows.length <= 10}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* -- language switching patterns ------------------------------ */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Language Switching Patterns
          </Typography>
          {loading ? (
            <Skeleton variant="rectangular" height={200} />
          ) : switchRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No language switching data available.
            </Typography>
          ) : (
            <DataGrid
              rows={switchRows}
              columns={SWITCH_COLS}
              pageSizeOptions={[10]}
              disableRowSelectionOnClick
              sx={{ border: "none" }}
              autoHeight
              hideFooter={switchRows.length <= 10}
            />
          )}
        </CardContent>
      </Card>

      {/* -- top non-English queries --------------------------------- */}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Top Non-English Queries
          </Typography>
          {loading ? (
            <Skeleton variant="rectangular" height={200} />
          ) : queryRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No query data available.
            </Typography>
          ) : (
            <DataGrid
              rows={queryRows}
              columns={QUERY_COLS}
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
