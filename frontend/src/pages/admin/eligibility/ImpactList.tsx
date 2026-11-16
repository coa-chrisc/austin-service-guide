import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

import { OUTCOME_LABEL, type ImpactResult } from "../../../lib/adminEligibility";

/** Per-persona before/after diff from POST /admin/eligibility/impact. */
export default function ImpactList({ impact }: { impact: ImpactResult }) {
  const touched = impact.personas.filter(
    (p) => p.gained.length || p.lost.length || p.changed.length,
  );
  if (!touched.length) {
    return (
      <Alert severity="info" variant="outlined">
        No demo persona's results change with this edit.
      </Alert>
    );
  }
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        {touched.length} of {impact.personas.length} demo personas would see
        different results:
      </Typography>
      {touched.map((p) => (
        <Box key={p.persona_id}>
          <Typography variant="subtitle2" fontWeight={600}>
            {p.label}
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {p.lost.map((s) => (
              <Chip key={`l-${s.slug}`} size="small" color="error" variant="outlined" label={`Loses ${s.name}`} />
            ))}
            {p.gained.map((s) => (
              <Chip key={`g-${s.slug}`} size="small" color="success" variant="outlined" label={`Gains ${s.name}`} />
            ))}
            {p.changed.map((s) => (
              <Chip
                key={`c-${s.slug}`}
                size="small"
                color="warning"
                variant="outlined"
                label={`${s.name}: ${OUTCOME_LABEL[s.before!]} → ${OUTCOME_LABEL[s.after!]}`}
              />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
