import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Skeleton from "@mui/material/Skeleton";
import Snackbar from "@mui/material/Snackbar";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import {
  ApiError,
  createAdminService,
  getAdminEligibility,
  getAdminService,
  getCategories,
  updateAdminService,
} from "../../lib/api";
import type { GateInfo } from "../../lib/adminEligibility";
import type { Service, ServiceCategory, ServiceSource } from "../../types";
import AdminTokenButton from "./AdminTokenButton";
import DetailsTab from "./serviceEdit/DetailsTab";
import DocumentsTab from "./serviceEdit/DocumentsTab";
import EligibilityTab from "./serviceEdit/EligibilityTab";
import LocationsTab from "./serviceEdit/LocationsTab";
import VerificationTab from "./serviceEdit/VerificationTab";
import { rowError } from "./serviceEdit/hoursForm";
import {
  emptyForm,
  formFromService,
  issuesByField,
  payloadFromForm,
  slugify,
  type ServiceForm,
} from "./serviceEdit/serviceForm";

const TAB_FIELDS: [number, RegExp][] = [
  [1, /^eligibility_/],
  [2, /^locations/],
  [3, /^documents/],
  [4, /^(last_verified_date|verified_by|sources)/],
];

function tabFor(key: string): number {
  return TAB_FIELDS.find(([, re]) => re.test(key))?.[0] ?? 0;
}

export default function AdminServiceEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [loaded, setLoaded] = useState<Service | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [gates, setGates] = useState<GateInfo[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(0);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [snackbar, setSnackbar] = useState<{ msg: string; severity: "success" | "error" } | null>(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
    getAdminEligibility()
      .then((p) => setGates(p.gates))
      .catch(() => setGates([]));
  }, []);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    getAdminService(id!)
      .then((svc) => {
        if (cancelled) return;
        setLoaded(svc);
        setForm(formFromService(svc));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Could not load the service.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const set = (patch: Partial<ServiceForm>) =>
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (isNew && patch.name !== undefined && prev.slug === slugify(prev.name)) {
        next.slug = slugify(patch.name);
      }
      return next;
    });

  const handleSave = async () => {
    const hoursProblem = form.locations.findIndex((loc) => loc.hoursRows.some((r) => rowError(r)));
    if (hoursProblem >= 0) {
      setTab(2);
      setSnackbar({ msg: `Fix the hours for location ${hoursProblem + 1} first.`, severity: "error" });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const body = payloadFromForm(form) as Partial<Service>;
      if (isNew) await createAdminService(body);
      else await updateAdminService(id!, body);
      setSnackbar({
        msg: `Service ${isNew ? "created" : "updated"} on this server instance (lost on restart; export the pack to keep it).`,
        severity: "success",
      });
      setTimeout(() => navigate("/admin/services"), 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        const byField = issuesByField(err.issues);
        setErrors(byField);
        const first = Object.keys(byField).find((k) => k);
        if (first) setTab(tabFor(first));
        setSnackbar({
          msg: err.issues.length > 1 ? `${err.message} (and ${err.issues.length - 1} more)` : err.message,
          severity: "error",
        });
      } else {
        setSnackbar({ msg: "Failed to save the service.", severity: "error" });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box>
        <Skeleton width={300} height={40} />
        <Skeleton variant="rectangular" height={400} sx={{ mt: 2, borderRadius: 2 }} />
      </Box>
    );
  }
  if (loadError) return <Alert severity="error">{loadError}</Alert>;

  const general = errors[""] ?? [];
  const sources: ServiceSource[] = loaded?.sources ?? [];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/admin/services")}>
          Back
        </Button>
        <Typography variant="h5" fontWeight={700}>
          {isNew ? "Add service" : `Edit ${loaded?.name ?? "service"}`}
        </Typography>
        <Box sx={{ ml: "auto" }}>
          <AdminTokenButton />
        </Box>
      </Box>
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        Saving checks the entry against the data-pack contract. Changes apply to this server instance only and are
        lost on restart; export the pack from the Eligibility page to keep them.
      </Alert>
      {general.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {general.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </Alert>
      )}

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
            <Tab label="Details" />
            <Tab label="Eligibility" />
            <Tab label={`Locations (${form.locations.length})`} />
            <Tab label="Documents" />
            <Tab label="Verification" />
          </Tabs>
          <Box sx={{ pt: 3 }}>
            {tab === 0 && <DetailsTab form={form} set={set} categories={categories} errors={errors} isNew={isNew} />}
            {tab === 1 && (
              <EligibilityTab form={form} set={set} gates={gates} errors={errors} savedSlug={loaded?.slug ?? null} />
            )}
            {tab === 2 && <LocationsTab locations={form.locations} onChange={(locations) => set({ locations })} errors={errors} />}
            {tab === 3 && <DocumentsTab documents={form.documents} onChange={(documents) => set({ documents })} />}
            {tab === 4 && <VerificationTab form={form} set={set} sources={sources} errors={errors} />}
          </Box>

          <Divider sx={{ mt: 4, mb: 3 }} />
          <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
            <Button variant="outlined" onClick={() => navigate("/admin/services")}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={saving || !form.name.trim() || !form.slug.trim()}>
              {saving ? "Saving..." : isNew ? "Create service" : "Save changes"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Snackbar open={!!snackbar} autoHideDuration={5000} onClose={() => setSnackbar(null)}>
        <Alert onClose={() => setSnackbar(null)} severity={snackbar?.severity ?? "info"} variant="filled">
          {snackbar?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
