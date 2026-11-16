import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import SearchIcon from "@mui/icons-material/Search";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import SchoolIcon from "@mui/icons-material/School";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminResidents } from "../../lib/api";
import type { DemoResident } from "../../types";
import { downloadCsv, toCsv } from "./reports/format";

const COLUMNS: GridColDef<DemoResident>[] = [
  { field: "name", headerName: "Sample case", flex: 1, minWidth: 180 },
  { field: "zip_code", headerName: "ZIP", width: 90 },
  { field: "household_size", headerName: "Household size", width: 130, type: "number" },
  {
    field: "language",
    headerName: "Language",
    width: 110,
    renderCell: (params) => <Chip label={params.value} size="small" variant="outlined" />,
  },
  {
    field: "matched_services_count",
    headerName: "Services matched",
    width: 150,
    type: "number",
  },
];

const MH_KEYWORDS = ["anxiety", "depression", "behavioral", "self-harm", "trauma", "mental health"];

function hasK12MentalHealth(r: DemoResident): boolean {
  const kids = r.profile?.school_age_children ?? [];
  return kids.some((c) =>
    (c.concerns ?? []).some((concern) => MH_KEYWORDS.includes(concern.toLowerCase())),
  );
}

export default function AdminResidents() {
  const navigate = useNavigate();
  const [residents, setResidents] = useState<DemoResident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [zipFilter, setZipFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const k12mhActive = searchParams.get("filter") === "k12_mh";

  const toggleK12mh = () => {
    const next = new URLSearchParams(searchParams);
    if (k12mhActive) next.delete("filter");
    else next.set("filter", "k12_mh");
    setSearchParams(next, { replace: true });
  };

  // The sample set is small: load it once and filter in the browser.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminResidents({ page: 1, page_size: 100 });
        if (!cancelled) setResidents(res.items);
      } catch (err) {
        console.error("Failed to load sample cases", err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = residents.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q) && !r.zip_code.includes(q)) return false;
    if (zipFilter && r.zip_code !== zipFilter) return false;
    if (langFilter && r.language !== langFilter) return false;
    if (k12mhActive && !hasK12MentalHealth(r)) return false;
    return true;
  });

  const uniqueZips = [...new Set(residents.map((r) => r.zip_code))].sort();
  const uniqueLangs = [...new Set(residents.map((r) => r.language))].sort();

  const exportCsv = () => {
    const csv = toCsv({
      headers: ["sample_case", "zip", "household_size", "language", "services_matched"],
      rows: filtered.map((r) => [
        r.name,
        r.zip_code,
        r.household_size,
        r.language,
        r.matched_services_count,
      ]),
    });
    downloadCsv("sample-cases.csv", csv);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            Sample cases
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Illustrative synthetic personas for the demo. The live intake
            creates no resident records.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={exportCsv}
          disabled={loading || filtered.length === 0}
        >
          Export CSV
        </Button>
      </Box>

      {loadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Sample cases could not be loaded. Refresh the page to try again.
        </Alert>
      )}

      {/* -- search + filters ---------------------------------------- */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3, pb: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by name or ZIP code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              htmlInput: { "aria-label": "Search sample cases" },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1, mt: 0.5 }}>
              Saved:
            </Typography>
            <Chip
              icon={<SchoolIcon fontSize="small" />}
              label="K-12 + mental-health flag"
              size="small"
              variant={k12mhActive ? "filled" : "outlined"}
              color={k12mhActive ? "secondary" : "default"}
              onClick={toggleK12mh}
            />
          </Box>

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1, mt: 0.5 }}>
              ZIP:
            </Typography>
            {uniqueZips.map((z) => (
              <Chip
                key={z}
                label={z}
                size="small"
                variant={zipFilter === z ? "filled" : "outlined"}
                color={zipFilter === z ? "primary" : "default"}
                onClick={() => setZipFilter(zipFilter === z ? "" : z)}
              />
            ))}
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mr: 1, mt: 0.5 }}>
              Language:
            </Typography>
            {uniqueLangs.map((l) => (
              <Chip
                key={l}
                label={l}
                size="small"
                variant={langFilter === l ? "filled" : "outlined"}
                color={langFilter === l ? "primary" : "default"}
                onClick={() => setLangFilter(langFilter === l ? "" : l)}
              />
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* -- data grid ----------------------------------------------- */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ p: 3 }}>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} height={48} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : (
            <DataGrid
              rows={filtered}
              columns={COLUMNS}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              pageSizeOptions={[10, 25, 50]}
              disableRowSelectionOnClick
              onRowClick={(params) => navigate(`/admin/residents/${params.id}`)}
              sx={{
                border: "none",
                "& .MuiDataGrid-row": { cursor: "pointer" },
                "& .MuiDataGrid-row:hover": { bgcolor: "action.hover" },
              }}
              autoHeight
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
