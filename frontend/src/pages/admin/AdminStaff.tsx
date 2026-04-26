import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminStaff } from "../../lib/api";
import type { StaffMember, StaffRole } from "../../types";

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

const ROLES: StaffRole[] = ["super_admin", "admin", "manager", "viewer"];

/* -- columns ------------------------------------------------------ */
const COLUMNS: GridColDef[] = [
  { field: "name", headerName: "Name", flex: 1, minWidth: 160 },
  { field: "email", headerName: "Email", flex: 1.2, minWidth: 200 },
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
  { field: "department", headerName: "Department", width: 160 },
  {
    field: "last_login",
    headerName: "Last Login",
    width: 160,
    valueFormatter: (value: string) => {
      if (!value) return "Never";
      return new Date(value).toLocaleString();
    },
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  /* -- dialog form state ------------------------------------------ */
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<StaffRole>("viewer");
  const [newDepartment, setNewDepartment] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminStaff();
        if (cancelled) return;
        setStaff(res);
      } catch (err) {
        console.error("Failed to load staff", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = () => {
    if (!newEmail) return;
    const newMember: StaffMember = {
      id: crypto.randomUUID(),
      name: newName || newEmail.split("@")[0],
      email: newEmail,
      role: newRole,
      department: newDepartment,
      last_login: "",
      is_active: true,
    };
    setStaff((prev) => [newMember, ...prev]);
    setDialogOpen(false);
    setNewEmail("");
    setNewRole("viewer");
    setNewDepartment("");
    setNewName("");
    setSnackbar("Staff member added successfully");
  };

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
          Staff Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setDialogOpen(true)}
        >
          Add Staff
        </Button>
      </Box>

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

      {/* -- add staff dialog ---------------------------------------- */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Staff Member</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}
        >
          <TextField
            label="Name"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            sx={{ mt: 1 }}
          />
          <TextField
            label="Email"
            fullWidth
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <FormControl fullWidth>
            <InputLabel>Role</InputLabel>
            <Select
              value={newRole}
              label="Role"
              onChange={(e) => setNewRole(e.target.value as StaffRole)}
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Department"
            fullWidth
            value={newDepartment}
            onChange={(e) => setNewDepartment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!newEmail}>
            Add
          </Button>
        </DialogActions>
      </Dialog>

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
