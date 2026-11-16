import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { ServiceSource } from "@/types";
import { fieldError, type ServiceForm } from "./serviceForm";

interface Props {
  form: ServiceForm;
  set: (patch: Partial<ServiceForm>) => void;
  sources: ServiceSource[];
  errors: Record<string, string[]>;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function VerificationTab({ form, set, sources, errors }: Props) {
  const dateErr = fieldError(errors, "last_verified_date");
  const byErr = fieldError(errors, "verified_by");
  const verified = !!(form.last_verified_date && form.verified_by.trim());
  return (
    <Box>
      <Alert severity={verified ? "success" : "warning"} variant="outlined" sx={{ mb: 3 }}>
        {verified
          ? "This entry is marked verified."
          : "Unverified. Fill in both fields only after a person has confirmed the entry with the provider."}
      </Alert>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            type="date"
            label="Last verified"
            value={form.last_verified_date}
            onChange={(e) => set({ last_verified_date: e.target.value })}
            inputProps={{ max: today() }}
            InputLabelProps={{ shrink: true }}
            error={!!dateErr}
            helperText={dateErr ?? "The date someone confirmed it with the provider."}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Verified by"
            value={form.verified_by}
            onChange={(e) => set({ verified_by: e.target.value })}
            error={!!byErr}
            helperText={byErr ?? "A role or team, not a personal name (for example \"211 resource team\")."}
          />
        </Grid>
      </Grid>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 4, mb: 1 }}>
        Sources
      </Typography>
      {sources.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No sources recorded. Sources are kept as loaded; edit them in the pack's YAML.
        </Typography>
      ) : (
        sources.map((s, i) => (
          <Box key={`${s.url}-${i}`} sx={{ mb: 1.5 }}>
            <Link href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title || s.url}
            </Link>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {[s.retrieved_at && `Retrieved ${s.retrieved_at}`, s.fields?.length && `Fields: ${s.fields.join(", ")}`, s.note]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          </Box>
        ))
      )}
    </Box>
  );
}
