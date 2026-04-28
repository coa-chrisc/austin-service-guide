import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import Chip from "@mui/material/Chip";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import ChatBubble from "@/components/chat/ChatBubble";
import type { IntakeMessage } from "@/types";
import type { PersonaScriptTurn } from "@/lib/api";

interface DemoState {
  openingMessage: string;
  script: PersonaScriptTurn[];
  personaLabel?: string;
}

function TypingIndicator() {
  return (
    <Box
      role="status"
      aria-label="Assistant is typing"
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
        <HealthAndSafetyIcon sx={{ fontSize: 18 }} />
      </Avatar>
      <Box
        sx={{
          display: "flex",
          gap: 0.5,
          px: 2,
          py: 1.5,
          borderRadius: "16px 16px 16px 4px",
          bgcolor: "grey.100",
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
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const state = location.state as DemoState | null;

  const fullSequence = useMemo<IntakeMessage[]>(() => {
    if (!state) return [];
    const seq: IntakeMessage[] = [];
    if (state.openingMessage) {
      seq.push({
        role: "user",
        content: state.openingMessage,
        suggested_buttons: [],
        progress_percent: 0,
        is_complete: false,
        crisis_detected: false,
      });
    }
    for (const t of state.script) {
      seq.push({
        role: t.role,
        content: t.content,
        suggested_buttons: [],
        progress_percent: 0,
        is_complete: false,
        crisis_detected: false,
      });
    }
    return seq;
  }, [state]);

  const delays = useMemo<number[]>(() => {
    if (!state) return [];
    const arr: number[] = [];
    if (state.openingMessage) arr.push(400);
    for (const t of state.script) arr.push(t.delay_ms ?? 800);
    return arr;
  }, [state]);

  const [shown, setShown] = useState<IntakeMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timeouts = useRef<number[]>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [shown, typing]);

  useEffect(() => {
    if (!state || fullSequence.length === 0) {
      // No state — user navigated directly. Skip straight to results.
      navigate(`/results/${sessionId}`, { replace: true });
      return;
    }

    let i = 0;
    const queueNext = () => {
      if (i >= fullSequence.length) {
        setTyping(false);
        setDone(true);
        return;
      }
      const msg = fullSequence[i];
      const delay = delays[i] ?? 800;
      const isAssistant = msg.role === "assistant";
      // Show typing indicator only before assistant bubbles.
      if (isAssistant) setTyping(true);
      const t = window.setTimeout(() => {
        setTyping(false);
        setShown((prev) => [...prev, msg]);
        i += 1;
        // Small gap between bubbles before scheduling the next.
        const gap = window.setTimeout(queueNext, 300);
        timeouts.current.push(gap);
      }, delay);
      timeouts.current.push(t);
    };
    queueNext();

    return () => {
      timeouts.current.forEach((t) => clearTimeout(t));
      timeouts.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSkip = () => {
    timeouts.current.forEach((t) => clearTimeout(t));
    timeouts.current = [];
    setSkipped(true);
    setTyping(false);
    setShown(fullSequence);
    setDone(true);
  };

  const handleViewPlan = () => {
    navigate(`/results/${sessionId}`);
  };

  if (!state) return null;

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            label="DEMO"
            size="small"
            color="warning"
            sx={{ fontWeight: 700 }}
          />
          {state.personaLabel && (
            <Typography variant="body2" color="text.secondary">
              {state.personaLabel}
            </Typography>
          )}
        </Box>
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

      <Box
        sx={{
          bgcolor: "background.paper",
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          p: { xs: 2, sm: 3 },
          minHeight: 400,
        }}
      >
        {shown.map((m, idx) => (
          <ChatBubble
            key={idx}
            message={m}
            isLatest={idx === shown.length - 1}
          />
        ))}
        {typing && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </Box>

      {done && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
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
            endIcon={<ArrowForwardIcon />}
            onClick={handleViewPlan}
            sx={{
              minHeight: 52,
              px: 4,
              fontWeight: 700,
              borderRadius: "26px",
            }}
          >
            View My Plan
          </Button>
        </Box>
      )}

      {skipped && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", textAlign: "center", mt: 1 }}
        >
          Conversation skipped — plan ready.
        </Typography>
      )}
    </Container>
  );
}
