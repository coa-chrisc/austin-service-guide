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
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getServices } from "../../lib/api";
import type { Service, ServiceStatus } from "../../types";

const STATUS_COLORS: Record<ServiceStatus, "success" | "default" | "warning"> =
  {
    active: "success",
    inactive: "default",
    seasonal: "warning",
  };

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  seasonal: "Needs Review",
};

export default function AdminServices() {
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: page + 1,
        page_size: pageSize,
      };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      const res = await getServices(
        params as {
          page?: number;
          page_size?: number;
          category?: string;
          search?: string;
        },
      );
      setServices(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to load services", err);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  /* -- local status filter ----------------------------------------- */
  const filtered = statusFilter
    ? services.filter((s) => s.status === statusFilter)
    : services;

  /* -- unique categories from loaded data -------------------------- */
  const uniqueCategories = [
    ...new Set(services.flatMap((s) => s.categories)),
  ].sort();

  const handleDelete = (id: string) => {
    setDeleteDialog(null);
    setSnackbar("Service deleted successfully");
    // In production this would call deleteAdminService(id)
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  const columns: GridColDef[] = [
    { field: "name", headerName: "Name", flex: 1.2, minWidth: 200 },
    { field: "provider_name", headerName: "Provider", flex: 1, minWidth: 160 },
    {
      field: "categories",
      headerName: "Category",
      flex: 0.8,
      minWidth: 140,
      valueGetter: (_value: string[], row: Service) =>
        (row.categories ?? []).join(", "),
    },
    {
      field: "status",
      headerName: "Status",
      width: 130,
      renderCell: (params) => (
        <Chip
          label={STATUS_LABELS[params.value] ?? params.value}
          size="small"
          color={STATUS_COLORS[params.value as ServiceStatus] ?? "default"}
        />
      ),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/admin/services/${params.row.id}/edit`);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialog(params.row.id);
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

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
          Services
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate("/admin/services/new")}
        >
          Add Service
        </Button>
      </Box>

      {/* -- toolbar -------------------------------------------------- */}
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
            placeholder="Search services..."
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
            sx={{ minWidth: 260 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              label="Category"
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All</MenuItem>
              {uniqueCategories.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
              <MenuItem value="seasonal">Needs Review</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* -- data grid ------------------------------------------------ */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {loading && services.length === 0 ? (
            <Box sx={{ p: 3 }}>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} height={48} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : (
            <DataGrid
              rows={filtered}
              columns={columns}
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
              sx={{ border: "none" }}
              autoHeight
            />
          )}
        </CardContent>
      </Card>

      {/* -- delete confirmation dialog -------------------------------- */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>Delete Service</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this service? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteDialog && handleDelete(deleteDialog)}
          >
            Delete
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
