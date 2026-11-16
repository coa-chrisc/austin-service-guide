import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import RefreshIcon from "@mui/icons-material/Refresh";

import { ApiError } from "@/lib/api";
import {
  getJobsConfig,
  listJobs,
  type Job,
  type JobsConfig,
} from "@/lib/researchApi";
import AdminTokenButton from "../AdminTokenButton";
import StartResearchForm from "./StartResearchForm";
import {
  JOB_STATE_COLORS,
  JOB_STATE_LABELS,
  describeError,
  formatUsd,
  formatWhen,
  placeLabel,
} from "./draftView";

type ConfigStatus = "loading" | "ready" | "off" | "error";

export default function ResearchJobs() {
  const [config, setConfig] = useState<JobsConfig | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigStatus>("loading");
  const [configError, setConfigError] = useState("");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [jobsError, setJobsError] = useState("");

  const loadJobs = useCallback(async () => {
    setJobsError("");
    try {
      const res = await listJobs();
      setJobs(res.items);
    } catch (err) {
      setJobsError(describeError(err));
    }
  }, []);

  const load = useCallback(async () => {
    // A refresh keeps the start form mounted (and its input) while reloading.
    setConfigStatus((prev) => (prev === "ready" ? prev : "loading"));
    setConfigError("");
    try {
      const cfg = await getJobsConfig();
      setConfig(cfg);
      setConfigStatus("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setConfigStatus("off");
        return;
      }
      setConfigError(describeError(err));
      setConfigStatus("error");
      return;
    }
    await loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    load();
  }, [load]);

  /* -- render -------------------------------------------------------- */
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: 2,
        }}
      >
        <Typography variant="h5" component="h1" fontWeight={700}>
          Research agent
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <AdminTokenButton />
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>
            Refresh
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        The research agent searches the public web for local services and
        drafts catalog entries, with a source link and quote for every field.
        Drafts are never published automatically: staff review each one, and
        accepted drafts can be downloaded as a data pack. Every service stays
        unverified until staff verify it.
      </Alert>

      {configStatus === "loading" && <Skeleton height={160} />}

      {configStatus === "off" && (
        <Alert severity="warning">
          The research agent is not turned on for this deployment.
        </Alert>
      )}

      {configStatus === "error" && (
        <Alert severity="error">{configError}</Alert>
      )}

      {configStatus === "ready" && config && !config.research_enabled && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Starting new research runs is turned off for this deployment. Past
          jobs are listed below.
        </Alert>
      )}

      {configStatus === "ready" && config?.research_enabled && (
        <StartResearchForm config={config} />
      )}

      {configStatus === "ready" && (
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
              Research jobs
            </Typography>
            {jobsError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {jobsError}
              </Alert>
            )}
            {jobs === null && !jobsError && <Skeleton height={120} />}
            {jobs !== null && jobs.length === 0 && (
              <Typography color="text.secondary">No research jobs yet.</Typography>
            )}
            {jobs !== null && jobs.length > 0 && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Place</TableCell>
                      <TableCell>Topic</TableCell>
                      <TableCell>State</TableCell>
                      <TableCell align="right">Searches</TableCell>
                      <TableCell align="right">Pages</TableCell>
                      <TableCell align="right">Drafts</TableCell>
                      <TableCell align="right">Est. cost</TableCell>
                      <TableCell>Created</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow key={job.id} hover>
                        <TableCell>
                          <Link
                            component={RouterLink}
                            to={`/admin/research/${encodeURIComponent(job.id)}`}
                            fontWeight={600}
                          >
                            {placeLabel(job.params.place)}
                          </Link>
                        </TableCell>
                        <TableCell>{job.params.topic || "-"}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={JOB_STATE_LABELS[job.state] ?? job.state}
                            color={JOB_STATE_COLORS[job.state] ?? "default"}
                          />
                        </TableCell>
                        <TableCell align="right">{job.counters.searches}</TableCell>
                        <TableCell align="right">{job.counters.pages}</TableCell>
                        <TableCell align="right">{job.counters.drafts}</TableCell>
                        <TableCell align="right">
                          {formatUsd(job.counters.estimated_cost_usd)}
                        </TableCell>
                        <TableCell>{formatWhen(job.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
