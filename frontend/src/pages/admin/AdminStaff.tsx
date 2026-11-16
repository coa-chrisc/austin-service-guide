import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminStaff } from "../../lib/api";
import type { StaffMember } from "../../types";
import { longDay } from "./reports/format";

/* -- role chip colors --------------------------------------------- */
const ROLE_COLORS: Record<string, "error" | "primary" | "success" | "default"> =
  {
    super_admin: "error",
    admin: "primary",
    manager: "success",
    viewer: "default",
  };

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  viewer: "Viewer",
};

/* -- columns ------------------------------------------------------ */
const COLUMNS: GridColDef[] = [
  { field: "name", headerName: "Name", flex: 0.8, minWidth: 150 },
  { field: "email", headerName: "Email", flex: 1, minWidth: 200 },
  {
    field: "role",
    headerName: "Role",
    width: 140,
    renderCell: (params) => (
      <Chip
        label={ROLE_LABELS[params.value] ?? params.value}
        size="small"
        color={ROLE_COLORS[params.value] ?? "default"}
      />
    ),
  },
  { field: "department", headerName: "Department", flex: 1.2, minWidth: 200 },
  {
    field: "last_login",
    headerName: "Last login",
    width: 140,
    valueFormatter: (value: string) => (value ? longDay(value) : "Never"),
  },
  {
    field: "is_active",
    headerName: "Status",
    width: 100,
    renderCell: (params) => (
      <Chip
        label={params.value ? "Active" : "Inactive"}
        size="small"
        color={params.value ? "success" : "default"}
        variant="outlined"
      />
    ),
  },
];

export default function AdminStaff() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminStaff();
        if (!cancelled) setStaff(res);
      } catch (err) {
        console.error("Failed to load staff", err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            Staff Management
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Sample staff accounts and the four console roles.
          </Typography>
        </Box>
        <Tooltip title="Staff are managed in Entra ID in a real deployment">
          <span>
            <Button variant="contained" startIcon={<PersonAddIcon />} disabled>
              Add Staff
            </Button>
          </span>
        </Tooltip>
      </Box>

      {loadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Staff could not be loaded. Refresh the page to try again.
        </Alert>
      )}

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
              rows={staff}
              columns={COLUMNS}
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
