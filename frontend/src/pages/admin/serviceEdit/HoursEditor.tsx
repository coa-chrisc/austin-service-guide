import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { rowError, type DayMode, type HoursRow } from "./hoursForm";

const MODE_LABEL: Record<DayMode, string> = {
  none: "Not listed",
  open: "Open",
  closed: "Closed",
  "24h": "24 hours",
  appointment: "By appointment",
  text: "Other (text)",
};

interface Props {
  rows: HoursRow[];
  onChange: (rows: HoursRow[]) => void;
  /** A server error for this location's hours, if any. */
  error?: string;
}

/** One row per day; one opening range per day (the pack's limit). */
export default function HoursEditor({ rows, onChange, error }: Props) {
  const update = (i: number, patch: Partial<HoursRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Hours
      </Typography>
      {rows.map((row, i) => {
        const problem = rowError(row);
        const day = row.day.charAt(0).toUpperCase() + row.day.slice(1);
        return (
          <Grid container spacing={1} key={row.day} sx={{ mb: 1 }} alignItems="flex-start">
            <Grid size={{ xs: 12, sm: 2 }}>
              <Typography variant="body2" sx={{ pt: 1 }}>
                {day}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                select
                fullWidth
                size="small"
                label={`${day} hours`}
                value={row.mode}
                onChange={(e) => update(i, { mode: e.target.value as DayMode })}
              >
                {(Object.keys(MODE_LABEL) as DayMode[]).map((m) => (
                  <MenuItem key={m} value={m}>
                    {MODE_LABEL[m]}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {row.mode === "open" && (
              <>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="time"
                    label="Opens"
                    value={row.open}
                    onChange={(e) => update(i, { open: e.target.value })}
                    error={!!problem && !row.open}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="time"
                    label="Closes"
                    value={row.close}
                    onChange={(e) => update(i, { close: e.target.value })}
                    error={!!problem && !!row.open}
                    helperText={problem ?? (row.open && row.close && row.close < row.open ? "Closes after midnight" : " ")}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </>
            )}
            {row.mode === "text" && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Text shown to residents"
                  value={row.text}
                  onChange={(e) => update(i, { text: e.target.value })}
                  error={!!problem}
                  helperText={problem ?? "Open-now filters treat this day as closed."}
                />
              </Grid>
            )}
          </Grid>
        );
      })}
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
    </>
  );
}
