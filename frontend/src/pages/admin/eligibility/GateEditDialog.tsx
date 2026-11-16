import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Typography from "@mui/material/Typography";

import { ApiError, eligibilityImpact, updateAdminService } from "../../../lib/api";
import type {
  EligibilityServiceRow,
  GateId,
  GateInfo,
  ImpactResult,
} from "../../../lib/adminEligibility";
import ImpactList from "./ImpactList";

interface Props {
  service: EligibilityServiceRow | null;
  gates: GateInfo[];
  exportOnly: boolean;
  onClose: () => void;
  /** Applied in memory (in_memory mode). */
  onApplied: (message: string) => void;
  /** Staged for export (export_only mode). */
  onStaged: (slug: string, gates: GateId[]) => void;
}

/**
 * Edit one service's gates. Staff must preview the persona impact before
 * the change can be applied or staged.
 */
export default function GateEditDialog({
  service,
  gates,
  exportOnly,
  onClose,
  onApplied,
  onStaged,
}: Props) {
  const [selected, setSelected] = useState<GateId[]>([]);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(service ? [...service.eligibility_requires] : []);
    setImpact(null);
    setError(null);
  }, [service]);

  if (!service) return null;

  const unchanged =
    selected.length === service.eligibility_requires.length &&
    selected.every((g) => service.eligibility_requires.includes(g));

  const toggle = (id: GateId) => {
    setImpact(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const preview = async () => {
    setBusy(true);
    setError(null);
    try {
      setImpact(
        await eligibilityImpact({
          services: { [service.slug]: { eligibility_requires: selected } },
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (exportOnly) {
      onStaged(service.slug, selected);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAdminService(service.id, { eligibility_requires: selected });
      onApplied(`Gates for ${service.name} updated on this server instance.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Gates for {service.name}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Eligibility summary: {service.eligibility_summary || "none"}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A resident must meet every gate you tick. Gate a service only when
          its own published criteria clearly restrict who can use it.
        </Typography>
        <FormGroup>
          {gates.map((g) => (
            <FormControlLabel
              key={g.id}
              control={
                <Checkbox
                  checked={selected.includes(g.id)}
                  onChange={() => toggle(g.id)}
                />
              }
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
        <Divider sx={{ my: 2 }} />
        {impact ? (
          <ImpactList impact={impact} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Preview the effect on the demo personas before you{" "}
            {exportOnly ? "stage" : "apply"} this change.
          </Typography>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="outlined" onClick={preview} disabled={busy || unchanged}>
          Preview impact
        </Button>
        <Button
          variant="contained"
          onClick={apply}
          disabled={busy || unchanged || !impact}
          startIcon={busy ? <CircularProgress size={16} /> : undefined}
        >
          {exportOnly ? "Stage for export" : "Apply to this instance"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
