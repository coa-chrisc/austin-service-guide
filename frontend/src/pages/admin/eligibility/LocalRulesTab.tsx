import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { ApiError, eligibilityImpact, putMatchingRules } from "../../../lib/api";
import type {
  EligibilityPayload,
  ImpactResult,
  MatchingRules,
} from "../../../lib/adminEligibility";
import ImpactList from "./ImpactList";

interface Props {
  payload: EligibilityPayload;
  /** Rules staged for export (export-only mode), if any. */
  stagedRules: MatchingRules | null;
  onApplied: (message: string) => void;
  onStaged: (rules: MatchingRules) => void;
}

const ZIP_RE = /^\d{5}$/;

function label(key: string): string {
  return key.replace(/_/g, " ");
}

/** Layer 2: matching_rules.yaml, the pack's local rules. */
export default function LocalRulesTab({ payload, stagedRules, onApplied, onStaged }: Props) {
  const exportOnly = payload.edit_mode === "export_only";
  const base = stagedRules ?? payload.matching_rules;
  const [draft, setDraft] = useState<MatchingRules>(base);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(base);
    setImpact(null);
  }, [base]);

  const names = useMemo(
    () => Object.fromEntries(payload.services.map((s) => [s.slug, s.name])),
    [payload.services],
  );
  const slugs = useMemo(
    () => payload.services.filter((s) => s.status !== "inactive").map((s) => s.slug),
    [payload.services],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const badZips = draft.high_heat_zips.filter((z) => !ZIP_RE.test(z));

  const edit = (next: MatchingRules) => {
    setDraft(next);
    setImpact(null);
    setError(null);
  };

  const preview = async () => {
    setBusy(true);
    setError(null);
    try {
      setImpact(await eligibilityImpact({ matching_rules: draft }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (exportOnly) {
      onStaged(draft);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await putMatchingRules(draft);
      onApplied("Local rules updated on this server instance.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const slugPicker = (value: string[], onChange: (v: string[]) => void, aria: string) => (
    <Autocomplete
      multiple
      size="small"
      options={slugs}
      value={value}
      onChange={(_, v) => onChange(v)}
      getOptionLabel={(s) => names[s] ?? `${s} (not in catalog)`}
      renderInput={(params) => <TextField {...params} inputProps={{ ...params.inputProps, "aria-label": aria }} />}
    />
  );

  return (
    <Stack spacing={3}>
      {payload.unresolved_slugs.length > 0 && (
        <Alert severity="warning">
          These rules name services that are not in the catalog:{" "}
          {payload.unresolved_slugs.map((u) => `${u.slug} (${u.path})`).join(", ")}
        </Alert>
      )}
      {payload.rules_edited && (
        <Alert severity="info" variant="outlined">
          The rules on this instance differ from the pack on disk. Export the pack to keep them.
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={700}>
            High heat ZIPs
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A resident in one of these ZIPs who works outdoors, has no AC or
            has a chronic condition gets a heat risk flag.
          </Typography>
          <Autocomplete
            multiple
            freeSolo
            size="small"
            options={[]}
            value={draft.high_heat_zips}
            onChange={(_, v) => edit({ ...draft, high_heat_zips: (v as string[]).map((z) => z.trim()) })}
            renderTags={(value, getTagProps) =>
              value.map((z, i) => {
                const { key, ...rest } = getTagProps({ index: i });
                return <Chip key={key} size="small" label={z} color={ZIP_RE.test(z) ? "default" : "error"} {...rest} />;
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="ZIP codes (type and press Enter)"
                error={badZips.length > 0}
                helperText={badZips.length ? "A ZIP is five digits." : " "}
              />
            )}
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={700}>
            Crisis services
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            When the intake detects one of these crisis indicators, these
            services always match and lead the plan.
          </Typography>
          <Stack spacing={2}>
            {Object.entries(draft.crisis_services).map(([indicator, list]) => (
              <Box key={indicator}>
                <Typography variant="subtitle2" sx={{ textTransform: "capitalize", mb: 0.5 }}>
                  {label(indicator)}
                </Typography>
                {slugPicker(list, (v) => edit({ ...draft, crisis_services: { ...draft.crisis_services, [indicator]: v } }), `Crisis services for ${label(indicator)}`)}
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={700}>
            Prevention services on risk flags
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Listed on each risk flag the engine raises. Lines for organizations
            outside the catalog are kept as they are.
          </Typography>
          <Stack spacing={2}>
            {Object.entries(draft.prevention_services).map(([risk, entries]) => {
              const texts = entries.filter((e) => e.text);
              return (
                <Box key={risk}>
                  <Typography variant="subtitle2" sx={{ textTransform: "capitalize", mb: 0.5 }}>
                    {label(risk)}
                  </Typography>
                  {slugPicker(
                    entries.filter((e) => e.service).map((e) => e.service!),
                    (v) =>
                      edit({
                        ...draft,
                        prevention_services: {
                          ...draft.prevention_services,
                          [risk]: [...v.map((service) => ({ service })), ...texts],
                        },
                      }),
                    `Prevention services for ${label(risk)}`,
                  )}
                  {texts.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Also lists: {texts.map((t) => t.text).join(", ")}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={700}>
            Benefit estimates
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Rough monthly values shown on the results page. The first estimate
            naming a matched service wins; other free services count{" "}
            ${payload.engine.default_free_value} a month.
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Label</TableCell>
                  <TableCell>Services</TableCell>
                  <TableCell>Monthly value ($)</TableCell>
                  <TableCell>Applies</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {draft.benefit_estimates.map((est, i) => (
                  <TableRow key={`${est.label}-${i}`}>
                    <TableCell>{est.label}</TableCell>
                    <TableCell>{est.services.map((s) => names[s] ?? s).join(", ")}</TableCell>
                    <TableCell sx={{ width: 140 }}>
                      <TextField
                        size="small"
                        type="number"
                        value={est.monthly_value}
                        inputProps={{ min: 0, step: 1, "aria-label": `Monthly value for ${est.label}` }}
                        onChange={(e) => {
                          const next = [...draft.benefit_estimates];
                          next[i] = { ...est, monthly_value: Math.max(0, Number(e.target.value) || 0) };
                          edit({ ...draft, benefit_estimates: next });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {[est.per_household_member && "per household member", est.only_if_uninsured && "only if uninsured"]
                        .filter(Boolean)
                        .join(", ") || "flat"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          {impact ? (
            <ImpactList impact={impact} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              {dirty
                ? "Preview the effect on the demo personas before you apply these rules."
                : "No changes yet."}
            </Typography>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button onClick={() => edit(base)} disabled={!dirty || busy}>
              Reset
            </Button>
            <Button variant="outlined" onClick={preview} disabled={!dirty || busy || badZips.length > 0}>
              Preview impact
            </Button>
            <Button variant="contained" onClick={apply} disabled={!dirty || busy || !impact || badZips.length > 0}>
              {exportOnly ? "Stage for export" : "Apply to this instance"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
