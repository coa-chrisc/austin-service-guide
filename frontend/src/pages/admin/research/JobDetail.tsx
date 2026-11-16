import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import StopCircleIcon from "@mui/icons-material/StopCircle";

import { ApiError, getCategories } from "@/lib/api";
import {
  approvePlan,
  cancelJob,
  downloadJobExport,
  getJob,
  getJobEvents,
  listDrafts,
  type DraftSummary,
  type Job,
  type JobEvent,
} from "@/lib/researchApi";
import type { ServiceCategory } from "@/types";
import AdminTokenButton from "../AdminTokenButton";
import { CoverageReport, DraftsTable, PlanReview, ProgressLog } from "./JobPanels";
import {
  JOB_STATE_COLORS,
  JOB_STATE_LABELS,
  canCancel,
  coverageView,
  describeError,
  formatUsd,
  formatWhen,
  isPollingState,
  jobSummary,
  placeLabel,
  stopReasonText,
} from "./draftView";

const POLL_MS = 3000;

export default function JobDetail() {
  const { id = "" } = useParams<{ id: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pollError, setPollError] = useState("");
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<"" | "approve" | "cancel" | "download">("");
  const [actionError, setActionError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  // Which job the fetched data belongs to, and the events cursor. Responses
  // for a job the page has since left are dropped.
  const currentId = useRef(id);
  const afterRef = useRef(0);

  const refreshEvents = useCallback(async (jobId: string) => {
    const res = await getJobEvents(jobId, afterRef.current);
    if (currentId.current !== jobId) return;
    afterRef.current = Math.max(afterRef.current, res.next_after);
    if (res.items.length) {
      setEvents((prev) => {
        const last = prev.length ? prev[prev.length - 1].id : -Infinity;
        return [...prev, ...res.items.filter((e) => e.id > last)];
      });
    }
  }, []);

  const refreshDrafts = useCallback(async (jobId: string) => {
    const res = await listDrafts({ job: jobId });
    if (currentId.current === jobId) setDrafts(res.items);
  }, []);

  const loadAll = useCallback(async () => {
    const jobId = id;
    setLoadError("");
    setPollError("");
    try {
      const next = await getJob(jobId);
      if (currentId.current !== jobId) return;
      setJob(next);
      await Promise.all([refreshEvents(jobId), refreshDrafts(jobId)]);
    } catch (err) {
      if (currentId.current === jobId) setLoadError(describeError(err));
    }
  }, [id, refreshEvents, refreshDrafts]);

  // New job id: reset everything and load it.
  useEffect(() => {
    currentId.current = id;
    afterRef.current = 0;
    setJob(null);
    setEvents([]);
    setDrafts(null);
    loadAll();
  }, [id, loadAll]);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((res) => {
        if (!cancelled) setCategories(res);
      })
      .catch((err) => console.error("Failed to load categories", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll while the worker is moving; stop once the job waits on staff or ends.
  const polling = job !== null && job.id === id && isPollingState(job.state);
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const next = await getJob(id);
        if (cancelled) return;
        setJob(next);
        await Promise.all([refreshEvents(id), refreshDrafts(id)]);
        if (cancelled) return;
        setPollError("");
      } catch (err) {
        if (cancelled) return;
        setPollError(describeError(err));
        // Token or feature problems will not fix themselves; stop polling.
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          return;
        }
      }
      // A finished job flips `polling` off, which cancels this loop.
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [polling, id, refreshEvents, refreshDrafts]);

  // Plan review: keep every query until staff untick some.
  const planSize = job?.plan?.queries.length ?? 0;
  useEffect(() => {
    setKeep(new Set(Array.from({ length: planSize }, (_, i) => i)));
  }, [job?.id, planSize]);


  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.slug, c.name])) as Record<string, string>,
    [categories],
  );

  if (loadError && !job) {
    return (
      <Box>
        <Button component={RouterLink} to="/admin/research" startIcon={<ArrowBackIcon />}>
          Research agent
        </Button>
        <Alert severity="error" sx={{ mt: 2 }} action={<AdminTokenButton />}>
          {loadError}
        </Alert>
        <Button startIcon={<RefreshIcon />} onClick={loadAll} sx={{ mt: 2 }}>
          Try again
        </Button>
      </Box>
    );
  }

  if (!job) {
    return (
      <Box>
        <Skeleton height={48} />
        <Skeleton height={240} />
      </Box>
    );
  }

  const handleApprove = async () => {
    setBusy("approve");
    setActionError("");
    try {
      const next = await approvePlan(job.id, [...keep].sort((a, b) => a - b));
      setJob(next);
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy("");
    }
  };

  const handleCancel = async () => {
    setCancelOpen(false);
    setBusy("cancel");
    setActionError("");
    try {
      const next = await cancelJob(job.id);
      setJob(next);
      await refreshEvents(job.id).catch(() => undefined);
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy("");
    }
  };

  const handleDownload = async () => {
    setBusy("download");
    setActionError("");
    try {
      await downloadJobExport(job.id);
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy("");
    }
  };

  const c = job.counters;
  const stopText = stopReasonText(job);
  const requestedCategories = job.params.categories?.length
    ? job.params.categories
    : categories.map((cat) => cat.slug);
  const coverage = job.report
    ? coverageView(job.report.coverage, requestedCategories)
    : null;
  const acceptedCount = (drafts ?? []).filter(
    (d) => d.state === "accepted" || d.state === "merged",
  ).length;
  const plan = job.state === "awaiting_plan" ? job.plan : null;

  const counters: [string, string][] = [
    ["Steps", `${c.steps} / ${job.caps.max_steps}`],
    ["Searches", `${c.searches} / ${job.caps.max_searches}`],
    ["Pages read", `${c.pages} / ${job.caps.max_pages}`],
    ["Drafts", `${c.drafts} / ${job.caps.max_drafts}`],
    [
      "Estimated cost",
      `${formatUsd(c.estimated_cost_usd)} / ${formatUsd(job.caps.max_cost_usd)}`,
    ],
    ["Tokens in / out", `${c.input_tokens} / ${c.output_tokens}`],
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Button component={RouterLink} to="/admin/research" startIcon={<ArrowBackIcon />}>
          Research agent
        </Button>
        <Box sx={{ flex: 1 }} />
        <AdminTokenButton />
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadAll}>
          Refresh
        </Button>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Typography variant="h5" component="h1" fontWeight={700}>
          {placeLabel(job.params.place)}
          {job.params.topic ? `: ${job.params.topic}` : ""}
        </Typography>
        <Chip
          label={JOB_STATE_LABELS[job.state] ?? job.state}
          color={JOB_STATE_COLORS[job.state] ?? "default"}
        />
      </Box>
      <Typography
        role="status"
        aria-live="polite"
        sx={{ mt: 1, mb: 2 }}
        color="text.secondary"
      >
        {jobSummary(job)}
      </Typography>

      {pollError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {pollError}
        </Alert>
      )}
      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}
      {job.state === "failed" && job.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          The run failed: {job.error}
        </Alert>
      )}
      {stopText && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {stopText}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Grid container spacing={2}>
            {counters.map(([label, value]) => (
              <Grid key={label} size={{ xs: 6, sm: 4, md: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography fontWeight={600}>{value}</Typography>
              </Grid>
            ))}
          </Grid>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Created {formatWhen(job.created_at)}
            {job.created_by ? ` by ${job.created_by}` : ""}. Started{" "}
            {formatWhen(job.started_at)}. Finished {formatWhen(job.finished_at)}.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
            {canCancel(job.state) && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<StopCircleIcon />}
                disabled={busy !== ""}
                onClick={() => setCancelOpen(true)}
              >
                {busy === "cancel" ? "Cancelling..." : "Cancel run"}
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              disabled={busy !== "" || acceptedCount === 0}
              aria-describedby="download-help"
              onClick={handleDownload}
            >
              {busy === "download" ? "Preparing..." : "Download accepted drafts (zip)"}
            </Button>
          </Box>
          <Typography
            id="download-help"
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            {acceptedCount === 0
              ? "Accept at least one draft to download a data pack."
              : `${acceptedCount} accepted ${acceptedCount === 1 ? "draft" : "drafts"}. The zip is a data pack to review and add by hand; nothing is published.`}
          </Typography>
        </CardContent>
      </Card>

      {plan && (
        <PlanReview
          plan={plan}
          keep={keep}
          setKeep={setKeep}
          categoryNames={categoryNames}
          busy={busy}
          onApprove={handleApprove}
        />
      )}

      <ProgressLog events={events} />

      {job.report && coverage && (
        <CoverageReport
          report={job.report}
          coverage={coverage}
          categoryNames={categoryNames}
        />
      )}

      <DraftsTable drafts={drafts} />

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)}>
        <DialogTitle>Cancel this run?</DialogTitle>
        <DialogContent>
          <Typography>
            The research worker is asked to stop this run. A cancelled run
            cannot be restarted; start a new one instead.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>Keep running</Button>
          <Button variant="contained" color="error" onClick={handleCancel}>
            Cancel run
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
