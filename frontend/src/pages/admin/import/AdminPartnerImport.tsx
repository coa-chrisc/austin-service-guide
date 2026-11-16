import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";
import GroupAddIcon from "@mui/icons-material/GroupAdd";

import AdminTokenButton from "../AdminTokenButton";
import ColumnMapping from "./ColumnMapping";
import DraftReview from "./DraftReview";
import ImportUpload from "./ImportUpload";
import { ImportError, buildDrafts, inspectFile, type DraftParams, type DraftsResult, type InspectResult } from "./importApi";
import { useImportConfig } from "./useImportConfig";

const STEPS = ["Upload a list", "Choose columns", "Review and download"];

function messageFor(err: unknown): string {
  if (err instanceof ImportError) {
    if (err.status === 403) return `${err.message} Use "Unlock editing" to enter the admin token.`;
    return err.message;
  }
  return "The request failed. Check your connection and try again.";
}

export default function AdminPartnerImport() {
  const { config, loading } = useImportConfig();
  const [file, setFile] = useState<File | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [params, setParams] = useState<DraftParams | null>(null);
  const [result, setResult] = useState<DraftsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const step = result ? 2 : inspect ? 1 : 0;

  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (next: File) => {
    setFile(next);
    setInspect(null);
    setResult(null);
    setParams(null);
    void attempt(async () => setInspect(await inspectFile(next)));
  };

  const onChangeTable = (table: string, headerRow?: number) => {
    if (!file) return;
    void attempt(async () => setInspect(await inspectFile(file, table, headerRow)));
  };

  const onConfirm = (next: DraftParams) => {
    if (!file) return;
    void attempt(async () => {
      setResult(await buildDrafts(file, next));
      setParams(next);
    });
  };

  const onRegroup = (group: boolean) => {
    if (file && params) onConfirm({ ...params, group });
  };

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <GroupAddIcon color="primary" />
        <Typography variant="h5" component="h1" fontWeight={700} sx={{ flex: 1 }}>
          Import a partner list
        </Typography>
        <AdminTokenButton />
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>
        Demo tool. It turns an organisation list (Excel, CSV or a Word table) into draft catalog files for staff to
        review. Nothing is added to the live catalog and nothing is stored on the server: you download the drafts as
        YAML and add them to the data pack yourself. Contact names, direct lines, personal emails and notes are
        filtered out by rule, but a name typed into another column can get through, so read every draft. Imported
        entries are unverified.
      </Alert>

      {loading && <Skeleton variant="rounded" height={160} />}
      {!loading && !config && (
        <Alert severity="warning">
          Partner-list import is turned off on this server. It needs IMPORT_ENABLED=true, JOB_BACKEND=inline and
          ADMIN_API_TOKEN.
        </Alert>
      )}
      {config && (
        <Stack spacing={2}>
          <Stepper activeStep={step} alternativeLabel>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          <div aria-live="assertive">{error && <Alert severity="error">{error}</Alert>}</div>
          <Card variant="outlined">
            <CardContent>
              <ImportUpload config={config} busy={busy} fileName={file?.name ?? null} onFile={onFile} />
            </CardContent>
          </Card>
          {inspect && !result && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" component="h2" fontWeight={700} sx={{ mb: 1 }}>
                  Choose the columns to import
                </Typography>
                <ColumnMapping
                  inspect={inspect}
                  config={config}
                  busy={busy}
                  previous={params}
                  onChangeTable={onChangeTable}
                  onConfirm={onConfirm}
                />
              </CardContent>
            </Card>
          )}
          {result && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                <Typography variant="h6" component="h2" fontWeight={700} sx={{ flex: 1 }}>
                  Review the drafts
                </Typography>
                <Typography
                  component="button"
                  type="button"
                  variant="body2"
                  onClick={() => setResult(null)}
                  sx={{ border: 0, bgcolor: "transparent", color: "primary.main", cursor: "pointer", textDecoration: "underline" }}
                >
                  Back to the column choices
                </Typography>
              </Stack>
              <DraftReview
                key={`${result.file_name}-${params?.group}`}
                result={result}
                grouped={params?.group ?? true}
                busy={busy}
                onRegroup={onRegroup}
              />
            </Box>
          )}
        </Stack>
      )}
    </Box>
  );
}
