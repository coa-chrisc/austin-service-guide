import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import DownloadIcon from "@mui/icons-material/Download";

import { ApiError, exportPack, getAdminEligibility } from "../../lib/api";
import type {
  EligibilityOverrides,
  EligibilityPayload,
  GateId,
  MatchingRules,
} from "../../lib/adminEligibility";
import AdminTokenButton from "./AdminTokenButton";
import EngineTab from "./eligibility/EngineTab";
import LocalRulesTab from "./eligibility/LocalRulesTab";
import ProfileTester from "./eligibility/ProfileTester";
import ServiceGatesTab from "./eligibility/ServiceGatesTab";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The rules the matching engine actually evaluates, in three layers:
 * per-service gates (editable), the pack's local rules (editable), and the
 * engine's built-in constants (read-only), plus a profile tester.
 */
export default function AdminEligibility() {
  const [payload, setPayload] = useState<EligibilityPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{ msg: string; severity: "success" | "error" } | null>(null);
  // Export-only mode: edits are staged here and only ever exported.
  const [stagedGates, setStagedGates] = useState<Record<string, GateId[]>>({});
  const [stagedRules, setStagedRules] = useState<MatchingRules | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setPayload(await getAdminEligibility());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load the eligibility rules.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const staged: EligibilityOverrides | null = useMemo(() => {
    const services = Object.fromEntries(
      Object.entries(stagedGates).map(([slug, gates]) => [slug, { eligibility_requires: gates }]),
    );
    if (!Object.keys(services).length && !stagedRules) return null;
    return { services, ...(stagedRules ? { matching_rules: stagedRules } : {}) };
  }, [stagedGates, stagedRules]);

  const applied = (msg: string) => {
    setSnackbar({ msg, severity: "success" });
    void load();
  };

  const runExport = async (changedOnly: boolean) => {
    setExporting(true);
    try {
      download(await exportPack({ changedOnly, overrides: staged ?? undefined }), "data-pack-export.zip");
    } catch (err) {
      setSnackbar({ msg: err instanceof ApiError ? err.message : "Export failed.", severity: "error" });
    } finally {
      setExporting(false);
    }
  };

  if (loadError) return <Alert severity="error">{loadError}</Alert>;
  if (!payload) {
    return (
      <Box>
        <Skeleton width={320} height={40} />
        <Skeleton variant="rectangular" height={400} sx={{ mt: 2, borderRadius: 2 }} />
      </Box>
    );
  }

  const exportOnly = payload.edit_mode === "export_only";
  const stagedCount = Object.keys(stagedGates).length + (stagedRules ? 1 : 0);

  return (
    <Box>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            Eligibility rules
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The rules the matching engine evaluates, read from the loaded data pack and the engine code.
          </Typography>
        </Box>
        <AdminTokenButton />
        <Button variant="outlined" startIcon={<DownloadIcon />} disabled={exporting} onClick={() => runExport(true)}>
          Export changed files
        </Button>
        <Button variant="outlined" disabled={exporting} onClick={() => runExport(false)}>
          Export full pack
        </Button>
      </Stack>

      <Stack spacing={1} sx={{ mb: 2 }}>
        {exportOnly ? (
          <Alert severity="info">
            This server runs in export-only mode. Edits are previewed and staged in this browser tab, then
            exported as YAML; they never change what residents see here.
            {stagedCount > 0 && ` ${stagedCount} change${stagedCount === 1 ? "" : "s"} staged.`}
          </Alert>
        ) : (
          <Alert severity="info">
            Changes apply to this server instance only and are lost on restart. Export the pack to keep them.
            Where the app runs on several instances (serverless hosting, for example), other instances do not
            see them. Editing needs the admin token.
          </Alert>
        )}
        <Alert severity="info" variant="outlined">
          The engine has no income, residency, citizenship or numeric-age rules. Those restrictions stay in each
          service's eligibility summary (and the "other criteria" gate), which residents see as a "check
          eligibility" note.
        </Alert>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }} variant="scrollable" allowScrollButtonsMobile>
        <Tab label="Service gates" />
        <Tab label="Local rules" />
        <Tab label="Built into the engine" />
        <Tab label="Profile tester" />
      </Tabs>

      {tab === 0 && (
        <ServiceGatesTab
          payload={payload}
          staged={stagedGates}
          onApplied={applied}
          onStaged={(slug, gates) => {
            setStagedGates((prev) => ({ ...prev, [slug]: gates }));
            setSnackbar({ msg: "Staged for export.", severity: "success" });
          }}
        />
      )}
      {tab === 1 && (
        <LocalRulesTab
          payload={payload}
          stagedRules={stagedRules}
          onApplied={applied}
          onStaged={(rules) => {
            setStagedRules(rules);
            setSnackbar({ msg: "Staged for export.", severity: "success" });
          }}
        />
      )}
      {tab === 2 && <EngineTab engine={payload.engine} />}
      {tab === 3 && <ProfileTester payload={payload} staged={staged} />}

      <Snackbar open={!!snackbar} autoHideDuration={4000} onClose={() => setSnackbar(null)}>
        <Alert onClose={() => setSnackbar(null)} severity={snackbar?.severity ?? "info"} variant="filled">
          {snackbar?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
