import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DownloadIcon from "@mui/icons-material/Download";

import DraftCard from "./DraftCard";
import { ImportError, exportItems, validateItems, type DraftService, type DraftsResult } from "./importApi";
import { exportPlan, problemsByKey, type Decision } from "./reviewItems";

/** Every checked key gets an entry, so a clean result clears old errors. */
function checked(found: Record<string, string[]>, keys: string[]): Record<string, string[]> {
  return { ...Object.fromEntries(keys.map((k) => [k, [] as string[]])), ...found };
}

interface Props {
  result: DraftsResult;
  grouped: boolean;
  busy: boolean;
  onRegroup: (group: boolean) => void;
}

export default function DraftReview({ result, grouped, busy, onRegroup }: Props) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [edits, setEdits] = useState<Record<string, DraftService>>({});
  // Server check results per draft key; a draft's entry is cleared when it is edited.
  const [problems, setProblems] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<{ severity: "success" | "error" | "info"; text: string } | null>(null);
  const [working, setWorking] = useState(false);

  const plan = useMemo(() => exportPlan(result.drafts, decisions, edits), [result.drafts, decisions, edits]);
  const counts = useMemo(() => {
    const c = { accept: 0, merge: 0, reject: 0, pending: 0 };
    for (const d of result.drafts) c[(decisions[d.key] ?? { action: "pending" }).action] += 1;
    return c;
  }, [result.drafts, decisions]);

  const acceptClean = () => {
    const next = { ...decisions };
    for (const d of result.drafts) {
      if ((next[d.key]?.action ?? "pending") === "pending" && d.errors.length === 0 && d.duplicates.length === 0) {
        next[d.key] = { action: "accept" };
      }
    }
    setDecisions(next);
  };

  const run = async (kind: "check" | "export") => {
    if (plan.items.length === 0) {
      setStatus({ severity: "info", text: "Accept or merge at least one draft first." });
      return;
    }
    setWorking(true);
    setStatus(null);
    try {
      if (kind === "check") {
        const res = await validateItems(plan.items);
        setProblems(checked(problemsByKey(res.problems, plan.keys), plan.keys));
        setStatus(
          res.ok
            ? { severity: "success", text: `All ${plan.items.length} chosen drafts pass the data-pack checks.` }
            : { severity: "error", text: `${res.problems.length} draft(s) have errors. They are listed on each draft.` },
        );
      } else {
        const blob = await exportItems(plan.items);
        setProblems({});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `partner-import-drafts.zip`;
        link.click();
        URL.revokeObjectURL(url);
        setStatus({ severity: "success", text: `Downloaded ${plan.items.length} draft file(s) with review-issues.csv.` });
      }
    } catch (err) {
      if (err instanceof ImportError) {
        if (err.problems.length) setProblems(checked(problemsByKey(err.problems, plan.keys), plan.keys));
        setStatus({ severity: "error", text: err.message });
      } else {
        setStatus({ severity: "error", text: "The request failed. Check your connection and try again." });
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2">
        {result.rows_read.toLocaleString()} rows read from {result.table.name}, {result.drafts.length} draft(s)
        {result.rows_skipped ? `, ${result.rows_skipped} row(s) skipped with no organisation or service name` : ""}.
        Accepted: {counts.accept}. Merged: {counts.merge}. Rejected: {counts.reject}. Not decided: {counts.pending}.
      </Typography>
      {result.model.note && <Alert severity="info">{result.model.note}</Alert>}
      {result.pack_issues.length > 0 && (
        <Alert severity="warning">
          {result.pack_issues.map((i) => `${i.file}: ${i.message}`).join(" ")}
        </Alert>
      )}
      {problems[""] && <Alert severity="error">{problems[""].join(" ")}</Alert>}

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Button variant="outlined" onClick={acceptClean} disabled={working} sx={{ textTransform: "none", fontWeight: 600 }}>
          Accept drafts with no errors or duplicates
        </Button>
        <Button
          variant="outlined"
          onClick={() => onRegroup(!grouped)}
          disabled={busy || working}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {grouped ? "Keep every row as its own draft" : "Combine rows that differ only by location"}
        </Button>
        <Button variant="outlined" onClick={() => run("check")} disabled={working} sx={{ textTransform: "none", fontWeight: 600 }}>
          Check chosen drafts
        </Button>
        <Button
          variant="contained"
          disableElevation
          startIcon={<DownloadIcon />}
          onClick={() => run("export")}
          disabled={working}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Download YAML for {plan.items.length} draft(s)
        </Button>
      </Stack>
      <div aria-live="polite">{status && <Alert severity={status.severity}>{status.text}</Alert>}</div>

      {result.drafts.map((draft) => (
        <DraftCard
          key={draft.key}
          draft={draft}
          service={edits[draft.key] ?? draft.service}
          decision={decisions[draft.key] ?? { action: "pending" }}
          checkedErrors={problems[draft.key]}
          edited={Boolean(edits[draft.key])}
          onDecision={(d) => setDecisions((prev) => ({ ...prev, [draft.key]: d }))}
          onEdit={(s) => {
            setEdits((prev) => ({ ...prev, [draft.key]: s }));
            setProblems((prev) => {
              const next = { ...prev };
              delete next[draft.key];
              return next;
            });
          }}
        />
      ))}
    </Stack>
  );
}
