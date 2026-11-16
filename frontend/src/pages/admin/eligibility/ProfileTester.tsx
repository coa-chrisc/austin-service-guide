import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { ApiError, evaluateEligibility } from "../../../lib/api";
import {
  OUTCOME_LABEL,
  SHOWN_OUTCOMES,
  type EligibilityOverrides,
  type EligibilityPayload,
  type EvaluateResult,
  type GateState,
  type Outcome,
} from "../../../lib/adminEligibility";
import type { ResidentProfile } from "../../../types";

type Profile = Partial<ResidentProfile>;

const TRI_FIELDS: [keyof ResidentProfile, string][] = [
  ["has_children", "Has children"],
  ["veteran_status", "Veteran"],
  ["has_disability", "Has a disability"],
  ["is_refugee_or_immigrant", "Refugee or immigrant"],
  ["is_outdoor_worker", "Works outdoors"],
  ["has_ac", "Has air conditioning"],
  ["has_chronic_conditions", "Chronic health condition"],
];

const TEXT_FIELDS: [keyof ResidentProfile, string, string[]][] = [
  ["age_range", "Age range", ["18-24", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"]],
  ["housing_situation", "Housing", ["renting", "own_home", "unstable", "homeless"]],
  ["employment_status", "Employment", ["full-time", "part-time", "unemployed", "retired", "disabled", "gig_economy"]],
  ["insurance_status", "Insurance", ["uninsured", "employer", "medicaid", "medicare", "marketplace"]],
];

function gateChip(state: GateState): { color: "success" | "warning" | "error"; word: string } {
  if (state === true) return { color: "success", word: "met" };
  if (state === false) return { color: "error", word: "ruled out" };
  return { color: "warning", word: "can't tell" };
}

const EMPTY: Profile = { immediate_needs: [], languages_spoken: ["en"], crisis_indicators: [] };

function triValue(v: unknown): string {
  return v === true ? "yes" : v === false ? "no" : "unknown";
}

interface Props {
  payload: EligibilityPayload;
  staged: EligibilityOverrides | null;
}

/** Run a synthetic profile through the same engine residents get. */
export default function ProfileTester({ payload, staged }: Props) {
  const [presetId, setPresetId] = useState("");
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [useStaged, setUseStaged] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [result, setResult] = useState<EvaluateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needOptions = useMemo(() => Object.keys(payload.engine.need_keywords).sort(), [payload.engine]);
  const crisisOptions = useMemo(() => Object.keys(payload.matching_rules.crisis_services), [payload.matching_rules]);
  const incomeOptions = useMemo(
    () => [...payload.engine.low_income_brackets, "$30,000-$40,000", "$40,000-$50,000", "$50,000-$60,000", "$60,000-$80,000"],
    [payload.engine],
  );
  const gateLabel = useMemo(() => Object.fromEntries(payload.gates.map((g) => [g.id, g.label])), [payload.gates]);

  const set = (patch: Profile) => {
    setProfile((p) => ({ ...p, ...patch }));
    setResult(null);
  };

  const loadPreset = (id: string) => {
    setPresetId(id);
    const preset = payload.personas.find((p) => p.id === id);
    setProfile(preset ? { ...preset.profile } : EMPTY);
    setResult(null);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await evaluateEligibility(profile, useStaged && staged ? staged : undefined));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The test failed.");
    } finally {
      setBusy(false);
    }
  };

  const rows = (result?.outcomes ?? []).filter(
    (r) => showAll || SHOWN_OUTCOMES.includes(r.outcome) || r.outcome === "excluded_by_gate",
  );

  return (
    <Stack spacing={3}>
      <Alert severity="warning">
        Do not enter a real resident's details. Use a demo persona or made-up
        values. The profile is evaluated and discarded; nothing is stored or
        logged.
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField select fullWidth size="small" label="Start from a demo persona" value={presetId} onChange={(e) => loadPreset(e.target.value)}>
                <MenuItem value="">Blank profile</MenuItem>
                {payload.personas.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="ZIP code"
                value={profile.zip_code ?? ""}
                inputProps={{ inputMode: "numeric", maxLength: 5 }}
                onChange={(e) => set({ zip_code: e.target.value.replace(/\D/g, "").slice(0, 5) })}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Household size"
                value={profile.household_size ?? ""}
                inputProps={{ min: 1, max: 20 }}
                onChange={(e) => set({ household_size: e.target.value ? Math.max(1, Math.min(20, Number(e.target.value))) : null })}
              />
            </Grid>
            {TEXT_FIELDS.map(([key, label, options]) => (
              <Grid key={key} size={{ xs: 12, sm: 6, md: 3 }}>
                <Autocomplete
                  freeSolo
                  size="small"
                  options={options}
                  value={(profile[key] as string) ?? ""}
                  onInputChange={(_, v) => set({ [key]: v } as Profile)}
                  renderInput={(params) => <TextField {...params} label={label} />}
                />
              </Grid>
            ))}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Autocomplete
                freeSolo
                size="small"
                options={incomeOptions}
                value={profile.income_bracket ?? ""}
                onInputChange={(_, v) => set({ income_bracket: v })}
                renderInput={(params) => <TextField {...params} label="Income bracket" />}
              />
            </Grid>
            {TRI_FIELDS.map(([key, label]) => (
              <Grid key={key} size={{ xs: 6, sm: 4, md: 3 }}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label={label}
                  value={triValue(profile[key])}
                  onChange={(e) => set({ [key]: e.target.value === "yes" ? true : e.target.value === "no" ? false : null } as Profile)}
                >
                  <MenuItem value="unknown">Not asked</MenuItem>
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </TextField>
              </Grid>
            ))}
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                multiple
                freeSolo
                size="small"
                options={needOptions}
                value={profile.immediate_needs ?? []}
                onChange={(_, v) => set({ immediate_needs: (v as string[]).slice(0, 30) })}
                renderInput={(params) => <TextField {...params} label="Needs (pick or type, then Enter)" />}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Autocomplete
                multiple
                freeSolo
                size="small"
                options={["en", "es", "vi", "zh", "ar", "fr", "ko", "hi", "fa", "ps", "sw"]}
                value={profile.languages_spoken ?? []}
                onChange={(_, v) => set({ languages_spoken: (v as string[]).slice(0, 20) })}
                renderInput={(params) => <TextField {...params} label="Languages (codes)" />}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Autocomplete
                multiple
                size="small"
                options={crisisOptions}
                value={profile.crisis_indicators ?? []}
                onChange={(_, v) => set({ crisis_indicators: v })}
                renderInput={(params) => <TextField {...params} label="Crisis indicators" />}
              />
            </Grid>
          </Grid>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end" sx={{ mt: 2 }}>
            {staged && (
              <FormControlLabel
                control={<Switch checked={useStaged} onChange={(e) => setUseStaged(e.target.checked)} />}
                label="Include staged changes"
              />
            )}
            <Button variant="contained" onClick={run} disabled={busy}>
              Run the matching engine
            </Button>
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              {(Object.keys(OUTCOME_LABEL) as Outcome[])
                .filter((o) => result.counts[o])
                .map((o) => (
                  <Chip key={o} size="small" variant={SHOWN_OUTCOMES.includes(o) ? "filled" : "outlined"} label={`${OUTCOME_LABEL[o]}: ${result.counts[o]}`} />
                ))}
            </Stack>
            {result.risk_flags.length > 0 && (
              <Typography variant="body2" sx={{ mb: 1 }}>
                Risk flags: {result.risk_flags.map((r) => `${r.risk_type.replace(/_/g, " ")} (${r.severity})`).join(", ")}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Estimated benefits shown to the resident: ${result.benefits.total_monthly_value.toLocaleString()} a month.
            </Typography>
            <FormControlLabel
              control={<Switch checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />}
              label="Show every service, including ones with no overlap"
            />
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Service</TableCell>
                    <TableCell>Outcome</TableCell>
                    <TableCell align="right">Score</TableCell>
                    <TableCell>Gates</TableCell>
                    <TableCell>Why</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        {OUTCOME_LABEL[r.outcome]}
                        {r.confidence && ` (${r.confidence})`}
                      </TableCell>
                      <TableCell align="right">{r.score ?? "—"}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {r.gates.map((g) => {
                            const chip = gateChip(g.state);
                            return (
                              <Chip key={g.gate} size="small" variant="outlined" color={chip.color} label={`${gateLabel[g.gate] ?? g.gate}: ${chip.word}`} />
                            );
                          })}
                        </Stack>
                      </TableCell>
                      <TableCell>{r.reasoning}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
