import { useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import PhoneIcon from "@mui/icons-material/Phone";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ChatBubble from "./ChatBubble";
import { sendIntakeMessage, getCrisisResources } from "@/lib/api";
import { useRealtimeVoiceSession } from "@/hooks/useRealtimeVoiceSession";
import { getStoredLanguage } from "@/components/common/LanguageSelector";
import type { IntakeMessage, IntakeSession, CrisisResource } from "@/types";

interface ChatInterfaceProps {
  session: IntakeSession;
  onComplete?: (sessionId: string) => void;
  initialMode?: "text" | "voice";
}

export default function ChatInterface({
  session,
  onComplete,
  initialMode = "text",
}: ChatInterfaceProps) {
  const initialMessages = session.conversation ?? [];
  const [messages, setMessages] = useState<IntakeMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(
    initialMessages[initialMessages.length - 1]?.progress_percent ?? 0,
  );
  const [isComplete, setIsComplete] = useState(false);
  const [crisisDetected, setCrisisDetected] = useState(false);
  const [crisisResources, setCrisisResources] = useState<CrisisResource[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didAutoStartVoiceRef = useRef(false);
  const didSpeakVoiceIntroRef = useRef(false);
  const sessionIdRef = useRef(session.id);
  const voiceStopRef = useRef<() => void>(() => undefined);

  const loadCrisisResources = useCallback(async () => {
    if (crisisDetected) return;
    setCrisisDetected(true);
    try {
      const resources = await getCrisisResources();
      setCrisisResources(resources);
    } catch {
      /* best effort */
    }
  }, [crisisDetected]);

  const appendMessages = useCallback((incoming: IntakeMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const next = [...prev];
      for (const message of incoming) {
        const text = message.content.trim();
        if (!text) continue;
        const last = next[next.length - 1];
        if (last?.role === message.role && last.content.trim() === text) {
          continue;
        }
        if (
          next
            .slice(-4)
            .some(
              (existing) =>
                existing.role === message.role &&
                existing.content.trim() === text,
            )
        ) {
          continue;
        }
        next.push({ ...message, content: text });
      }
      return next;
    });
  }, []);

  const handleVoiceLocalTranscript = useCallback(
    (role: "user" | "assistant", content: string) => {
      appendMessages([
        {
          role,
          content,
          suggested_buttons: [],
          progress_percent: progress,
          is_complete: false,
          crisis_detected: false,
        },
      ]);
    },
    [appendMessages, progress],
  );

  const handleVoiceTranscriptSync = useCallback(
    (result: {
      messages: IntakeMessage[];
      progress_percent: number;
      is_complete: boolean;
      crisis_detected: boolean;
    }) => {
      appendMessages(result.messages);
      setProgress(result.progress_percent);
      if (result.crisis_detected) {
        void loadCrisisResources();
      }
      if (result.is_complete) {
        setIsComplete(true);
      }
    },
    [appendMessages, loadCrisisResources],
  );

  const handleVoiceToolResult = useCallback(
    (result: {
      progress_percent: number;
      is_complete: boolean;
      crisis_detected: boolean;
    }) => {
      setProgress(result.progress_percent);
      if (result.crisis_detected) {
        void loadCrisisResources();
      }
      if (result.is_complete) {
        setIsComplete(true);
      }
    },
    [loadCrisisResources],
  );

  const voice = useRealtimeVoiceSession({
    sessionId: session.id,
    onLocalTranscript: handleVoiceLocalTranscript,
    onTranscriptSync: handleVoiceTranscriptSync,
    onToolResult: handleVoiceToolResult,
  });

  useEffect(() => {
    voiceStopRef.current = voice.stop;
  }, [voice.stop]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, voice.liveTranscript]);

  // Re-focus the input after the assistant's reply lands. The TextField is
  // disabled while isLoading is true, so a focus() call from the request's
  // finally block runs before React re-enables the input — this effect runs
  // after the render and reliably restores focus for the next turn.
  useEffect(() => {
    if (!isLoading && !isComplete && !voice.isActive) {
      inputRef.current?.focus();
    }
  }, [isLoading, isComplete, voice.isActive]);

  useEffect(() => {
    if (sessionIdRef.current !== session.id) {
      voiceStopRef.current();
      sessionIdRef.current = session.id;
      didAutoStartVoiceRef.current = false;
      didSpeakVoiceIntroRef.current = false;
      const convo = session.conversation ?? [];
      setMessages(convo);
      setInputValue("");
      setIsLoading(false);
      setProgress(convo[convo.length - 1]?.progress_percent ?? 0);
      setIsComplete(false);
      setCrisisDetected(false);
      setCrisisResources([]);
    }
  }, [session.id, session.conversation]);

  useEffect(() => {
    return () => {
      voiceStopRef.current();
    };
  }, []);

  // If voice startup fails (mic denied, network blip), unflip the "intro
  // already spoken" guard so a retry actually replays the greeting.
  useEffect(() => {
    if (voice.status === "error") {
      didSpeakVoiceIntroRef.current = false;
    }
  }, [voice.status]);

  const estimateGreetingLockMs = useCallback((text: string) => {
    if (!text.trim()) return 0;
    return Math.min(8000, Math.max(2500, text.length * 45));
  }, []);

  const handleVoiceStart = useCallback(() => {
    const language = getStoredLanguage();
    const intro = messages.find((m) => m.role === "assistant")?.content || "";
    const shouldSpeakIntro = !didSpeakVoiceIntroRef.current && !!intro.trim();
    const startupMicLockMs = shouldSpeakIntro
      ? estimateGreetingLockMs(intro)
      : 0;
    if (shouldSpeakIntro) didSpeakVoiceIntroRef.current = true;
    voice.start(language, messages, {
      speakInitialGreeting: shouldSpeakIntro,
      startupMicLockMs,
    });
  }, [estimateGreetingLockMs, messages, voice.start]);

  useEffect(() => {
    if (initialMode !== "voice" || didAutoStartVoiceRef.current) return;
    const timer = window.setTimeout(() => {
      if (didAutoStartVoiceRef.current) return;
      didAutoStartVoiceRef.current = true;
      handleVoiceStart();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [handleVoiceStart, initialMode]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading || voice.isActive) return;
    const activeSessionId = session.id;

    const userMsg: IntakeMessage = {
      role: "user",
      content: text.trim(),
      suggested_buttons: [],
      progress_percent: progress,
      is_complete: false,
      crisis_detected: false,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      const language = getStoredLanguage();
      const response = await sendIntakeMessage(
        activeSessionId,
        text.trim(),
        language,
      );
      if (sessionIdRef.current !== activeSessionId) return;
      setMessages((prev) => [...prev, response]);
      setProgress(response.progress_percent);

      if (response.crisis_detected && !crisisDetected) {
        await loadCrisisResources();
      }

      if (response.is_complete) {
        setIsComplete(true);
      }
    } catch {
      if (sessionIdRef.current !== activeSessionId) return;
      const errorMsg: IntakeMessage = {
        role: "assistant",
        content: "I'm sorry, something went wrong. Please try again.",
        suggested_buttons: [],
        progress_percent: progress,
        is_complete: false,
        crisis_detected: false,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (sessionIdRef.current === activeSessionId) {
        setIsLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue);
    }
  };

  const handleButtonClick = (value: string) => {
    handleSend(value);
  };

  const voiceLabel = (() => {
    switch (voice.status) {
      case "connecting":
        return "Connecting voice";
      case "listening":
        return "Listening";
      case "thinking":
        return "Thinking";
      case "speaking":
        return "Assistant speaking";
      case "finalizing":
        return "Finalizing plan";
      case "connected":
        return "Voice connected";
      case "error":
        return "Voice unavailable";
      default:
        return "Start voice chat";
    }
  })();
  const voicePulseColor =
    voice.status === "speaking"
      ? "secondary.main"
      : voice.status === "thinking" || voice.status === "finalizing"
        ? "warning.main"
        : voice.status === "error"
          ? "error.main"
          : "primary.main";
  const voiceBarsActive =
    voice.status === "listening" ||
    voice.status === "speaking" ||
    voice.status === "thinking" ||
    voice.status === "finalizing";
  const voiceDetail = (() => {
    if (voice.status === "error") {
      return voice.error || "Voice chat is unavailable.";
    }
    if (voice.liveTranscript) {
      return voice.liveTranscript;
    }
    switch (voice.status) {
      case "connecting":
        return "Opening secure voice session";
      case "listening":
        return "Listening now";
      case "thinking":
        return "Preparing response";
      case "speaking":
        return "Playing response";
      case "finalizing":
        return "Wrapping up your service plan";
      case "connected":
        return "Voice session active";
      default:
        return "";
    }
  })();
  const liveTranscriptMessage: IntakeMessage | null = voice.liveTranscript
    ? {
        role: voice.liveTranscriptRole || "assistant",
        content: voice.liveTranscript,
        suggested_buttons: [],
        progress_percent: progress,
        is_complete: false,
        crisis_detected: false,
      }
    : null;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxHeight: "100%",
        bgcolor: "background.default",
      }}
    >
      {/* Progress bar */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            Intake Progress
          </Typography>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            {progress}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          aria-label="Intake progress"
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: "grey.200",
            "& .MuiLinearProgress-bar": {
              borderRadius: 3,
              bgcolor: progress === 100 ? "success.main" : "primary.main",
            },
          }}
        />
      </Box>

      {/* Crisis alert banner */}
      {crisisDetected && crisisResources.length > 0 && (
        <Box sx={{ px: 2, pt: 1 }}>
          <Alert
            severity="error"
            icon={<WarningAmberIcon />}
            sx={{
              borderRadius: 2,
              "& .MuiAlert-message": { width: "100%" },
            }}
          >
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Immediate Help Available
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {crisisResources.map((r) => (
                <Button
                  key={r.phone}
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<PhoneIcon />}
                  href={`tel:${r.phone}`}
                  sx={{ fontWeight: 600, borderRadius: "20px" }}
                >
                  {r.name}: {r.phone}
                </Button>
              ))}
            </Box>
          </Alert>
        </Box>
      )}

      {/* Messages area */}
      <Box
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 2,
          py: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.length === 0 && !isLoading && initialMode !== "voice" && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              py: 6,
            }}
          >
            <Avatar
              sx={{
                width: 72,
                height: 72,
                bgcolor: "primary.light",
                mb: 1,
              }}
            >
              <HealthAndSafetyIcon sx={{ fontSize: 40 }} />
            </Avatar>
            <Typography variant="h5" fontWeight={600} textAlign="center">
              Welcome to Austin Service Guide
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              textAlign="center"
              maxWidth={400}
            >
              I'll ask you a few questions to find city services you may be
              eligible for. Your information stays private and secure.
            </Typography>
          </Box>
        )}

        {messages
          .filter((m) => m.role !== "system")
          .map((msg, idx, arr) => (
            <ChatBubble
              key={idx}
              message={msg}
              onButtonClick={handleButtonClick}
              isLatest={idx === arr.length - 1}
            />
          ))}

        {voice.isActive && liveTranscriptMessage && (
          <ChatBubble message={liveTranscriptMessage} />
        )}

        {/* Typing indicator */}
        {isLoading && (
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
                        "0%, 80%, 100%": {
                          opacity: 0.3,
                          transform: "scale(0.8)",
                        },
                        "40%": { opacity: 1, transform: "scale(1)" },
                      },
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Completion CTA */}
      {isComplete && (
        <Box
          sx={{
            px: 2,
            pb: 1.5,
            pt: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 1,
            "@media (prefers-reduced-motion: no-preference)": {
              animation: "ctaSlideIn 0.4s ease-out",
              "@keyframes ctaSlideIn": {
                from: { opacity: 0, transform: "translateY(12px)" },
                to: { opacity: 1, transform: "translateY(0)" },
              },
            },
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              color: "success.main",
            }}
          >
            <CheckCircleIcon sx={{ fontSize: 22 }} />
            <Typography variant="subtitle1" fontWeight={700}>
              Your plan is ready
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={() => onComplete?.(session.id)}
            endIcon={<ArrowForwardIcon />}
            sx={{
              borderRadius: "28px",
              py: 1.75,
              fontSize: "1.125rem",
              fontWeight: 700,
              minHeight: 56,
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              boxShadow: "0 6px 18px rgba(0, 91, 187, 0.35)",
            }}
          >
            See my plan
          </Button>
        </Box>
      )}

      {/* Input area */}
      <Box
        sx={{
          pt: 2,
          px: 2,
          pb: "calc(16px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        {voice.isActive ? (
          <Box
            role="status"
            aria-label={voiceLabel}
            sx={(theme) => ({
              px: { xs: 1.25, sm: 1.5 },
              py: 1.25,
              borderRadius: 2,
              border: "1px solid",
              borderColor:
                voice.status === "error"
                  ? alpha(theme.palette.error.main, 0.28)
                  : alpha(theme.palette.primary.main, 0.18),
              bgcolor: "background.paper",
              boxShadow:
                voice.status === "error"
                  ? `0 4px 14px ${alpha(theme.palette.error.main, 0.08)}`
                  : `0 4px 14px ${alpha(theme.palette.text.primary, 0.08)}`,
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              minHeight: 56,
            })}
          >
            <Avatar
              sx={(theme) => ({
                width: 36,
                height: 36,
                bgcolor: voicePulseColor,
                position: "relative",
                flexShrink: 0,
                boxShadow: `0 2px 8px ${alpha(theme.palette.text.primary, 0.16)}`,
                "&::before": voice.isActive
                  ? {
                      content: '""',
                      position: "absolute",
                      inset: -6,
                      borderRadius: "50%",
                      border: "2px solid",
                      borderColor: voicePulseColor,
                      opacity: 0.28,
                      "@media (prefers-reduced-motion: no-preference)": {
                        animation: "voicePulse 1.8s ease-out infinite",
                        "@keyframes voicePulse": {
                          "0%": {
                            transform: "scale(0.9)",
                            opacity: 0.32,
                          },
                          "70%": {
                            transform: "scale(1.28)",
                            opacity: 0,
                          },
                          "100%": {
                            transform: "scale(1.28)",
                            opacity: 0,
                          },
                        },
                      },
                    }
                  : undefined,
              })}
            >
              {voice.isMuted ? (
                <MicOffIcon sx={{ fontSize: 18 }} />
              ) : (
                <MicIcon sx={{ fontSize: 18 }} />
              )}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  minWidth: 0,
                }}
              >
                <Box
                  sx={(theme) => ({
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 1,
                    bgcolor:
                      voice.status === "error"
                        ? alpha(theme.palette.error.main, 0.08)
                        : alpha(theme.palette.primary.main, 0.08),
                    color:
                      voice.status === "error" ? "error.main" : "primary.dark",
                    minWidth: 0,
                  })}
                >
                  <Typography
                    variant="caption"
                    fontWeight={800}
                    sx={{ display: "block", lineHeight: 1.35 }}
                    noWrap
                  >
                    {voiceLabel}
                  </Typography>
                </Box>
                {voiceBarsActive && (
                  <Box
                    aria-hidden="true"
                    sx={(theme) => ({
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                      height: 20,
                      px: 0.75,
                      borderRadius: 1,
                      bgcolor:
                        voice.status === "speaking"
                          ? alpha(theme.palette.success.main, 0.08)
                          : alpha(theme.palette.primary.main, 0.06),
                      flexShrink: 0,
                    })}
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 3,
                          height:
                            voice.status === "thinking" ||
                            voice.status === "finalizing"
                              ? 5
                              : 10 + (i % 2) * 5,
                          borderRadius: 2,
                          bgcolor: voicePulseColor,
                          opacity:
                            voice.status === "thinking" ||
                            voice.status === "finalizing"
                              ? 0.55
                              : 0.85,
                          "@media (prefers-reduced-motion: no-preference)": {
                            animation:
                              voice.status === "thinking" ||
                              voice.status === "finalizing"
                                ? "voiceDots 1.1s ease-in-out infinite"
                                : "voiceWave 0.9s ease-in-out infinite",
                            animationDelay: `${i * 0.12}s`,
                            "@keyframes voiceWave": {
                              "0%, 100%": { transform: "scaleY(0.55)" },
                              "50%": { transform: "scaleY(1.35)" },
                            },
                            "@keyframes voiceDots": {
                              "0%, 100%": {
                                transform: "translateY(0)",
                                opacity: 0.4,
                              },
                              "50%": {
                                transform: "translateY(-3px)",
                                opacity: 1,
                              },
                            },
                          },
                        }}
                      />
                    ))}
                  </Box>
                )}
              </Box>
              <Typography
                variant="caption"
                color={
                  voice.status === "error" ? "error.main" : "text.secondary"
                }
                sx={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  mt: 0.25,
                }}
              >
                {voiceDetail}
              </Typography>
            </Box>
            {voice.isActive ? (
              <>
                <Tooltip
                  title={
                    voice.isMuted ? "Unmute microphone" : "Mute microphone"
                  }
                >
                  <IconButton
                    size="small"
                    onClick={voice.toggleMute}
                    aria-label={
                      voice.isMuted ? "Unmute microphone" : "Mute microphone"
                    }
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: "background.paper",
                      width: 34,
                      height: 34,
                    }}
                  >
                    {voice.isMuted ? <MicOffIcon /> : <MicIcon />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="End voice chat">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={voice.stop}
                    aria-label="End voice chat"
                    sx={(theme) => ({
                      border: "1px solid",
                      borderColor: alpha(theme.palette.error.main, 0.22),
                      bgcolor: alpha(theme.palette.error.main, 0.06),
                      width: 34,
                      height: 34,
                    })}
                  >
                    <CallEndIcon />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Tooltip title="Try voice chat again">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={handleVoiceStart}
                  disabled={isLoading || isComplete}
                  aria-label="Try voice chat again"
                  sx={(theme) => ({
                    border: "1px solid",
                    borderColor: alpha(theme.palette.primary.main, 0.22),
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    width: 34,
                    height: 34,
                  })}
                >
                  <MicIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ) : (
          <>
            {voice.status === "error" && (
              <Alert
                severity="error"
                sx={{ mb: 1, borderRadius: 2 }}
                role="status"
              >
                {voice.error ||
                  "Voice chat couldn't start. You can keep typing or try voice again."}
              </Alert>
            )}
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
              <Tooltip
                title={
                  voice.status === "error"
                    ? "Try voice chat again"
                    : "Start voice chat"
                }
              >
                <span>
                  <IconButton
                    color="primary"
                    onClick={handleVoiceStart}
                    disabled={isLoading || isComplete}
                    aria-label={
                      voice.status === "error"
                        ? "Try voice chat again"
                        : "Start voice chat"
                    }
                    sx={{
                      bgcolor: "grey.100",
                      color: "primary.main",
                      width: 44,
                      height: 44,
                      "&:hover": { bgcolor: "grey.200" },
                      "&:disabled": { bgcolor: "grey.200", color: "grey.500" },
                    }}
                  >
                    {voice.status === "connecting" ? (
                      <CircularProgress size={20} />
                    ) : (
                      <MicIcon sx={{ fontSize: 20 }} />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
              <TextField
                inputRef={inputRef}
                fullWidth
                multiline
                maxRows={4}
                placeholder={
                  isComplete ? "Intake complete" : "Type your message..."
                }
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading || isComplete}
                variant="outlined"
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "24px",
                    bgcolor: "grey.50",
                  },
                }}
              />
              <IconButton
                color="primary"
                onClick={() => handleSend(inputValue)}
                disabled={!inputValue.trim() || isLoading || isComplete}
                aria-label="Send message"
                sx={{
                  bgcolor: "primary.main",
                  color: "white",
                  width: 44,
                  height: 44,
                  "&:hover": { bgcolor: "primary.dark" },
                  "&:disabled": { bgcolor: "grey.300", color: "grey.500" },
                }}
              >
                {isLoading ? (
                  <CircularProgress size={20} sx={{ color: "white" }} />
                ) : (
                  <SendIcon sx={{ fontSize: 20 }} />
                )}
              </IconButton>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
