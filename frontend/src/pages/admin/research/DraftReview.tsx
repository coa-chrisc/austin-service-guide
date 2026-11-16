import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import Divider from "@mui/material/Divider";
import Skeleton from "@mui/material/Skeleton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import MergeTypeIcon from "@mui/icons-material/MergeType";
import SaveIcon from "@mui/icons-material/Save";

import {
  acceptDraft,
  getDraft,
  rejectDraft,
  saveDraftYaml,
  type DraftDetail,
  type DraftState,
  type ValidationIssue,
} from "@/lib/researchApi";
import AdminTokenButton from "../AdminTokenButton";
import {
  DRAFT_STATE_LABELS,
  acceptBlockReason,
  describeError,
  evidenceRows,
  formatWhen,
  rejectBlockReason,
  safeHttpUrl,
} from "./draftView";

const STATE_ICONS: Record<DraftState, React.ReactNode> = {
  pending: <HourglassEmptyIcon fontSize="small" color="action" />,
  accepted: <CheckCircleIcon fontSize="small" color="success" />,
  rejected: <CancelIcon fontSize="small" color="error" />,
  merged: <MergeTypeIcon fontSize="small" color="info" />,
};

/** Review state as icon plus text (the icon is decorative). */
export function DraftStateLabel({ state }: { state: DraftState }) {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
    >
      {STATE_ICONS[state]}
      <span>{DRAFT_STATE_LABELS[state] ?? state}</span>
    </Box>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
      {issues.map((issue, i) => (
        <li key={`${issue.path}-${issue.code}-${i}`}>
          {issue.path ? <strong>{issue.path}: </strong> : null}
          {issue.message}
          {issue.code ? ` (${issue.code})` : ""}
        </li>
      ))}
    </Box>
  );
}

