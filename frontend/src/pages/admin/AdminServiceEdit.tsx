import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import OutlinedInput from "@mui/material/OutlinedInput";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import {
  getServiceBySlug,
  createAdminService,
  updateAdminService,
} from "../../lib/api";
import type {
  Service,
  ServiceDocument,
  ServiceLocation,
  CostType,
  ServiceStatus,
} from "../../types";

const COST_TYPES: CostType[] = [
  "free",
  "sliding_scale",
  "flat_fee",
  "insurance",
  "varies",
];
const CATEGORY_OPTIONS = [
  "Food Assistance",
  "Housing",
  "Healthcare",
  "Mental Health",
  "Employment",
  "Education",
  "Legal Aid",
  "Transportation",
  "Childcare",
  "Utilities",
  "Financial Assistance",
  "Disability Services",
  "Veterans Services",
  "Senior Services",
];
const LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "Vietnamese",
  "Chinese",
  "Arabic",
  "Korean",
  "Hindi",
  "French",
];
const ACCESSIBILITY_OPTIONS = [
  "Wheelchair Accessible",
  "ASL Interpreter",
  "Braille",
  "Large Print",
  "Audio Description",
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  if (value !== index) return null;
  return <Box sx={{ pt: 3 }}>{children}</Box>;
}

/* -- blank location ------------------------------------------------ */
function emptyLocation(): ServiceLocation {
  return {
    id: crypto.randomUUID(),
    service_id: "",
    name: "",
    address: "",
    city: "Austin",
    state: "TX",
    zip_code: "",
    latitude: 0,
    longitude: 0,
    phone: "",
    is_primary: false,
    hours: {},
  };
}

/* -- blank document ------------------------------------------------ */
function emptyDoc(): ServiceDocument {
  return { name: "", description: "", is_required: true };
}

