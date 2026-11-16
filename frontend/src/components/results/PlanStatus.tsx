import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { makeResultsT } from "@/lib/resultsI18n";

/** "ready" once a plan is shown (or none is needed). */
export type PlanStatusKind = "ready" | "building" | "failed";

const visuallyHidden = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px",
} as const;

/**
 * Screen-reader announcement of the plan build. Mounted for the life of the
 * results page so changes to its text are announced; renders nothing visible.
 */
export function PlanAnnouncer({
  status,
  announceReady,
  language,
}: {
  status: PlanStatusKind;
  /** Say "Your plan is ready." only after a build the resident waited on. */
  announceReady: boolean;
  language?: string;
}) {
  const t = makeResultsT(language);
  const text =
    status === "building"
      ? t("plan_building")
      : status === "failed"
        ? t("plan_failed")
        : announceReady
          ? t("plan_ready")
          : "";
  return (
    <Box role="status" aria-live="polite" sx={visuallyHidden}>
      {text}
    </Box>
  );
}

interface PlanStatusProps {
  status: Exclude<PlanStatusKind, "ready">;
  language?: string;
  /** Compact one-line form for the all-matches view. */
  compact?: boolean;
  onRetry: () => void;
  onShowAll?: () => void;
}

/** Visible in-progress / failed state for the plan area. */
export default function PlanStatus({
  status,
  language,
  compact,
  onRetry,
  onShowAll,
}: PlanStatusProps) {
  const t = makeResultsT(language);

  if (status === "failed") {
    return (
      <Alert
        severity="info"
        className="no-print"
        sx={{ mb: 2.5 }}
        action={
          <Button color="inherit" size="small" onClick={onRetry} sx={{ fontWeight: 600 }}>
            {t("try_again")}
          </Button>
        }
      >
        {t("plan_failed")}
      </Alert>
    );
  }

  return (
    <Paper
      variant="outlined"
      className="no-print"
      sx={{
        mb: compact ? 3 : 2.5,
        p: compact ? 2 : { xs: 2.5, sm: 3 },
        borderRadius: (theme) => theme.shape.radius.card,
        borderColor: "primary.light",
        bgcolor: "brand.primarySoft",
      }}
    >
      <Typography
        variant={compact ? "subtitle2" : "h6"}
        component="p"
        fontWeight={700}
        sx={{ mb: compact ? 1 : 0.5 }}
      >
        {t("plan_building")}
      </Typography>
      {!compact && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("plan_building_detail")}
        </Typography>
      )}
      <LinearProgress aria-label={t("plan_building")} sx={{ borderRadius: 1 }} />
      {onShowAll && (
        <Button
          variant="outlined"
          onClick={onShowAll}
          sx={{ mt: 2, bgcolor: "background.paper" }}
        >
          {t("browse_all")}
        </Button>
      )}
    </Paper>
  );
}