export default function DraftReview() {
  const { draftId = "" } = useParams<{ draftId: string }>();

  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [yaml, setYaml] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "accept" | "reject">("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await getDraft(draftId);
      setDetail(res);
      setYaml(res.yaml);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }, [draftId]);

  useEffect(() => {
    setDetail(null);
    load();
  }, [load]);

  const dirty = detail !== null && yaml !== detail.yaml;

  // Run one action, keep the server's revalidated draft, report the outcome.
  const run = async (
    kind: "save" | "accept" | "reject",
    action: () => Promise<DraftDetail>,
    done: string,
  ) => {
    setBusy(kind);
    setActionError("");
    setNotice("");
    try {
      const res = await action();
      setDetail(res);
      setYaml(res.yaml);
      setNotice(done);
      return true;
    } catch (err) {
      setActionError(describeError(err));
      return false;
    } finally {
      setBusy("");
    }
  };

  if (loadError) {
    return (
      <Box>
        <Button component={RouterLink} to="/admin/research" startIcon={<ArrowBackIcon />}>
          Research agent
        </Button>
        <Alert
          severity="error"
          sx={{ mt: 2 }}
          action={<AdminTokenButton />}
        >
          {loadError}
        </Alert>
      </Box>
    );
  }

  if (!detail) {
    return (
      <Box>
        <Skeleton height={48} />
        <Skeleton height={400} />
      </Box>
    );
  }

  const rows = evidenceRows(detail);
  const anchorFor = new Map(rows.map((row) => [row.field, row.anchorId]));
  const acceptReason = acceptBlockReason(detail, dirty);
  const rejectReasonBlock = rejectBlockReason(detail);
  const errors = detail.issues?.errors ?? [];
  const warnings = detail.issues?.warnings ?? [];

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Button
          component={RouterLink}
          to={`/admin/research/${encodeURIComponent(detail.job_id)}`}
          startIcon={<ArrowBackIcon />}
        >
          Back to job
        </Button>
        <Box sx={{ flex: 1 }} />
        <AdminTokenButton />
      </Box>

      <Typography variant="h5" component="h1" fontWeight={700}>
        {detail.name || detail.slug || "Untitled draft"}
      </Typography>
      <Box
        sx={{
          display: "flex",
          gap: 3,
          flexWrap: "wrap",
          alignItems: "center",
          mt: 1,
          mb: 2,
          color: "text.secondary",
        }}
      >
        <Typography variant="body2" component="span" color="text.primary">
          <DraftStateLabel state={detail.state} />
        </Typography>
        <Typography variant="body2" component="span">
          Slug: {detail.slug || "-"}
        </Typography>
        <Typography variant="body2" component="span">
          Confidence: {Math.round(detail.confidence * 100)}%
        </Typography>
        {detail.reviewed_at && (
          <Typography variant="body2" component="span">
            Reviewed: {formatWhen(detail.reviewed_at)}
          </Typography>
        )}
      </Box>
      {detail.state === "rejected" && detail.reject_reason && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Rejected: {detail.reject_reason}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 3 }}>
        Accepting adds this draft to the job's export. Nothing is published
        automatically, and the service stays unverified until staff verify it.
        Check each field against its evidence before accepting.
      </Alert>

      <Grid container spacing={3}>
        {/* -- left: editable YAML ---------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
                Draft record
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={18}
                label="Service record (YAML)"
                value={yaml}
                onChange={(e) => setYaml(e.target.value)}
                slotProps={{ htmlInput: { spellCheck: false } }}
                sx={{ "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
              />

              <Box
                sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}
              >
                <Button
                  variant="outlined"
                  startIcon={<SaveIcon />}
                  disabled={!dirty || busy !== ""}
                  onClick={() =>
                    run("save", () => saveDraftYaml(detail.id, yaml), "Saved and revalidated.")
                  }
                >
                  {busy === "save" ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outlined"
                  disabled={!dirty || busy !== ""}
                  onClick={() => setYaml(detail.yaml)}
                >
                  Discard changes
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  disabled={Boolean(acceptReason) || busy !== ""}
                  aria-describedby={acceptReason ? "accept-block-reason" : undefined}
                  onClick={() =>
                    run("accept", () => acceptDraft(detail.id), "Draft accepted.")
                  }
                >
                  {busy === "accept" ? "Accepting..." : "Accept"}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelIcon />}
                  disabled={Boolean(rejectReasonBlock) || busy !== ""}
                  onClick={() => {
                    setRejectReason("");
                    setActionError("");
                    setRejectOpen(true);
                  }}
                >
                  Reject
                </Button>
              </Box>
              {(acceptReason || rejectReasonBlock) && (
                <Typography
                  id="accept-block-reason"
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  {acceptReason ?? rejectReasonBlock}
                </Typography>
              )}

              <Box aria-live="polite">
                {notice && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    {notice}
                  </Alert>
                )}
                {actionError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {actionError}
                  </Alert>
                )}
              </Box>

              {errors.length > 0 && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" component="h3">
                    {errors.length} validator {errors.length === 1 ? "error" : "errors"}
                  </Typography>
                  <IssueList issues={errors} />
                </Alert>
              )}
              {warnings.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" component="h3">
                    {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
                  </Typography>
                  <IssueList issues={warnings} />
                </Alert>
              )}
              {errors.length === 0 && warnings.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  The validator found no errors or warnings.
                </Typography>
              )}

              {rows.length > 0 && (
                <Box component="nav" aria-label="Fields" sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" component="h3" gutterBottom>
                    Jump to evidence
                  </Typography>
                  <Box
                    component="ul"
                    sx={{
                      m: 0,
                      p: 0,
                      listStyle: "none",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 1.5,
                    }}
                  >
                    {rows.map((row) => (
                      <li key={row.anchorId}>
                        <Link href={`#${row.anchorId}`}>
                          {row.field}
                          {row.missing
                            ? " (no evidence)"
                            : ` (${row.sources.length})`}
                        </Link>
                      </li>
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* -- right: evidence -------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
                Evidence
              </Typography>

              {detail.provenance.flags.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" component="h3">
                    Flags to check
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                    {detail.provenance.flags.map((flag, i) => {
                      const anchor = anchorFor.get(flag.field);
                      return (
                        <li key={`${flag.field}-${i}`}>
                          {anchor ? (
                            <Link href={`#${anchor}`} color="inherit" fontWeight={600}>
                              {flag.field}
                            </Link>
                          ) : (
                            <strong>{flag.field || "General"}</strong>
                          )}
                          : {flag.message}
                        </li>
                      );
                    })}
                  </Box>
                </Alert>
              )}

              {rows.length === 0 && (
                <Typography color="text.secondary">
                  No evidence was recorded for this draft.
                </Typography>
              )}

              {rows.map((row) => (
                <Box
                  key={row.anchorId}
                  id={row.anchorId}
                  component="section"
                  tabIndex={-1}
                  aria-labelledby={`${row.anchorId}-title`}
                  sx={{
                    py: 2,
                    borderTop: "1px solid",
                    borderColor: "divider",
                    scrollMarginTop: 80,
                    "&:target": { bgcolor: "action.selected" },
                  }}
                >
                  <Typography
                    id={`${row.anchorId}-title`}
                    variant="subtitle1"
                    component="h3"
                    fontWeight={600}
                    sx={{ fontFamily: "monospace" }}
                  >
                    {row.field}
                  </Typography>
                  {row.flags.map((message, i) => (
                    <Alert key={i} severity="warning" sx={{ my: 1 }}>
                      {message}
                    </Alert>
                  ))}
                  {row.missing ? (
                    <Typography color="warning.main" sx={{ mt: 0.5 }}>
                      No supporting text found
                    </Typography>
                  ) : (
                    row.sources.map((src, i) => {
                      const href = safeHttpUrl(src.url);
                      return (
                        <Box key={`${src.url}-${i}`} sx={{ mt: 1.5 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {src.title || "Untitled page"}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ wordBreak: "break-all" }}
                          >
                            {src.url}{" "}
                            {href && (
                              <Link
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open source for ${row.field} in a new tab`}
                              >
                                open
                              </Link>
                            )}
                          </Typography>
                          <Box
                            component="blockquote"
                            sx={{
                              m: 0,
                              mt: 0.5,
                              pl: 1.5,
                              borderLeft: "3px solid",
                              borderColor: "divider",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            <Typography variant="body2">{src.quote}</Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            Retrieved {formatWhen(src.retrieved_at)}
                          </Typography>
                        </Box>
                      );
                    })
                  )}
                </Box>
              ))}

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" component="h3" fontWeight={600}>
                Possible duplicates
              </Typography>
              {detail.duplicates.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  None found in the data pack or other drafts.
                </Typography>
              ) : (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {detail.duplicates.map((dup) => (
                    <li key={`${dup.source}-${dup.slug}`}>
                      <Typography variant="body2" component="span" fontWeight={600}>
                        {dup.name}
                      </Typography>{" "}
                      <Typography variant="body2" component="span" color="text.secondary">
                        ({dup.slug}, {dup.source === "pack" ? "in the data pack" : "another draft"})
                      </Typography>
                      {dup.reasons.length > 0 && (
                        <Typography variant="body2">
                          {dup.reasons.join("; ")}
                        </Typography>
                      )}
                    </li>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Reject draft</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            required
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            helperText="Say why, e.g. not a local service, or the evidence does not support it."
            sx={{ mt: 1 }}
          />
          {actionError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {actionError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={!rejectReason.trim() || busy !== ""}
            onClick={async () => {
              const ok = await run(
                "reject",
                () => rejectDraft(detail.id, rejectReason.trim()),
                "Draft rejected.",
              );
              if (ok) setRejectOpen(false);
            }}
          >
            {busy === "reject" ? "Rejecting..." : "Reject draft"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
