import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Radio from "@mui/material/Radio";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import { brandConfig } from "@/hooks/useBrandConfig";
import HoursEditor from "./HoursEditor";
import { emptyLocation, fieldError, type LocationForm } from "./serviceForm";

interface Props {
  locations: LocationForm[];
  onChange: (locations: LocationForm[]) => void;
  errors: Record<string, string[]>;
}

const TEXT_FIELDS: [keyof LocationForm, string, number][] = [
  ["name", "Location name", 6],
  ["phone", "Phone", 6],
  ["address", "Street address", 12],
  ["city", "City", 4],
  ["state", "State", 4],
  ["zip_code", "ZIP code", 4],
  ["latitude", "Latitude", 6],
  ["longitude", "Longitude", 6],
];

export default function LocationsTab({ locations, onChange, errors }: Props) {
  const update = (idx: number, patch: Partial<LocationForm>) =>
    onChange(locations.map((loc, i) => (i === idx ? { ...loc, ...patch } : loc)));

  const setPrimary = (idx: number) =>
    onChange(locations.map((loc, i) => ({ ...loc, is_primary: i === idx })));

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Latitude and longitude place the location on the map and in ZIP radius
        search; a location without them is left off both. A phone-only or
        online service can have no locations.
      </Typography>
      {fieldError(errors, "locations") && !locations.length && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {fieldError(errors, "locations")}
        </Typography>
      )}
      {locations.map((loc, idx) => (
        <Box key={loc.key} sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Location {idx + 1}
              {loc.id && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {loc.id}
                </Typography>
              )}
            </Typography>
            <IconButton
              size="small"
              color="error"
              onClick={() => onChange(locations.filter((_, i) => i !== idx))}
              aria-label={`Remove location ${idx + 1}`}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
          <Grid container spacing={2}>
            {TEXT_FIELDS.map(([field, label, md]) => {
              const err = fieldError(errors, `locations.${idx}.${field}`);
              return (
                <Grid key={field} size={{ xs: 12, md }}>
                  <TextField
                    fullWidth
                    size="small"
                    label={label}
                    value={loc[field] as string}
                    inputProps={field === "latitude" || field === "longitude" ? { inputMode: "decimal" } : undefined}
                    onChange={(e) => update(idx, { [field]: e.target.value } as Partial<LocationForm>)}
                    error={!!err}
                    helperText={err}
                  />
                </Grid>
              );
            })}
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControlLabel
                control={<Radio checked={loc.is_primary} onChange={() => setPrimary(idx)} />}
                label="Primary location"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControlLabel
                control={
                  <Switch checked={loc.hours_verified} onChange={(e) => update(idx, { hours_verified: e.target.checked })} />
                }
                label="Hours confirmed with the provider"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <HoursEditor
                rows={loc.hoursRows}
                onChange={(hoursRows) => update(idx, { hoursRows })}
                error={fieldError(errors, `locations.${idx}.hours`)}
              />
            </Grid>
          </Grid>
          {idx < locations.length - 1 && <Divider sx={{ mt: 3 }} />}
        </Box>
      ))}
      <Button
        startIcon={<AddIcon />}
        variant="outlined"
        onClick={() =>
          onChange([
            ...locations,
            { ...emptyLocation(brandConfig.region.cityName, brandConfig.region.state), is_primary: locations.length === 0 },
          ])
        }
      >
        Add location
      </Button>
    </Box>
  );
}
