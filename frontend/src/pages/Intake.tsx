import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import RefreshIcon from "@mui/icons-material/Refresh";
import ChatInterface from "@/components/chat/ChatInterface";
import { startIntake } from "@/lib/api";
import { getStoredLanguage } from "@/components/common/LanguageSelector";
import {
  getActiveSession,
  setActiveSession,
  clearActiveSession,
} from "@/lib/session";
import type { IntakeSession } from "@/types";

type Phase = "checking" | "recovering" | "starting" | "ready" | "error";

export default function Intake() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [recoveredId, setRecoveredId] = useState<string | null>(null);

  const lifeEvent = searchParams.get("event") || undefined;
  const skipRecovery = !!lifeEvent || searchParams.get("fresh") === "1";

  useEffect(() => {
    // If the user explicitly requested a fresh start (life-event entry or
    // ?fresh=1), skip the recovery prompt entirely.
    if (skipRecovery) {
      beginNewIntake();
      return;
    }

    const existing = getActiveSession();
    if (existing) {
      setRecoveredId(existing);
      setPhase("recovering");
    } else {
      beginNewIntake();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const beginNewIntake = () => {
    setPhase("starting");
    const language = getStoredLanguage();
    startIntake(language, lifeEvent)
      .then((s) => {
        setSession(s);
        setActiveSession(s.id);
        setPhase("ready");
      })
      .catch((err) => {
        setError(
          err.message || "Failed to start intake session. Please try again.",
        );
        setPhase("error");
      });
  };

  const handleComplete = (sessionId: string) => {
    navigate(`/results/${sessionId}`);
  };

  const handleResumePlan = () => {
    if (recoveredId) navigate(`/results/${recoveredId}`);
  };

  const handleStartOver = () => {
    clearActiveSession();
    setRecoveredId(null);
    beginNewIntake();
  };

  if (phase === "recovering" && recoveredId) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 64px)",
          p: 3,
        }}
      >
        <Card
          sx={{
            maxWidth: 480,
            width: "100%",
            borderRadius: 3,
            border: "2px solid",
            borderColor: "primary.main",
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                mb: 2,
                color: "primary.main",
              }}
            >
              <AssignmentTurnedInIcon fontSize="large" />
              <Typography variant="h6" fontWeight={700}>
                You already have a plan in progress
              </Typography>
            </Box>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 3, lineHeight: 1.6 }}
            >
              You finished an intake earlier. Pick up where you left off, or
              start a fresh conversation.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<AssignmentTurnedInIcon />}
                onClick={handleResumePlan}
                sx={{
                  minHeight: 52,
                  fontWeight: 700,
                  borderRadius: "26px",
                }}
              >
                See my plan
              </Button>
              <Button
                variant="outlined"
                size="large"
                fullWidth
                startIcon={<RefreshIcon />}
                onClick={handleStartOver}
                sx={{
                  minHeight: 52,
                  fontWeight: 600,
                  borderRadius: "26px",
                }}
              >
                Start over
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (phase === "checking" || phase === "starting") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 64px)",
          gap: 2,
        }}
      >
        <CircularProgress size={48} />
        <Typography variant="body1" color="text.secondary">
          Starting your session...
        </Typography>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 64px)",
          p: 3,
        }}
      >
        <Alert severity="error" sx={{ maxWidth: 500 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!session) return null;

  return (
    <Box sx={{ height: "calc(100vh - 64px)" }}>
      <ChatInterface session={session} onComplete={handleComplete} />
    </Box>
  );
}
