import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import SearchIcon from "@mui/icons-material/Search";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminResidents } from "../../lib/api";
import type { DemoResident } from "../../types";

const COLUMNS: GridColDef[] = [
  { field: "name", headerName: "Name", flex: 1, minWidth: 150 },
  { field: "email", headerName: "Email", flex: 1.2, minWidth: 180 },
  { field: "zip_code", headerName: "Zip", width: 90 },
  { field: "household_size", headerName: "HH Size", width: 90, type: "number" },
  {
    field: "language",
    headerName: "Language",
    width: 110,
    renderCell: (params) => (
      <Chip label={params.value} size="small" variant="outlined" />
    ),
  },
  {
    field: "matched_services_count",
    headerName: "Services Matched",
    width: 140,
    type: "number",
  },
  {
    field: "last_active",
    headerName: "Last Active",
    width: 140,
    valueFormatter: (value: string) => {
      if (!value) return "";
      return new Date(value).toLocaleDateString();
    },
  },
];

export default function AdminResidents() {
  const navigate = useNavigate();
  const [residents, setResidents] = useState<DemoResident[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [snackbar, setSnackbar] = useState(false);

  /* -- active filter chips ------------------------------------------ */
  const [zipFilter, setZipFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      params.page = String(page + 1);
      params.page_size = String(pageSize);
      const res = await getAdminResidents(params);
      setResidents(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to load residents", err);
    } finally {
      setLoading(false);
    }
  }, [search, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  /* -- local filtering for zip / lang ------------------------------ */
  const filtered = residents.filter((r) => {
    if (zipFilter && r.zip_code !== zipFilter) return false;
    if (langFilter && r.language !== langFilter) return false;
    return true;
  });

  /* -- unique values for filter chips ------------------------------ */
  const uniqueZips = [...new Set(residents.map((r) => r.zip_code))].sort();
  const uniqueLangs = [...new Set(residents.map((r) => r.language))].sort();

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
          Residents
        </Typography>
        <Button
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={() => setSnackbar(true)}
        >
          Export CSV
        </Button>
      </Box>

      {/* -- search + filters ---------------------------------------- */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3, pb: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by name, email, or zip code..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            slotProps={{
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

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mr: 1, mt: 0.5 }}
            >
              Zip:
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
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ ml: 2, mr: 1, mt: 0.5 }}
            >
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
          {loading && residents.length === 0 ? (
            <Box sx={{ p: 3 }}>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} height={48} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : (
            <DataGrid
              rows={filtered}
              columns={COLUMNS}
              rowCount={total}
              paginationMode="server"
              paginationModel={{ page, pageSize }}
              onPaginationModelChange={(m) => {
                setPage(m.page);
                setPageSize(m.pageSize);
              }}
              pageSizeOptions={[10, 25, 50]}
              loading={loading}
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

      <Snackbar
        open={snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(false)}
      >
        <Alert
          onClose={() => setSnackbar(false)}
          severity="info"
          variant="filled"
        >
          Export started — you will receive a download link shortly.
        </Alert>
      </Snackbar>
    </Box>
  );
}
