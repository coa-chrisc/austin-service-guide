import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import RuleIcon from "@mui/icons-material/Rule";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { getAdminEligibilityRules, type EligibilityRule } from "../../lib/api";

const CATEGORY_COLORS: Record<string, string> = {
  food: "#43A047",
  housing: "#1E88E5",
  healthcare: "#E53935",
  childcare: "#8E24AA",
  veterans: "#546E7A",
  utilities: "#00ACC1",
  senior: "#5D4037",
  disability: "#7CB342",
  immigration: "#EC407A",
  emergency: "#D32F2F",
};

export default function AdminEligibility() {
  const [rules, setRules] = useState<EligibilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [snackbar, setSnackbar] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminEligibilityRules();
        if (cancelled) return;
        setRules(res);
      } catch (err) {
        console.error("Failed to load eligibility rules", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_active: !r.is_active } : r)),
    );
    const rule = rules.find((r) => r.id === id);
    setSnackbar(
      `Rule "${rule?.name}" ${rule?.is_active ? "paused" : "reactivated"}`,
    );
  };

  const categories = useMemo(
    () => Array.from(new Set(rules.map((r) => r.category))).sort(),
    [rules],
  );

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (categoryFilter !== "all" && r.category !== categoryFilter)
        return false;
      if (
        search &&
        !`${r.name} ${r.criteria}`.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [rules, search, categoryFilter]);

  const totalActive = rules.filter((r) => r.is_active).length;
  const totalHits = rules.reduce((sum, r) => sum + r.hits_30d, 0);

  const columns: GridColDef<EligibilityRule>[] = [
    {
      field: "name",
      headerName: "Rule",
      flex: 1.2,
      minWidth: 240,
      renderCell: (params) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {params.row.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {params.row.criteria}
          </Typography>
        </Box>
      ),
    },
    {
      field: "category",
      headerName: "Category",
      width: 130,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          sx={{
            bgcolor: CATEGORY_COLORS[params.value] ?? "#999",
            color: "#fff",
            fontWeight: 600,
            textTransform: "capitalize",
          }}
        />
      ),
    },
    {
      field: "services",
      headerName: "Services Gated",
      flex: 1,
      minWidth: 220,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ py: 0.5 }}>
          {params.value.slice(0, 2).map((s: string) => (
            <Chip key={s} label={s} size="small" variant="outlined" />
          ))}
          {params.value.length > 2 && (
            <Chip
              label={`+${params.value.length - 2}`}
              size="small"
              variant="outlined"
            />
          )}
        </Stack>
      ),
      sortable: false,
    },
    {
      field: "hits_30d",
      headerName: "Hits (30d)",
      width: 110,
      type: "number",
      align: "right",
      headerAlign: "right",
    },
    {
      field: "last_updated",
      headerName: "Last Updated",
      width: 130,
      valueFormatter: (value: string) =>
        value ? new Date(value).toLocaleDateString() : "—",
    },
    {
      field: "is_active",
      headerName: "Active",
      width: 100,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => (
        <Switch
          checked={params.value}
          onChange={() => handleToggle(params.row.id)}
          size="small"
        />
      ),
      sortable: false,
    },
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <RuleIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Eligibility Rules
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Rules the matching engine evaluates against the resident profile.
        Toggling a rule pauses it from future matches.
      </Typography>

      {/* -- summary chips ----------------------------------------- */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Card sx={{ flex: 1, minWidth: 0 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Total Rules
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {loading ? <Skeleton width={60} /> : rules.length}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 0 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Active
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CheckCircleIcon color="success" fontSize="small" />
              <Typography variant="h4" fontWeight={700}>
                {loading ? <Skeleton width={60} /> : totalActive}
              </Typography>
            </Box>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 0 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Paused
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <PauseCircleIcon color="warning" fontSize="small" />
              <Typography variant="h4" fontWeight={700}>
                {loading ? <Skeleton width={60} /> : rules.length - totalActive}
              </Typography>
            </Box>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 0 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Total Matches (30d)
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {loading ? <Skeleton width={60} /> : totalHits.toLocaleString()}
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* -- filters --------------------------------------------------- */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search rules…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1 }}
        />
        <TextField
          select
          size="small"
          label="Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">All categories</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c} value={c} sx={{ textTransform: "capitalize" }}>
              {c}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {/* -- grid ------------------------------------------------------ */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ p: 3 }}>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} height={60} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : (
            <DataGrid
              rows={filtered}
              columns={columns}
              getRowHeight={() => 70}
              pageSizeOptions={[10, 25]}
              disableRowSelectionOnClick
              sx={{ border: "none" }}
              autoHeight
            />
          )}
        </CardContent>
      </Card>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
      >
        <Alert
          onClose={() => setSnackbar(null)}
          severity="info"
          variant="filled"
        >
          {snackbar}
        </Alert>
      </Snackbar>
    </Box>
  );
}
