import { useEffect, useRef, useState } from "react";
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
import MicIcon from "@mui/icons-material/Mic";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ChatInterface from "@/components/chat/ChatInterface";
import { startIntake, getIntakePlanSummary } from "@/lib/api";
import { getStoredLanguage } from "@/components/common/LanguageSelector";
import {
  getActiveSession,
  setActiveSession,
  clearActiveSession,
} from "@/lib/session";
import type { IntakeSession } from "@/types";

type IntakeMode = "text" | "voice";
type Phase = "checking" | "choosing" | "recovering" | "starting" | "ready";

// Mirrors backend `_canonical_life_event_slug` in app/services/ai.py.
// Keep these in sync; the backend is the source of truth for canonical slugs.
const LIFE_EVENT_ALIASES: Record<string, string> = {
  "job-loss": "lost-job",
  "food-help": "need-food",
  "facing-eviction": "housing-crisis",
  "behind-on-rent": "housing-crisis",
  "having-baby": "new-baby",
  "medical-help": "need-healthcare",
  healthcare: "need-healthcare",
  "senior-care": "senior-help",
  veteran: "veteran-transition",
  "veteran-benefits": "veteran-transition",
  "legal-help": "legal-trouble",
  childcare: "child-care",
};

const LIFE_EVENT_COPY: Record<string, { heading: string; body: string }> = {
  "lost-job": {
    heading: "You told us you recently lost a job or had an employment change.",
    body: "Our guide can help look for support with work, food, rent, health coverage, and other needs. We'll ask a few questions to narrow down the right services.",
  },
  "need-food": {
    heading: "You told us you need help with food.",
    body: "Our guide can help look for food pantries, meals, SNAP help, and related support. We'll ask a few questions to find options that fit.",
  },
  "facing-eviction": {
    heading: "You told us you may be facing eviction or housing trouble.",
    body: "Our guide can help look for rent help, legal aid, shelter, and other housing support. We'll ask a few questions so we can point you in the right direction.",
  },
  "housing-crisis": {
    heading: "You told us you're dealing with a housing problem.",
    body: "Our guide can help look for rent help, shelter, legal aid, and other housing support. We'll ask a few questions so we can point you in the right direction.",
  },
  "new-baby": {
    heading: "You told us you're having a baby or growing your family.",
    body: "Our guide can help look for WIC, prenatal care, childcare, and family support. We'll ask a few questions to find options that fit.",
  },
  "need-healthcare": {
    heading: "You told us you need healthcare help.",
    body: "Our guide can help look for clinics, health coverage, prescriptions, and other care options. We'll ask a few questions to understand what kind of help you need.",
  },
  "mental-health": {
    heading: "You told us you're looking for mental health support.",
    body: "Our guide can help look for counseling, crisis support, peer support, and related services. We'll ask a few questions to find the safest next step.",
  },
  "senior-help": {
    heading: "You told us you need senior support.",
    body: "Our guide can help look for meals, care, transportation, benefits, and other support. We'll ask a few questions to understand who needs help and what kind.",
  },
  retiring: {
    heading: "You told us you're planning for retirement.",
    body: "Our guide can help look for senior services, healthcare, transportation, and community programs. We'll ask a few questions to find options that fit.",
  },
  "veteran-transition": {
    heading: "You told us you're looking for veteran support.",
    body: "Our guide can help look for VA benefits, housing, healthcare, jobs, and related services. We'll ask a few questions to narrow it down.",
  },
  "new-to-austin": {
    heading: "You told us you're new to Austin.",
    body: "Our guide can help look for support with healthcare, food, transportation, schools, utilities, and other basics. We'll ask a few questions to see what would help first.",
  },
  "legal-trouble": {
    heading: "You told us you need legal help.",
    body: "Our guide can help look for legal aid and related support. We'll ask a few questions about the type of issue, only as much as you're comfortable sharing.",
  },
  "child-care": {
    heading: "You told us you need childcare help.",
    body: "Our guide can help look for childcare, pre-K, after-school care, and related programs. We'll ask a few questions about age, schedule, and location.",
  },
  "back-to-school": {
    heading: "You told us you're looking at school or training.",
    body: "Our guide can help look for GED, adult education, college aid, job training, and related programs. We'll ask a few questions about your goals.",
  },
  "aging-parent": {
    heading: "You told us you're helping an aging parent.",
    body: "Our guide can help look for caregiver support, meals, transportation, healthcare, and respite care. We'll ask a few questions about what support is needed most.",
  },
  "young-adult": {
    heading: "You told us you're starting out on your own.",
    body: "Our guide can help look for housing, education, jobs, and life-skills support. We'll ask a few questions about what you're trying to handle first.",
  },
  divorce: {
    heading: "You told us you're going through a separation or divorce.",
    body: "Our guide can help look for legal aid, counseling, housing, childcare, and financial support. We'll ask a few questions to narrow down what would help.",
  },
  "family-death": {
    heading: "You told us you've lost a family member.",
    body: "Our guide can help look for grief support, legal help, financial assistance, and immediate services. We'll ask a few questions gently and only as needed.",
  },
  "new-disability": {
    heading: "You told us you're adjusting to a disability.",
    body: "Our guide can help look for benefits, healthcare, assistive services, legal help, and support groups. We'll ask a few questions about what has become hardest to manage.",
  },
  "unsafe-situation": {
    heading: "You told us you may be in an unsafe situation.",
    body: "Our guide can help look for crisis support, safe shelter, legal help, and housing options. If you're in immediate danger, call 911 now.",
  },
  healthspan: {
    heading: "You told us you want help adding healthy years.",
    body: "Our guide can help look for local support with nutrition, movement, tobacco cessation, healthcare, and mental health. We'll ask a few questions about where you want to start.",
  },
};

