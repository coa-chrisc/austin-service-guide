import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import OutlinedInput from "@mui/material/OutlinedInput";
import Select from "@mui/material/Select";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";

import { getCategories } from "@/lib/api";
import {
  JURISDICTION_LEVELS,
  startResearchJob,
  type JobCaps,
  type JobsConfig,
  type JurisdictionLevel,
  type ResearchJobRequest,
} from "@/lib/researchApi";
import type { ServiceCategory } from "@/types";
import {
  CAP_KEYS,
  CAP_LABELS,
  capsFromForm,
  describeError,
  effectiveMaxCost,
  formatUsd,
  parseLines,
  safeHttpUrl,
} from "./draftView";

const LEVEL_LABELS: Record<JurisdictionLevel, string> = {
  city: "City",
  county: "County",
  state: "State",
  federal: "Federal",
  nonprofit: "Nonprofit",
};

function capsToForm(caps: JobCaps): Record<keyof JobCaps, string> {
  return Object.fromEntries(
    CAP_KEYS.map((key) => [key, String(caps[key])]),
  ) as Record<keyof JobCaps, string>;
}

/** The "start a research run" form; on success it opens the new job. */
export default function StartResearchForm({ config }: { config: JobsConfig }) {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<ServiceCategory[] | null>(null);
  const [stateCode, setStateCode] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [topic, setTopic] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [levels, setLevels] = useState<JurisdictionLevel[]>([
    ...JURISDICTION_LEVELS,
  ]);
  const [seedUrls, setSeedUrls] = useState("");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [capValues, setCapValues] = useState<Record<keyof JobCaps, string>>(
    () => capsToForm(config.caps),
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((res) => {
        if (cancelled) return;
        setCategories(res);
        setSelectedCategories(res.map((c) => c.slug));
      })
      .catch((err) => {
        console.error("Failed to load categories", err);
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryNames = useMemo(
    () =>
      Object.fromEntries((categories ?? []).map((c) => [c.slug, c.name])) as
        Record<string, string>,
    [categories],
  );

  /* -- validation ---------------------------------------------------- */
  const capsForm = capsFromForm(config.caps, capValues);
  const maxCost = effectiveMaxCost(config.caps, capsForm);
  const seedLines = parseLines(seedUrls);
  const badSeeds = seedLines.filter((line) => !safeHttpUrl(line));
  const stateValid = /^[A-Za-z]{2}$/.test(stateCode.trim());
  const categoriesLoaded = (categories?.length ?? 0) > 0;
  const allCategories =
    categoriesLoaded && selectedCategories.length === categories!.length;

  const formErrors: string[] = [];
  if (!stateValid) formErrors.push("Enter the two-letter state code.");
  if (categoriesLoaded && selectedCategories.length === 0) {
    formErrors.push("Pick at least one category.");
  }
  if (levels.length === 0) formErrors.push("Pick at least one level.");
  if (badSeeds.length) {
    formErrors.push("Every seed URL must start with http:// or https://.");
  }
  if (Object.keys(capsForm.errors).length) {
    formErrors.push("Fix the run limits.");
  }
  if (!acknowledged) formErrors.push("Confirm the cost acknowledgement.");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setSubmitError("");
    if (formErrors.length) return;
    const body: ResearchJobRequest = {
      place: {
        state: stateCode.trim().toUpperCase(),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(county.trim() ? { county: county.trim() } : {}),
      },
      levels,
      acknowledge_cost: true,
    };
    if (topic.trim()) body.topic = topic.trim();
    if (categoriesLoaded && !allCategories) body.categories = selectedCategories;
    if (seedLines.length) body.seed_urls = seedLines;
    const domains = parseLines(allowedDomains);
    if (domains.length) body.allowed_domains = domains;
    if (Object.keys(capsForm.caps).length) body.caps = capsForm.caps;

    setSubmitting(true);
    try {
      const res = await startResearchJob(body);
      navigate(`/admin/research/${encodeURIComponent(res.id)}`);
    } catch (err) {
      setSubmitError(describeError(err));
      setSubmitting(false);
    }
  };

  const toggleLevel = (level: JurisdictionLevel) => {
    setLevels((prev) =>
      prev.includes(level)
        ? prev.filter((l) => l !== level)
        : JURISDICTION_LEVELS.filter((l) => l === level || prev.includes(l)),
    );
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
          Start a research run
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Country: United States only for now. Search provider:{" "}
          {config.search_provider}. Model: {config.model}.
          {config.require_plan_approval &&
            " You approve the search plan before the run starts."}
        </Typography>

        <Box component="form" noValidate onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4, md: 2 }}>
              <TextField
                required
                fullWidth
                label="State"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value.toUpperCase())}
                error={submitted && !stateValid}
                helperText="Two letters, e.g. TX"
                slotProps={{ htmlInput: { maxLength: 2, autoComplete: "off" } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4, md: 3 }}>
              <TextField
                fullWidth
                label="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4, md: 3 }}>
              <TextField
                fullWidth
                label="County"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Topic (optional)"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                helperText="e.g. rent assistance for seniors"
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl
                fullWidth
                disabled={!categoriesLoaded}
                error={submitted && categoriesLoaded && selectedCategories.length === 0}
              >
                <InputLabel id="research-categories-label">Categories</InputLabel>
                <Select
                  labelId="research-categories-label"
                  multiple
                  value={selectedCategories}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedCategories(
                      typeof value === "string" ? value.split(",") : value,
                    );
                  }}
                  input={<OutlinedInput label="Categories" />}
                  renderValue={(selected) =>
                    allCategories
                      ? "All categories"
                      : selected.length === 0
                        ? "None"
                        : selected.map((s) => categoryNames[s] ?? s).join(", ")
                  }
                >
                  {(categories ?? []).map((c) => (
                    <MenuItem key={c.slug} value={c.slug}>
                      <Checkbox checked={selectedCategories.includes(c.slug)} />
                      <ListItemText primary={c.name} />
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {categories === null
                    ? "Loading categories..."
                    : categoriesLoaded
                      ? "All categories are selected by default."
                      : "Categories could not be loaded; the run will cover all categories."}
                </FormHelperText>
              </FormControl>
              {categoriesLoaded && (
                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  <Button
                    size="small"
                    onClick={() =>
                      setSelectedCategories(categories!.map((c) => c.slug))
                    }
                  >
                    Select all
                  </Button>
                  <Button size="small" onClick={() => setSelectedCategories([])}>
                    Clear
                  </Button>
                </Box>
              )}
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl
                component="fieldset"
                error={submitted && levels.length === 0}
              >
                <FormLabel component="legend">Jurisdiction levels</FormLabel>
                <FormGroup row>
                  {JURISDICTION_LEVELS.map((level) => (
                    <FormControlLabel
                      key={level}
                      control={
                        <Checkbox
                          checked={levels.includes(level)}
                          onChange={() => toggleLevel(level)}
                        />
                      }
                      label={LEVEL_LABELS[level]}
                    />
                  ))}
                </FormGroup>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Seed URLs (optional)"
                value={seedUrls}
                onChange={(e) => setSeedUrls(e.target.value)}
                error={submitted && badSeeds.length > 0}
                helperText={
                  badSeeds.length
                    ? `Not a web address: ${badSeeds.join(", ")}`
                    : "One per line. Pages the agent should read first."
                }
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Allowed domains (optional)"
                value={allowedDomains}
                onChange={(e) => setAllowedDomains(e.target.value)}
                helperText="One per line, e.g. austintexas.gov. Leave empty to allow any site."
              />
            </Grid>

            <Grid size={12}>
              <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
                Run limits (can only be lowered)
              </Typography>
              <Grid container spacing={2}>
                {CAP_KEYS.map((key) => {
                  const error = submitted ? capsForm.errors[key] : undefined;
                  return (
                    <Grid key={key} size={{ xs: 6, sm: 4, md: 3 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label={CAP_LABELS[key]}
                        value={capValues[key]}
                        onChange={(e) => {
                          const value = e.target.value;
                          setCapValues((prev) => ({ ...prev, [key]: value }));
                          // The acknowledgement names the cost ceiling, so
                          // changing it asks for a fresh confirmation.
                          if (key === "max_cost_usd") setAcknowledged(false);
                        }}
                        error={Boolean(error)}
                        helperText={
                          error ??
                          (key === "max_cost_usd"
                            ? `Up to ${formatUsd(config.caps[key])}`
                            : `Up to ${config.caps[key]}`)
                        }
                        slotProps={{
                          htmlInput: {
                            min: key === "max_cost_usd" ? 0.01 : 1,
                            max: config.caps[key],
                            step: key === "max_cost_usd" ? 0.01 : 1,
                          },
                        }}
                      />
                    </Grid>
                  );
                })}
              </Grid>
            </Grid>

            <Grid size={12}>
              <FormControl error={submitted && !acknowledged}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      required
                    />
                  }
                  label={`I understand this run can cost up to ${formatUsd(
                    maxCost,
                  )} in model and search charges (an estimate), and that its drafts stay unverified until staff review and verify them.`}
                />
              </FormControl>
            </Grid>

            {submitted && formErrors.length > 0 && (
              <Grid size={12}>
                <Alert severity="error">
                  {formErrors.map((msg) => (
                    <div key={msg}>{msg}</div>
                  ))}
                </Alert>
              </Grid>
            )}
            {submitError && (
              <Grid size={12}>
                <Alert severity="error">{submitError}</Alert>
              </Grid>
            )}

            <Grid size={12}>
              <Button
                type="submit"
                variant="contained"
                startIcon={<TravelExploreIcon />}
                disabled={submitting || !acknowledged}
              >
                {submitting ? "Starting..." : "Start research"}
              </Button>
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
}
