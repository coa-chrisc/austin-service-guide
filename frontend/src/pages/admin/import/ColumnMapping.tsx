import { useEffect, useReducer, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

import type { DraftParams, ImportConfig, InspectResult } from "./importApi";
import { DROP, canBuild, emptyMapping, keptCount, mappingReducer, toMapping } from "./mappingReducer";

interface Props {
  inspect: InspectResult;
  config: ImportConfig;
  busy: boolean;
  /** The last confirmed settings, restored when the user comes back to this step. */
  previous: DraftParams | null;
  onChangeTable: (table: string, headerRow?: number) => void;
  onConfirm: (params: DraftParams) => void;
}

export default function ColumnMapping({ inspect, config, busy, previous, onChangeTable, onConfirm }: Props) {
  const table = inspect.tables.find((t) => t.id === inspect.default_table) ?? inspect.tables[0];
  const [state, dispatch] = useReducer(mappingReducer, emptyMapping);
  const [useModel, setUseModel] = useState(previous?.use_model ?? false);
  const [group, setGroup] = useState(previous?.group ?? true);
  const labels = Object.fromEntries(inspect.fields.map((f) => [f.value, f.label]));

  useEffect(() => {
    dispatch({ type: "init", columns: table.columns });
    if (previous && previous.table === table.id && previous.header_row === table.header_row) {
      for (const [index, choice] of Object.entries(previous.mapping)) {
        dispatch({ type: "set", index: Number(index), choice });
      }
    }
  }, [table, previous]);

  const examples = (index: number) =>
    table.preview
      .map((row) => row.cells[index])
      .filter(Boolean)
      .slice(0, 2);

  const ready = canBuild(state);

  return (
    <Stack spacing={2}>
      {inspect.notes.length > 0 && (
        <Alert severity="info">
          Ignored while reading: {inspect.notes.join("; ")}.
        </Alert>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {inspect.tables.length > 1 && (
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="import-table-label">Sheet or table</InputLabel>
            <Select
              labelId="import-table-label"
              label="Sheet or table"
              value={table.id}
              disabled={busy}
              onChange={(e) => onChangeTable(String(e.target.value))}
            >
              {inspect.tables.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name} ({t.row_count.toLocaleString()} rows)
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="import-header-label">Header row</InputLabel>
          <Select
            labelId="import-header-label"
            label="Header row"
            value={table.header_row}
            disabled={busy}
            onChange={(e) => onChangeTable(table.id, Number(e.target.value))}
          >
            {table.header_choices.map((c) => (
              <MenuItem key={c.row} value={c.row}>
                Row {c.source_row} of the file
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {table.row_count.toLocaleString()} data rows. Only columns you include are read; dropped columns never leave
        this step. Columns that look like contact people, direct lines, personal emails or notes are dropped, and
        columns the matcher does not recognise are dropped until you choose a field. Values shown as [hidden] come
        from columns dropped for privacy.
      </Typography>

      <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
        <Table size="small" aria-label="Column mapping">
          <TableHead>
            <TableRow>
              <TableCell scope="col">Column</TableCell>
              <TableCell scope="col">Example values</TableCell>
              <TableCell scope="col" sx={{ minWidth: 220 }}>Include as</TableCell>
              <TableCell scope="col">Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.columns.map((col) => {
              const labelId = `import-col-${col.index}`;
              const dropped = col.choice === DROP;
              return (
                <TableRow key={col.index}>
                  <TableCell component="th" scope="row" id={labelId}>
                    <Typography variant="body2" fontWeight={600}>
                      {col.header}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {examples(col.index).map((value, i) => (
                      <Typography key={i} variant="body2" sx={{ maxWidth: 280, overflowWrap: "anywhere" }}>
                        {value}
                      </Typography>
                    ))}
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      fullWidth
                      value={col.choice}
                      inputProps={{ "aria-labelledby": labelId }}
                      disabled={busy}
                      onChange={(e) => dispatch({ type: "set", index: col.index, choice: String(e.target.value) })}
                    >
                      <MenuItem value={DROP}>Drop this column</MenuItem>
                      {inspect.fields.map((f) => (
                        <MenuItem key={f.value} value={f.value}>
                          {f.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {dropped ? "Dropped" : `Included as ${labels[col.choice] ?? col.choice}`}
                    </Typography>
                    {col.choice === col.proposed && (
                      <Typography variant="body2" color="text.secondary">
                        {col.reason}
                      </Typography>
                    )}
                    {!dropped && col.sensitive && (
                      <Typography variant="body2" color="warning.dark">
                        This column was dropped for privacy. Include it only if it holds no one&apos;s personal details.
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Box>
        <FormControlLabel
          control={<Checkbox checked={group} onChange={(e) => setGroup(e.target.checked)} />}
          label="Combine rows that are the same service at different locations"
        />
        {config.model_available && (
          <FormControlLabel
            control={<Checkbox checked={useModel} onChange={(e) => setUseModel(e.target.checked)} />}
            label="Ask the model to suggest hours, address parts, categories and eligibility (included columns only, after filtering)"
          />
        )}
      </Box>

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <Button
          variant="contained"
          disableElevation
          disabled={!ready || busy}
          onClick={() =>
            onConfirm({ table: table.id, header_row: table.header_row, mapping: toMapping(state), use_model: useModel, group })
          }
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Build drafts from {keptCount(state)} column{keptCount(state) === 1 ? "" : "s"}
        </Button>
        <Button onClick={() => dispatch({ type: "reset" })} disabled={busy} sx={{ textTransform: "none", fontWeight: 600 }}>
          Reset to proposed mapping
        </Button>
        {!ready && (
          <Typography variant="body2" role="status">
            Include a column as Organisation or Service or program name to continue.
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}