function eventCopy(event?: string) {
  if (!event) return null;
  const normalized = event.trim().toLowerCase().replace(/_/g, "-");
  const canonical = LIFE_EVENT_ALIASES[normalized] ?? normalized;
  return LIFE_EVENT_COPY[canonical] || null;
}

export default function Intake() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [recoveredId, setRecoveredId] = useState<string | null>(null);
  const [planSummary, setPlanSummary] = useState<string | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const [selectedMode, setSelectedMode] = useState<IntakeMode>("text");
  const isStartingRef = useRef(false);
  const intakeRequestIdRef = useRef(0);

  const lifeEvent = searchParams.get("event") || undefined;
  const focusParam = searchParams.get("focus") || undefined;
  const focus = focusParam
    ? focusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const scenarioCopy = eventCopy(lifeEvent);
  const skipRecovery = !!lifeEvent || searchParams.get("fresh") === "1";

  useEffect(() => {
    const requestId = ++intakeRequestIdRef.current;
    // Search params changed, so any prior in-flight beginNewIntake() is now
    // stale. Release the start lock so a fresh chooser click is not ignored.
    isStartingRef.current = false;
    // If the user explicitly requested a fresh start (life-event entry or
    // ?fresh=1), skip the recovery prompt entirely.
    if (skipRecovery) {
      setPhase("choosing");
      return;
    }

    const existing = getActiveSession();
    if (existing) {
      setPhase("checking");
      setPlanSummary(null);
      getIntakePlanSummary(existing)
        .then((res) => {
          if (intakeRequestIdRef.current !== requestId) return;
          if (res.status === "completed" && res.match_count > 0) {
            setRecoveredId(existing);
            setPlanSummary(res.summary);
            setPhase("recovering");
            return;
          }
          clearActiveSession();
          setPhase("choosing");
        })
        .catch(() => {
          if (intakeRequestIdRef.current !== requestId) return;
          clearActiveSession();
          setPhase("choosing");
        });
    } else {
      setPhase("choosing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const beginNewIntake = (mode: IntakeMode) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    const requestId = ++intakeRequestIdRef.current;
    setSelectedMode(mode);
    setError("");
    setPhase("starting");
    const language = getStoredLanguage();
    startIntake(language, lifeEvent, focus, mode)
      .then((s) => {
        if (intakeRequestIdRef.current !== requestId) return;
        setSession(s);
        setPhase("ready");
      })
      .catch((err) => {
        if (intakeRequestIdRef.current !== requestId) return;
        setError(
          err.message || "Failed to start intake session. Please try again.",
        );
        // Return to the chooser so the resident can retry or switch modes
        // rather than landing in a dead-end error screen.
        setPhase("choosing");
      })
      .finally(() => {
        // Always release the start lock — keeping it gated on the request id
        // can strand the chooser if the in-flight start was invalidated
        // (e.g., by searchParams change) before this finally fired.
        isStartingRef.current = false;
      });
  };

  const handleComplete = (sessionId: string) => {
    setActiveSession(sessionId);
    navigate(`/results/${sessionId}`);
  };

  const handleResumePlan = () => {
    if (recoveredId) navigate(`/results/${recoveredId}`);
  };

  const handleStartOver = () => {
    if (!confirmStartOver) {
      setConfirmStartOver(true);
      return;
    }
    clearActiveSession();
    setRecoveredId(null);
    setConfirmStartOver(false);
    intakeRequestIdRef.current += 1;
    setPhase("choosing");
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
              sx={{ mb: planSummary ? 1.5 : 3, lineHeight: 1.6 }}
            >
              You have a saved service plan. Pick up where you left off, or
              start a fresh conversation.
            </Typography>
            {planSummary && (
              <Box
                sx={{
                  mb: 3,
                  p: 1.75,
                  borderRadius: 2,
                  bgcolor: "primary.50",
                  border: "1px solid",
                  borderColor: "primary.light",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ color: "primary.dark", lineHeight: 1.5 }}
                >
                  {planSummary}
                </Typography>
              </Box>
            )}
            {confirmStartOver && (
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                This will clear your saved plan. Are you sure?
              </Alert>
            )}
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
                variant={confirmStartOver ? "contained" : "outlined"}
                color={confirmStartOver ? "error" : "primary"}
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
                {confirmStartOver ? "Yes, start over" : "Start over"}
              </Button>
            </Stack>
            {confirmStartOver && (
              <Button
                size="small"
                onClick={() => setConfirmStartOver(false)}
                sx={{ mt: 1.5, fontWeight: 600, alignSelf: "center" }}
                fullWidth
              >
                Cancel
              </Button>
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (phase === "choosing") {
    return (
      <Box
        sx={{
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 2,
          py: { xs: 3, sm: 5 },
          bgcolor: "background.default",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 760 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}
          <Typography
            variant="h4"
            component="h1"
            fontWeight={800}
            sx={{ mb: 1.25, color: "text.primary", lineHeight: 1.2 }}
          >
            {scenarioCopy?.heading || "How would you like to start?"}
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 620, lineHeight: 1.6 }}
          >
            {scenarioCopy?.body ||
              "Choose the intake style that feels easiest right now. You can still switch between voice and text during the conversation."}
          </Typography>
          <Typography
            variant="subtitle1"
            fontWeight={800}
            sx={{ mb: 1.5, color: "text.primary" }}
          >
            Would you like to talk by voice or type messages?
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button
              variant="contained"
              size="large"
              fullWidth
              disableElevation
              onClick={() => beginNewIntake("voice")}
              sx={{
                minHeight: 96,
                borderRadius: 2,
                justifyContent: "flex-start",
                px: 3,
                py: 2.25,
                textAlign: "left",
                alignItems: "flex-start",
                flexDirection: "column",
                gap: 0.5,
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <MicIcon />
                <Typography component="span" variant="h6" fontWeight={800}>
                  Voice conversation
                </Typography>
              </Box>
              <Typography
                component="span"
                variant="body2"
                sx={{ opacity: 0.9 }}
              >
                Talk naturally with the guide.
              </Typography>
            </Button>
            <Button
              variant="outlined"
              size="large"
              fullWidth
              disableElevation
              onClick={() => beginNewIntake("text")}
              sx={{
                minHeight: 96,
                borderRadius: 2,
                justifyContent: "flex-start",
                px: 3,
                py: 2.25,
                textAlign: "left",
                alignItems: "flex-start",
                flexDirection: "column",
                gap: 0.5,
                bgcolor: "background.paper",
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <ChatBubbleOutlineIcon />
                <Typography component="span" variant="h6" fontWeight={800}>
                  Text chat
                </Typography>
              </Box>
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
              >
                Type messages at your pace.
              </Typography>
            </Button>
          </Stack>
        </Box>
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
          {phase === "checking"
            ? "Checking your session..."
            : "Starting your session..."}
        </Typography>
      </Box>
    );
  }

  if (!session) return null;

  return (
    <Box sx={{ height: "calc(100vh - 64px)" }}>
      <ChatInterface
        session={session}
        initialMode={selectedMode}
        onComplete={handleComplete}
      />
    </Box>
  );
}
