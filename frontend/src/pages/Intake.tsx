import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import ChatInterface from "@/components/chat/ChatInterface";
import { startIntake } from "@/lib/api";
import { getStoredLanguage } from "@/components/common/LanguageSelector";
import type { IntakeSession } from "@/types";

export default function Intake() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const language = getStoredLanguage();
    const lifeEvent = searchParams.get("event") || undefined;

    startIntake(language, lifeEvent)
      .then((s) => {
        setSession(s);
      })
      .catch((err) => {
        setError(
          err.message || "Failed to start intake session. Please try again.",
        );
      })
      .finally(() => setLoading(false));
  }, [searchParams]);

  const handleComplete = (sessionId: string) => {
    navigate(`/results/${sessionId}`);
  };

  if (loading) {
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

  if (error) {
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
