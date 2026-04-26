import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import SearchIcon from "@mui/icons-material/Search";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminAuditLog } from "../../lib/api";
import type { AuditLogEntry } from "../../types";

/* -- action color map --------------------------------------------- */
const ACTION_COLORS: Record<
  string,
  "primary" | "success" | "warning" | "error" | "info" | "default"
> = {
  create: "success",
  update: "primary",
  delete: "error",
  login: "info",
  export: "warning",
  view: "default",
};

function actionColor(
  action: string,
): "primary" | "success" | "warning" | "error" | "info" | "default" {
  const lower = action.toLowerCase();
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "default";
}

/* -- columns ------------------------------------------------------ */
const COLUMNS: GridColDef[] = [
  {
    field: "timestamp",
    headerName: "Timestamp",
    width: 180,
    valueFormatter: (value: string) => {
      if (!value) return "";
      return new Date(value).toLocaleString();
    },
  },
  {
    field: "actor",
    headerName: "Staff",
    width: 160,
  },
  {
    field: "action",
    headerName: "Action",
    width: 140,
    renderCell: (params) => (
      <Chip
        label={params.value}
        size="small"
        color={actionColor(params.value)}
      />
    ),
  },
  {
    field: "resource_type",
    headerName: "Resource",
    width: 140,
  },
  {
    field: "details",
    headerName: "Details",
    flex: 1,
    minWidth: 250,
  },
];

export default function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffFilter, setStaffFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminAuditLog();
        if (cancelled) return;
        // Handle both paginated and flat array response
        if (Array.isArray(res)) {
          setEntries(res);
        } else {
          setEntries((res as { items: AuditLogEntry[] }).items ?? []);
        }
      } catch (err) {
        console.error("Failed to load audit log", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* -- unique values for filters ---------------------------------- */
  const uniqueStaff = [...new Set(entries.map((e) => e.actor))].sort();
  const uniqueActions = [...new Set(entries.map((e) => e.action))].sort();

  /* -- filtered entries ------------------------------------------- */
  const filtered = entries.filter((e) => {
    if (staffFilter && e.actor !== staffFilter) return false;
    if (actionFilter && e.action !== actionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.details?.toLowerCase().includes(q) &&
        !e.resource_type?.toLowerCase().includes(q) &&
        !e.actor?.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Audit Log
      </Typography>

      {/* -- filter bar ---------------------------------------------- */}
      <Card sx={{ mb: 3 }}>
        <CardContent
          sx={{
            p: 3,
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <TextField
            size="small"
            placeholder="Search details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Staff Member</InputLabel>
            <Select
              value={staffFilter}
              label="Staff Member"
              onChange={(e) => setStaffFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {uniqueStaff.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Action Type</InputLabel>
            <Select
              value={actionFilter}
              label="Action Type"
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {uniqueActions.map((a) => (
                <MenuItem key={a} value={a}>
                  {a}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* -- data grid ----------------------------------------------- */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ p: 3 }}>
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} height={44} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : (
            <DataGrid
              rows={filtered}
              columns={COLUMNS}
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
                sorting: { sortModel: [{ field: "timestamp", sort: "desc" }] },
              }}
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
