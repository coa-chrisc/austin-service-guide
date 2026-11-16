// Sections of the research job page (JobDetail.tsx), split out to keep the
// page readable. Each is presentational: state and API calls stay in the page.

import { useEffect, useRef } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TaskAltIcon from "@mui/icons-material/TaskAlt";

import type {
  DraftSummary,
  JobEvent,
  JobPlan,
  JobReport,
} from "@/lib/researchApi";
import { DraftStateLabel } from "./DraftReview";
import type { CoverageView } from "./draftView";

function eventTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
}

/** Checkbox per planned search, and the Approve button. */
export function PlanReview({
  plan,
  keep,
  setKeep,
  categoryNames,
  busy,
  onApprove,
}: {
  plan: JobPlan;
  keep: Set<number>;
  setKeep: React.Dispatch<React.SetStateAction<Set<number>>>;
  categoryNames: Record<string, string>;
  /** Non-empty while any job action is in flight. */
  busy: string;
  onApprove: () => void;
}) {
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
          Review the search plan
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Untick any search you do not want run, then approve. Nothing is
          searched until you approve.
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
          <Button
            size="small"
            onClick={() => setKeep(new Set(plan.queries.map((_, i) => i)))}
          >
            Select all
          </Button>
          <Button size="small" onClick={() => setKeep(new Set())}>
            Clear
          </Button>
        </Box>
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
          {plan.queries.map((q, i) => (
            <li key={i}>
              <FormControlLabel
                sx={{ alignItems: "flex-start", my: 0.5 }}
                control={
                  <Checkbox
                    checked={keep.has(i)}
                    onChange={(e) =>
                      setKeep((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        return next;
                      })
                    }
                    sx={{ pt: 0.5 }}
                  />
                }
                label={
                  <Box>
                    <Typography fontWeight={600}>{q.query}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {categoryNames[q.category] ?? q.category}, {q.level}
                      {q.rationale ? `. ${q.rationale}` : ""}
                    </Typography>
                  </Box>
                }
              />
            </li>
          ))}
        </Box>
        {plan.expected_sources.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" component="h3">
              Expected sources
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {plan.expected_sources.map((src) => (
                <li key={src}>
                  <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                    {src}
                  </Typography>
                </li>
              ))}
            </Box>
          </Box>
        )}
        <Button
          variant="contained"
          startIcon={<TaskAltIcon />}
          disabled={busy !== "" || keep.size === 0}
          onClick={onApprove}
          sx={{ mt: 2 }}
        >
          {busy === "approve"
            ? "Approving..."
            : `Approve ${keep.size} of ${plan.queries.length} searches`}
        </Button>
        {keep.size === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Keep at least one search, or cancel the run.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

/** Text log of worker events; follows new lines unless staff scrolled up. */
export function ProgressLog({ events }: { events: JobEvent[] }) {
  const logRef = useRef<HTMLOListElement | null>(null);
  const stickToBottom = useRef(true);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    const el = logRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [events]);

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
          Progress log
        </Typography>
        {events.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No progress yet.
          </Typography>
        ) : (
          <Box
            component="ol"
            ref={logRef}
            onScroll={handleScroll}
            tabIndex={0}
            aria-label="Progress log"
            sx={{
              m: 0,
              p: 1.5,
              listStyle: "none",
              maxHeight: 320,
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: 13,
              bgcolor: "action.hover",
              borderRadius: 1,
            }}
          >
            {events.map((ev) => (
              <li key={ev.id}>
                <Box component="span" sx={{ color: "text.secondary" }}>
                  {eventTime(ev.at)}
                </Box>{" "}
                <Box
                  component="span"
                  sx={{
                    fontWeight: 600,
                    color: ev.type === "warning" ? "warning.main" : "text.primary",
                  }}
                >
                  {ev.type}
                </Box>{" "}
                {ev.message}
              </li>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

/** Coverage per category and level (gaps listed), unreachable sources, notices. */
export function CoverageReport({
  report,
  coverage,
  categoryNames,
}: {
  report: JobReport;
  coverage: CoverageView;
  categoryNames: Record<string, string>;
}) {
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
          Coverage
        </Typography>
        {coverage.emptyCategories.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No drafts found for:{" "}
            {coverage.emptyCategories
              .map((cat) => categoryNames[cat] ?? cat)
              .join(", ")}
            .
          </Alert>
        )}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell>Level</TableCell>
                <TableCell align="right">Drafts</TableCell>
                <TableCell align="right">With full evidence</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {coverage.rows.map((row) => (
                <TableRow key={`${row.category}-${row.level}`}>
                  <TableCell>{categoryNames[row.category] ?? row.category}</TableCell>
                  <TableCell>{row.level}</TableCell>
                  <TableCell align="right">
                    {row.drafts === 0 ? "0 (none found)" : row.drafts}
                  </TableCell>
                  <TableCell align="right">{row.full_evidence}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {report.unreachable.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" component="h3">
              Sources that could not be reached
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {report.unreachable.map((src) => (
                <li key={src}>
                  <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                    {src}
                  </Typography>
                </li>
              ))}
            </Box>
          </Box>
        )}
        {report.notices.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" component="h3">
              Notices
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {report.notices.map((note, i) => (
                <li key={i}>
                  <Typography variant="body2">{note}</Typography>
                </li>
              ))}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

/** The job's drafts with review state and validator counts. */
export function DraftsTable({ drafts }: { drafts: DraftSummary[] | null }) {
  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
          Drafts
        </Typography>
        {drafts === null ? (
          <Skeleton height={80} />
        ) : drafts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No drafts yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Service</TableCell>
                  <TableCell>Review state</TableCell>
                  <TableCell align="right">Confidence</TableCell>
                  <TableCell align="right">Errors</TableCell>
                  <TableCell align="right">Warnings</TableCell>
                  <TableCell align="right">Duplicates</TableCell>
                  <TableCell align="right">Flags</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {drafts.map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/admin/research/drafts/${encodeURIComponent(d.id)}`}
                        fontWeight={600}
                      >
                        {d.name || d.slug || "Untitled draft"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <DraftStateLabel state={d.state} />
                    </TableCell>
                    <TableCell align="right">
                      {Math.round(d.confidence * 100)}%
                    </TableCell>
                    <TableCell align="right">{d.error_count}</TableCell>
                    <TableCell align="right">{d.warning_count}</TableCell>
                    <TableCell align="right">{d.duplicate_count}</TableCell>
                    <TableCell align="right">{d.flag_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
