import Autocomplete from "@mui/material/Autocomplete";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

import type { CostType, ServiceCategory, ServiceStatus } from "@/types";
import { fieldError, type ServiceForm } from "./serviceForm";

const COST_TYPES: CostType[] = ["free", "sliding_scale", "flat_fee", "insurance", "varies"];
const STATUSES: [ServiceStatus, string][] = [
  ["active", "Active"],
  ["seasonal", "Seasonal"],
  ["inactive", "Inactive (hidden and never matched)"],
];
const PROVIDER_TYPES = ["city", "county", "state", "federal", "nonprofit", "other"] as const;
const LANGUAGE_CODES = ["en", "es", "vi", "zh", "ar", "fr", "ko", "hi", "fa", "ps", "sw"];
const ACCESSIBILITY = ["Wheelchair accessible", "Interpreter services", "TTY available", "Telehealth", "Home visits available"];

const languageNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" });
  } catch {
    return null;
  }
})();

function languageLabel(code: string): string {
  try {
    const name = languageNames?.of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

interface Props {
  form: ServiceForm;
  set: (patch: Partial<ServiceForm>) => void;
  categories: ServiceCategory[];
  errors: Record<string, string[]>;
  isNew: boolean;
}

export default function DetailsTab({ form, set, categories, errors, isNew }: Props) {
  const text = (key: keyof ServiceForm, label: string, md: number, extra: Record<string, unknown> = {}) => {
    const err = fieldError(errors, key);
    return (
      <Grid size={{ xs: 12, md }}>
        <TextField
          fullWidth
          label={label}
          value={form[key] as string}
          onChange={(e) => set({ [key]: e.target.value } as Partial<ServiceForm>)}
          error={!!err}
          helperText={err ?? (extra.helperText as string | undefined)}
          multiline={!!extra.rows}
          rows={extra.rows as number | undefined}
        />
      </Grid>
    );
  };
  const catName = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const catErr = fieldError(errors, "categories");
  const langErr = fieldError(errors, "languages_offered");

  return (
    <Grid container spacing={3}>
      {text("name", "Service name", 6)}
      {text("provider_name", "Provider", 6)}
      {text("slug", "Slug", 6, {
        helperText: isNew
          ? "Generated from the name. Lowercase letters, digits and hyphens."
          : "Changing it renames the service's file in the exported pack.",
      })}
      <Grid size={{ xs: 12, md: 3 }}>
        <TextField select fullWidth label="Status" value={form.status} onChange={(e) => set({ status: e.target.value as ServiceStatus })}>
          {STATUSES.map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <TextField
          select
          fullWidth
          label="Provider type"
          value={form.provider_type}
          onChange={(e) => set({ provider_type: e.target.value as ServiceForm["provider_type"] })}
        >
          <MenuItem value="">Not set</MenuItem>
          {PROVIDER_TYPES.map((p) => (
            <MenuItem key={p} value={p} sx={{ textTransform: "capitalize" }}>
              {p}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      {text("description", "Description", 12, { rows: 4 })}
      {text("how_to_apply", "How to apply", 12, { rows: 2 })}
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField select fullWidth label="Cost type" value={form.cost_type} onChange={(e) => set({ cost_type: e.target.value as CostType })}>
          {COST_TYPES.map((ct) => (
            <MenuItem key={ct} value={ct}>
              {ct.replace("_", " ")}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      {text("cost", "Cost detail", 6)}
      {text("website_url", "Website", 4)}
      {text("phone", "Phone", 4)}
      {text("email", "Email", 4)}
      <Grid size={{ xs: 12, md: 4 }}>
        <Autocomplete
          multiple
          options={categories.map((c) => c.slug)}
          value={form.categories}
          onChange={(_, v) => set({ categories: v })}
          getOptionLabel={(slug) => catName[slug] ?? `${slug} (unknown)`}
          renderInput={(params) => (
            <TextField {...params} label="Categories" error={!!catErr} helperText={catErr ?? "Up to five, from the pack's category list."} />
          )}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Autocomplete
          multiple
          freeSolo
          options={LANGUAGE_CODES}
          value={form.languages_offered}
          onChange={(_, v) => set({ languages_offered: (v as string[]).map((s) => s.trim().toLowerCase()).filter(Boolean) })}
          getOptionLabel={(code) => languageLabel(code)}
          renderInput={(params) => (
            <TextField {...params} label="Languages offered" error={!!langErr} helperText={langErr ?? "Language codes, for example es or vi."} />
          )}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Autocomplete
          multiple
          freeSolo
          options={ACCESSIBILITY}
          value={form.accessibility_features}
          onChange={(_, v) => set({ accessibility_features: v as string[] })}
          renderInput={(params) => <TextField {...params} label="Accessibility" helperText="Pick or type, then Enter." />}
        />
      </Grid>
    </Grid>
  );
}
