import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import ReplayIcon from "@mui/icons-material/Replay";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ChatBubble from "@/components/chat/ChatBubble";
import DemoScenarioBanner from "@/components/demo/DemoScenarioBanner";
import type { IntakeMessage } from "@/types";
import { buildIntakePlan, type PersonaScriptTurn } from "@/lib/api";
import { ensureIntakePlan, hasCompletedPlan } from "@/lib/session";

/** Router state the scenario launcher passes to /demo. */
export interface DemoState {
  openingMessage: string;
  script: PersonaScriptTurn[];
  personaLabel?: string;
  personaSummary?: string;
}

// Reading-time pacing: wait long enough to read the previous bubble.
const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 5000;
const MS_PER_CHAR = 30;
const FIRST_DELAY_MS = 400;

function delayBefore(prev: IntakeMessage | undefined, scripted?: number): number {
  if (!prev) return FIRST_DELAY_MS;
  const reading = prev.content.length * MS_PER_CHAR;
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, reading, scripted ?? 0));
}

function bubble(role: "user" | "assistant", content: string): IntakeMessage {
  return {
    role,
    content,
    suggested_buttons: [],
    progress_percent: 0,
    is_complete: false,
    crisis_detected: false,
  };
}

function TypingIndicator() {
  return (
    <Box
      role="status"
      aria-label="Guide is typing"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        mb: 2,
        "@media (prefers-reduced-motion: no-preference)": {
          animation: "fadeSlideIn 0.3s ease-out",
          "@keyframes fadeSlideIn": {
            from: { opacity: 0, transform: "translateY(8px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
        },
      }}
    >
      <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main" }}>
        <SmartToyIcon sx={{ fontSize: 20 }} />
      </Avatar>
      <Box
        sx={{
          display: "flex",
          gap: 0.5,
          px: 2,
          py: 1.5,
          borderRadius: "16px 16px 16px 4px",
          bgcolor: "brand.subtle",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "text.secondary",
              "@media (prefers-reduced-motion: no-preference)": {
                animation: "typingDot 1.4s infinite ease-in-out",
                animationDelay: `${i * 0.2}s`,
                "@keyframes typingDot": {
                  "0%, 80%, 100%": { opacity: 0.3, transform: "scale(0.8)" },
                  "40%": { opacity: 1, transform: "scale(1)" },
                },
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

export default function DemoIntake() {
  const location = useLocation();
  const state = location.state as DemoState | null;
  // Opened directly (no launcher state): send the visitor to the launcher.
  if (!state || (!state.openingMessage && state.script.length === 0)) {
    return <Navigate to="/?demo=1" replace />;
  }
  return <DemoReplay demo={state} />;
}

function DemoReplay({ demo }: { demo: DemoState }) {
  const navigate = useNavigate();

  const sequence = useMemo(() => {
    const items: { message: IntakeMessage; scriptedDelay?: number }[] = [];
    if (demo.openingMessage) {
      items.push({ message: bubble("user", demo.openingMessage) });
    }
    for (const turn of demo.script) {
      items.push({ message: bubble(turn.role, turn.content), scriptedDelay: turn.delay_ms });
    }
    return items;
  }, [demo]);

  const total = sequence.length;
  const [shownCount, setShownCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const done = shownCount >= total;
  const next = done ? undefined : sequence[shownCount];
  // The typing dots show only while the next bubble is the guide's.
  const typing = !paused && next?.message.role === "assistant";

  useEffect(() => {
    if (paused || !next) return;
    const prev = sequence[shownCount - 1]?.message;
    const timer = window.setTimeout(
      () => setShownCount((n) => n + 1),
      delayBefore(prev, next.scriptedDelay),
    );
    return () => window.clearTimeout(timer);
  }, [paused, next, shownCount, sequence]);

  // The persona state is already complete: build its plan (the rules order,
  // no model call) during the replay so the plan page has it at once. The
  // results page reuses this request, or retries if it failed.
  useEffect(() => {
    if (hasCompletedPlan()) void ensureIntakePlan(buildIntakePlan).catch(() => undefined);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [shownCount, typing]);

  const handleSkip = () => {
    setSkipped(true);
    setPaused(false);
    setShownCount(total);
  };

  const handleReplay = () => {
    setSkipped(false);
    setPaused(false);
    setShownCount(0);
  };

  return (
    <Box>
      <DemoScenarioBanner
        sticky
        label={demo.personaLabel}
        message="Scripted replay, not a live AI conversation."
      />

      <Container maxWidth="md" sx={{ py: 3 }}>
        {demo.personaSummary && (
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {demo.personaSummary}
          </Typography>
        )}

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary" aria-live="polite">
            Step {Math.max(1, shownCount)} of {total}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {!done && (
              <Button
                size="small"
                variant="text"
                startIcon={paused ? <PlayArrowIcon /> : <PauseIcon />}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? "Play" : "Pause"}
              </Button>
            )}
            <Button
              size="small"
              variant="text"
              startIcon={<ReplayIcon />}
              onClick={handleReplay}
              disabled={shownCount === 0}
            >
              Replay
            </Button>
            {!done && (
              <Button
                size="small"
                variant="text"
                startIcon={<SkipNextIcon />}
                onClick={handleSkip}
              >
                Skip to plan
              </Button>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            bgcolor: "background.paper",
            borderRadius: (theme) => theme.shape.radius.card,
            border: "1px solid",
            borderColor: "divider",
            p: { xs: 2, sm: 3 },
            minHeight: 400,
          }}
        >
          {sequence.slice(0, shownCount).map(({ message }, idx) => (
            <ChatBubble
              key={idx}
              message={message}
              isLatest={idx === shownCount - 1}
              speakerLabel={message.role === "user" ? "Sample resident" : "Guide"}
            />
          ))}
          {typing && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </Box>

        {done && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              mt: 3,
              "@media (prefers-reduced-motion: no-preference)": {
                animation: "fadeSlideIn 0.4s ease-out",
                "@keyframes fadeSlideIn": {
                  from: { opacity: 0, transform: "translateY(8px)" },
                  to: { opacity: 1, transform: "translateY(0)" },
                },
              },
            }}
          >
            <Button
              variant="contained"
              size="large"
              disableElevation
              endIcon={<ArrowForwardIcon />}
              onClick={() => navigate("/results")}
              sx={{ minHeight: 52, px: 4, fontWeight: 700, textTransform: "none" }}
            >
              See this resident's plan
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              {skipped
                ? "Conversation skipped. The plan comes from the real matching engine."
                : "The plan comes from the real matching engine and service catalog."}
            </Typography>
          </Box>
        )}
      </Container>
    </Box>
  );
}
