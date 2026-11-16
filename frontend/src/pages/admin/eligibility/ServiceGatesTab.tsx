import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import type {
  EligibilityPayload,
  EligibilityServiceRow,
  GateId,
} from "../../../lib/adminEligibility";
import GateEditDialog from "./GateEditDialog";

type Filter = "all" | "gated" | "review" | "staged";

interface Props {
  payload: EligibilityPayload;
  staged: Record<string, GateId[]>;
  onApplied: (message: string) => void;
  onStaged: (slug: string, gates: GateId[]) => void;
}

/** Layer 1: the hard gates each service's eligibility_requires lists. */
export default function ServiceGatesTab({ payload, staged, onApplied, onStaged }: Props) {
  const [filter, setFilter] = useState<Filter>("gated");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EligibilityServiceRow | null>(null);
  const exportOnly = payload.edit_mode === "export_only";
  const gateLabel = useMemo(
    () => Object.fromEntries(payload.gates.map((g) => [g.id, g.label])) as Record<GateId, string>,
    [payload.gates],
  );

  // Staged (export-only) gate lists replace the loaded ones for display.
  const rows = useMemo(
    () =>
      payload.services.map((s) =>
        staged[s.slug] ? { ...s, eligibility_requires: staged[s.slug] } : s,
      ),
    [payload.services, staged],
  );

  const filtered = rows.filter((s) => {
    if (filter === "gated" && !s.eligibility_requires.length) return false;
    if (filter === "review" && !s.restrictive_words.length) return false;
    if (filter === "staged" && !staged[s.slug]) return false;
    const q = search.trim().toLowerCase();
    return !q || `${s.name} ${s.slug} ${s.eligibility_summary}`.toLowerCase().includes(q);
  });

  const columns: GridColDef<EligibilityServiceRow>[] = [
    {
      field: "name",
      headerName: "Service",
      flex: 1.2,
      minWidth: 220,
      renderCell: (p) => (
        <Box sx={{ py: 1 }}>
          <Typography variant="body2" fontWeight={600}>
            {p.row.name}
            {p.row.status === "inactive" && " (inactive)"}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "normal" }}>
            {p.row.eligibility_summary}
          </Typography>
        </Box>
      ),
    },
    {
      field: "eligibility_requires",
      headerName: "Gates (all must hold)",
      flex: 1,
      minWidth: 220,
      sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ py: 1 }}>
          {p.row.eligibility_requires.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              Ungated
            </Typography>
          )}
          {p.row.eligibility_requires.map((g) => (
            <Chip key={g} size="small" label={gateLabel[g] ?? g} />
          ))}
          {staged[p.row.slug] && <Chip size="small" color="warning" label="Staged" />}
          {p.row.restrictive_words.length > 0 && (
            <Tooltip title="The summary uses restrictive wording but the service has no gate. Check the provider's published criteria; open-to-all services with a priority group stay ungated.">
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                label={`Review: "${p.row.restrictive_words.join('", "')}"`}
              />
            </Tooltip>
          )}
        </Stack>
      ),
    },
    {
      field: "verified",
      headerName: "Verified",
      width: 110,
      renderCell: (p) => (
        <Chip size="small" variant="outlined" label={p.row.verified ? "Verified" : "Unverified"} color={p.row.verified ? "success" : "default"} />
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 110,
      sortable: false,
      renderCell: (p) => (
        <Button size="small" onClick={() => setEditing(p.row)}>
          Edit gates
        </Button>
      ),
    },
  ];

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            The gates
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A gated service is dropped when the profile rules it out, and kept at
            low confidence with a "check eligibility" note when the profile
            cannot tell. The descriptions below are generated from the engine
            code.
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Gate</TableCell>
                  <TableCell>Met when</TableCell>
                  <TableCell>Ruled out when</TableCell>
                  <TableCell align="right">Services</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payload.gates.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {g.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {g.id}
                      </Typography>
                    </TableCell>
                    <TableCell>{g.satisfied_when}</TableCell>
                    <TableCell>{g.contradicted_when}</TableCell>
                    <TableCell align="right">{g.services.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="Search services"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 240 }}
            />
            <TextField
              select
              size="small"
              label="Show"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="gated">Gated services</MenuItem>
              <MenuItem value="review">Ungated, wording suggests a restriction</MenuItem>
              {exportOnly && <MenuItem value="staged">Staged changes</MenuItem>}
              <MenuItem value="all">All services</MenuItem>
            </TextField>
          </Stack>
          <DataGrid
            rows={filtered}
            columns={columns}
            getRowHeight={() => "auto"}
            disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            autoHeight
          />
        </CardContent>
      </Card>

      <GateEditDialog
        service={editing}
        gates={payload.gates}
        exportOnly={exportOnly}
        onClose={() => setEditing(null)}
        onApplied={(msg) => {
          setEditing(null);
          onApplied(msg);
        }}
        onStaged={(slug, gates) => {
          setEditing(null);
          onStaged(slug, gates);
        }}
      />
    </Stack>
  );
}