export default function AdminServiceEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{
    msg: string;
    severity: "success" | "error";
  } | null>(null);

  /* -- form state -------------------------------------------------- */
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [providerName, setProviderName] = useState("");
  const [description, setDescription] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [howToApply, setHowToApply] = useState("");
  const [costType, setCostType] = useState<CostType>("free");
  const [cost, setCost] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [accessibility, setAccessibility] = useState<string[]>([]);
  const [status, setStatus] = useState<ServiceStatus>("active");

  const [locations, setLocations] = useState<ServiceLocation[]>([
    emptyLocation(),
  ]);
  const [documents, setDocuments] = useState<ServiceDocument[]>([]);

  /* -- load existing service --------------------------------------- */
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const svc = await getServiceBySlug(id!);
        if (cancelled) return;
        setName(svc.name);
        setSlug(svc.slug);
        setProviderName(svc.provider_name);
        setDescription(svc.description);
        setEligibility(svc.eligibility_summary);
        setHowToApply(svc.how_to_apply);
        setCostType(svc.cost_type);
        setCost(svc.cost);
        setWebsite(svc.website_url);
        setPhone(svc.phone);
        setEmail(svc.email);
        setCategories(svc.categories);
        setLanguages(svc.languages_offered);
        setAccessibility(svc.accessibility_features);
        setStatus(svc.status);
        if (svc.locations.length) setLocations(svc.locations);
        if (svc.documents.length) setDocuments(svc.documents);
      } catch (err) {
        console.error("Failed to load service", err);
        setSnackbar({ msg: "Failed to load service", severity: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  /* -- auto-generate slug ------------------------------------------ */
  useEffect(() => {
    if (isNew) setSlug(slugify(name));
  }, [name, isNew]);

  /* -- save -------------------------------------------------------- */
  const handleSave = async () => {
    setSaving(true);
    const data: Partial<Service> = {
      name,
      slug,
      provider_name: providerName,
      description,
      eligibility_summary: eligibility,
      how_to_apply: howToApply,
      cost_type: costType,
      cost,
      website_url: website,
      phone,
      email,
      categories,
      languages_offered: languages,
      accessibility_features: accessibility,
      status,
      locations,
      documents,
    };
    try {
      if (isNew) {
        await createAdminService(data);
      } else {
        await updateAdminService(id!, data);
      }
      setSnackbar({
        msg: `Service ${isNew ? "created" : "updated"} successfully`,
        severity: "success",
      });
      setTimeout(() => navigate("/admin/services"), 1200);
    } catch (err) {
      console.error("Save failed", err);
      setSnackbar({ msg: "Failed to save service", severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  /* -- location helpers -------------------------------------------- */
  const updateLocation = (
    idx: number,
    field: keyof ServiceLocation,
    value: string | boolean,
  ) => {
    setLocations((prev) =>
      prev.map((loc, i) => (i === idx ? { ...loc, [field]: value } : loc)),
    );
  };
  const removeLocation = (idx: number) => {
    setLocations((prev) => prev.filter((_, i) => i !== idx));
  };

  /* -- document helpers -------------------------------------------- */
  const updateDocument = (
    idx: number,
    field: keyof ServiceDocument,
    value: string | boolean,
  ) => {
    setDocuments((prev) =>
      prev.map((doc, i) => (i === idx ? { ...doc, [field]: value } : doc)),
    );
  };
  const removeDocument = (idx: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <Box>
        <Skeleton width={300} height={40} />
        <Skeleton
          variant="rectangular"
          height={400}
          sx={{ mt: 2, borderRadius: 2 }}
        />
      </Box>
    );
  }

  return (
    <Box>
      {/* -- header --------------------------------------------------- */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/admin/services")}
        >
          Back
        </Button>
        <Typography variant="h5" fontWeight={700}>
          {isNew ? "Add Service" : "Edit Service"}
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Details" />
            <Tab label="Locations" />
            <Tab label="Documents" />
          </Tabs>

          {/* ========== Details Tab ================================== */}
          <TabPanel value={tab} index={0}>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Service Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Provider"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  helperText="Auto-generated from name"
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={status === "active"}
                      onChange={(e) =>
                        setStatus(e.target.checked ? "active" : "inactive")
                      }
                    />
                  }
                  label={`Status: ${status}`}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Eligibility Summary"
                  value={eligibility}
                  onChange={(e) => setEligibility(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="How to Apply"
                  value={howToApply}
                  onChange={(e) => setHowToApply(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Cost Type</InputLabel>
                  <Select
                    value={costType}
                    label="Cost Type"
                    onChange={(e) => setCostType(e.target.value as CostType)}
                  >
                    {COST_TYPES.map((ct) => (
                      <MenuItem key={ct} value={ct}>
                        {ct.replace("_", " ")}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Cost Detail"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Grid>

              {/* multi-selects */}
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth>
                  <InputLabel>Categories</InputLabel>
                  <Select
                    multiple
                    value={categories}
                    onChange={(e) =>
                      setCategories(
                        typeof e.target.value === "string"
                          ? e.target.value.split(",")
                          : e.target.value,
                      )
                    }
                    input={<OutlinedInput label="Categories" />}
                    renderValue={(sel) => (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {sel.map((v) => (
                          <Chip key={v} label={v} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth>
                  <InputLabel>Languages</InputLabel>
                  <Select
                    multiple
                    value={languages}
                    onChange={(e) =>
                      setLanguages(
                        typeof e.target.value === "string"
                          ? e.target.value.split(",")
                          : e.target.value,
                      )
                    }
                    input={<OutlinedInput label="Languages" />}
                    renderValue={(sel) => (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {sel.map((v) => (
                          <Chip key={v} label={v} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {LANGUAGE_OPTIONS.map((l) => (
                      <MenuItem key={l} value={l}>
                        {l}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth>
                  <InputLabel>Accessibility</InputLabel>
                  <Select
                    multiple
                    value={accessibility}
                    onChange={(e) =>
                      setAccessibility(
                        typeof e.target.value === "string"
                          ? e.target.value.split(",")
                          : e.target.value,
                      )
                    }
                    input={<OutlinedInput label="Accessibility" />}
                    renderValue={(sel) => (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {sel.map((v) => (
                          <Chip key={v} label={v} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {ACCESSIBILITY_OPTIONS.map((a) => (
                      <MenuItem key={a} value={a}>
                        {a}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </TabPanel>

          {/* ========== Locations Tab ================================ */}
          <TabPanel value={tab} index={1}>
            {locations.map((loc, idx) => (
              <Box key={loc.id} sx={{ mb: 3 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={600}>
                    Location {idx + 1}
                  </Typography>
                  {locations.length > 1 && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeLocation(idx)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Location Name"
                      value={loc.name}
                      onChange={(e) =>
                        updateLocation(idx, "name", e.target.value)
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Phone"
                      value={loc.phone}
                      onChange={(e) =>
                        updateLocation(idx, "phone", e.target.value)
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Address"
                      value={loc.address}
                      onChange={(e) =>
                        updateLocation(idx, "address", e.target.value)
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="City"
                      value={loc.city}
                      onChange={(e) =>
                        updateLocation(idx, "city", e.target.value)
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="State"
                      value={loc.state}
                      onChange={(e) =>
                        updateLocation(idx, "state", e.target.value)
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Zip Code"
                      value={loc.zip_code}
                      onChange={(e) =>
                        updateLocation(idx, "zip_code", e.target.value)
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Hours (e.g. Mon-Fri 9am-5pm)"
                      value={Object.values(loc.hours).join("; ")}
                      onChange={(e) =>
                        updateLocation(idx, "hours", e.target.value)
                      }
                    />
                  </Grid>
                </Grid>
                {idx < locations.length - 1 && <Divider sx={{ mt: 3 }} />}
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={() => setLocations((prev) => [...prev, emptyLocation()])}
            >
              Add Location
            </Button>
          </TabPanel>

          {/* ========== Documents Tab ================================ */}
          <TabPanel value={tab} index={2}>
            {documents.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No required documents yet.
              </Typography>
            )}
            {documents.map((doc, idx) => (
              <Box key={idx} sx={{ mb: 3 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={600}>
                    Document {idx + 1}
                  </Typography>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => removeDocument(idx)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 5 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Document Name"
                      value={doc.name}
                      onChange={(e) =>
                        updateDocument(idx, "name", e.target.value)
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 5 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Description"
                      value={doc.description}
                      onChange={(e) =>
                        updateDocument(idx, "description", e.target.value)
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 2 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={doc.is_required}
                          onChange={(e) =>
                            updateDocument(idx, "is_required", e.target.checked)
                          }
                        />
                      }
                      label="Required"
                    />
                  </Grid>
                </Grid>
                {idx < documents.length - 1 && <Divider sx={{ mt: 2 }} />}
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={() => setDocuments((prev) => [...prev, emptyDoc()])}
            >
              Add Document
            </Button>
          </TabPanel>

          {/* -- action buttons --------------------------------------- */}
          <Divider sx={{ mt: 4, mb: 3 }} />
          <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
            <Button
              variant="outlined"
              onClick={() => navigate("/admin/services")}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || !name}
            >
              {saving ? "Saving..." : isNew ? "Create Service" : "Save Changes"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
      >
        <Alert
          onClose={() => setSnackbar(null)}
          severity={snackbar?.severity ?? "info"}
          variant="filled"
        >
          {snackbar?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
