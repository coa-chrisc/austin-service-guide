import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { ApiError, eligibilityImpact } from "@/lib/api";
import type { GateId, GateInfo, ImpactResult } from "@/lib/adminEligibility";
import ImpactList from "../eligibility/ImpactList";
import { fieldError, type ServiceForm } from "./serviceForm";

interface Props {
  form: ServiceForm;
  set: (patch: Partial<ServiceForm>) => void;
  gates: GateInfo[];
  errors: Record<string, string[]>;
  /** The slug the service is saved under (null for a new service). */
  savedSlug: string | null;
}

export default function EligibilityTab({ form, set, gates, errors, savedSlug }: Props) {
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const err = fieldError(errors, "eligibility_summary");
  const gateErr = fieldError(errors, "eligibility_requires");

  const toggle = (id: GateId) => {
    setImpact(null);
    const has = form.eligibility_requires.includes(id);
    set({
      eligibility_requires: has
        ? form.eligibility_requires.filter((g) => g !== id)
        : [...form.eligibility_requires, id],
    });
  };

  const preview = async () => {
    if (!savedSlug) return;
    setError(null);
    try {
      setImpact(
        await eligibilityImpact({
          services: { [savedSlug]: { eligibility_requires: form.eligibility_requires as GateId[] } },
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Preview failed.");
    }
  };

  return (
    <Box>
      <TextField
        fullWidth
        multiline
        rows={3}
        label="Eligibility summary"
        value={form.eligibility_summary}
        onChange={(e) => set({ eligibility_summary: e.target.value })}
        error={!!err}
        helperText={err ?? "Who qualifies, in plain words. Residents see its first sentence in a \"check eligibility\" note."}
        sx={{ mb: 3 }}
      />
      <Typography variant="subtitle1" fontWeight={600}>
        Gates the matching engine checks
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        A resident must meet every gate you tick. Gate a service only when its
        published criteria clearly restrict who can use it; a service open to
        all with a priority group stays ungated. Income, residency and exact
        age are not gates: put them in the summary.
      </Typography>
      <FormGroup sx={{ mb: 2 }}>
        {gates.map((g) => (
          <FormControlLabel
            key={g.id}
            control={<Checkbox checked={form.eligibility_requires.includes(g.id)} onChange={() => toggle(g.id)} />}
            label={
              <span>
                <strong>{g.label}</strong>
                <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  Met when {g.satisfied_when}. Ruled out when {g.contradicted_when}.
                </Typography>
              </span>
            }
            sx={{ alignItems: "flex-start", mb: 1, "& .MuiCheckbox-root": { pt: 0.5 } }}
          />
        ))}
      </FormGroup>
      {gateErr && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {gateErr}
        </Alert>
      )}
      {savedSlug ? (
        <Box>
          <Button variant="outlined" onClick={preview}>
            Preview effect on demo personas
          </Button>
          {impact && (
            <Box sx={{ mt: 2 }}>
              <ImpactList impact={impact} />
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          After you create the service, the Eligibility page can test it against the demo personas.
        </Typography>
      )}
    </Box>
  );
}
