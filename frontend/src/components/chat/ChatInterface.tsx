import { alpha } from "@mui/material/styles";
import { useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Avatar from "@mui/material/Avatar";
import SendIcon from "@mui/icons-material/Send";
import PhoneIcon from "@mui/icons-material/Phone";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ChatBubble from "./ChatBubble";
import OnDeviceVoicePanel from "./OnDeviceVoicePanel";
import RawAudioBadge from "./RawAudioBadge";
import RealtimeVoicePanel from "./RealtimeVoicePanel";
import VoiceConsentDialog from "./VoiceConsentDialog";
import VoiceWelcome from "./VoiceWelcome";
import { VoiceMicButton, VoiceNotices } from "./VoiceControls";
import { useIntakeVoice } from "./useIntakeVoice";
import { sendIntakeMessage, getCrisisResources } from "@/lib/api";
import { withIntakeState } from "@/lib/session";
import { getStoredLanguage } from "@/components/common/LanguageSelector";
import PrivacyNotice from "@/components/common/PrivacyNotice";
import PrivacySnackbar from "@/components/common/PrivacySnackbar";
import { useBrandConfig } from "@/hooks/useBrandConfig";
import { scrubPII } from "@/lib/piiGuard";
import type { IntakeMessage, CrisisResource } from "@/types";

interface ChatInterfaceProps {
  /** Changes whenever a different intake is shown; resets the chat. */
  intakeKey: number;
  /** Conversation from the stored intake state when the chat mounts. */
  initialConversation: IntakeMessage[];
  onComplete?: () => void;
  initialMode?: "text" | "voice";
}

export default function ChatInterface({
  intakeKey,
  initialConversation,
  onComplete,
  initialMode = "text",
}: ChatInterfaceProps) {
  const initialMessages = initialConversation ?? [];
  const [messages, setMessages] = useState<IntakeMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [privacyToast, setPrivacyToast] = useState(false);
  const { appName } = useBrandConfig();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(
    initialMessages[initialMessages.length - 1]?.progress_percent ?? 0,
  );
  const [isComplete, setIsComplete] = useState(false);
  const [crisisDetected, setCrisisDetected] = useState(false);
  const [crisisResources, setCrisisResources] = useState<CrisisResource[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const intakeKeyRef = useRef(intakeKey);
  const voiceResetRef = useRef<() => void>(() => undefined);
  // Voice sends through the same text path; bound after handleSend below.
  const handleSendRef = useRef<(text: string) => Promise<IntakeMessage | null>>(
    async () => null,
  );
  const sendVoiceText = useCallback(
    (text: string) => handleSendRef.current(text),
    [],
  );
  const showPrivacyToast = useCallback(() => setPrivacyToast(true), []);

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

  // Replace the raw local transcript (shown before the sync) with the
  // redacted server copy so the raw version is neither kept nor duplicated.
  // This state is replayed into later voice sessions.
  const handleVoiceLocalTranscriptReplace = useCallback(
    (role: "user" | "assistant", localText: string, storedText: string) => {
      if (storedText === localText) return;
      setMessages((prev) => {
        let idx = -1;
        for (let k = prev.length - 1; k >= 0; k--) {
          if (prev[k].role === role && prev[k].content.trim() === localText) {
            idx = k;
            break;
          }
        }
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], content: storedText };
        return next;
      });
    },
    [],
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

  const voice = useIntakeVoice({
    messages,
    initialMode,
    disabled: isLoading || isComplete,
    sendText: sendVoiceText,
    onRedacted: showPrivacyToast,
    realtime: {
      onLocalTranscript: handleVoiceLocalTranscript,
      onLocalTranscriptReplace: handleVoiceLocalTranscriptReplace,
      onTranscriptSync: handleVoiceTranscriptSync,
      onToolResult: handleVoiceToolResult,
    },
  });

  useEffect(() => {
    voiceResetRef.current = voice.reset;
  }, [voice.reset]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // The streaming voice bubble grows token-by-token; smooth-scrolling each
  // delta fights the moving target and makes the bubble look herky-jerky.
  // Use instant scroll so the viewport just stays pinned to the bottom.
  const liveVoiceText = voice.liveMessage?.content ?? "";
  useEffect(() => {
    if (!liveVoiceText) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [liveVoiceText]);

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
    if (intakeKeyRef.current !== intakeKey) {
      voiceResetRef.current();
      intakeKeyRef.current = intakeKey;
      const convo = initialConversation ?? [];
      setMessages(convo);
      setInputValue("");
      setIsLoading(false);
      setProgress(convo[convo.length - 1]?.progress_percent ?? 0);
      setIsComplete(false);
      setCrisisDetected(false);
      setCrisisResources([]);
    }
  }, [intakeKey, initialConversation]);

  useEffect(() => {
    return () => {
      voiceResetRef.current();
    };
  }, []);

  // Resolves to the assistant message it appended (reply or error), or
  // null when nothing was sent. Voice turns reuse this path.
  const handleSend = async (text: string): Promise<IntakeMessage | null> => {
    if (!text.trim() || isLoading || voice.realtime.isActive) return null;
    const activeKey = intakeKey;
    // Client-side pre-flight: send only the scrubbed text. The backend still
    // redacts independently. Never log the raw text.
    const { text: scrubbed, kinds } = scrubPII(text.trim());
    if (kinds.length > 0) setPrivacyToast(true);
    text = scrubbed;

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
      const { response, user_message: userMessage } = await withIntakeState(
        (state) => sendIntakeMessage(state, text.trim(), language),
      );
      if (intakeKeyRef.current !== activeKey) return null;
      // Swap the optimistic raw copy for the stored, redacted one: this state
      // is later replayed into voice sessions. Without a stored copy, drop it.
      setMessages((prev) => [
        ...(userMessage
          ? prev.map((m) =>
              m === userMsg ? { ...m, content: userMessage.content } : m,
            )
          : prev.filter((m) => m !== userMsg)),
        response,
      ]);
      setProgress(response.progress_percent);

      if (response.crisis_detected && !crisisDetected) {
        await loadCrisisResources();
      }

      if (response.is_complete) {
        setIsComplete(true);
      }
      return response;
    } catch {
      if (intakeKeyRef.current !== activeKey) return null;
      const errorMsg: IntakeMessage = {
        role: "assistant",
        content: "I'm sorry, something went wrong. Please try again.",
        suggested_buttons: [],
        progress_percent: progress,
        is_complete: false,
        crisis_detected: false,
      };
      // The server never stored (or redacted) this message, so drop the raw
      // optimistic copy; otherwise it would be replayed into a voice session.
      setMessages((prev) => [...prev.filter((m) => m !== userMsg), errorMsg]);
      return errorMsg;
    } finally {
      if (intakeKeyRef.current === activeKey) {
        setIsLoading(false);
      }
    }
  };

  handleSendRef.current = handleSend;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue);
    }
  };

  const handleButtonClick = (value: string) => {
    handleSend(value);
  };

  const liveTranscriptMessage: IntakeMessage | null = voice.liveMessage
    ? {
        ...voice.liveMessage,
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
        {voice.welcomeVisible && <VoiceWelcome />}

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
              Welcome to {appName}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              textAlign="center"
              maxWidth={400}
            >
              I'll ask you a few questions to find city services you may be
              eligible for. This guide uses AI (OpenAI), so please don't share
              names, Social Security numbers, or account numbers.
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
              // During voice the latest assistant bubble is replacing the
              // live-streaming bubble in place; replaying the entry
              // animation makes that swap feel like a redraw. Suppress it
              // only for the assistant turn — user bubbles should still
              // fade in normally since nothing was streaming there.
              suppressEntryAnimation={
                voice.realtime.isActive &&
                idx === arr.length - 1 &&
                msg.role === "assistant"
              }
            />
          ))}

        {liveTranscriptMessage && (
          <ChatBubble
            key="voice-live-bubble"
            message={liveTranscriptMessage}
            streaming
          />
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
            onClick={() => onComplete?.()}
            endIcon={<ArrowForwardIcon />}
            sx={{
              borderRadius: "28px",
              py: 1.75,
              fontSize: "1.125rem",
              fontWeight: 700,
              minHeight: 56,
              // Solid primary: text over the primary-to-accent gradient cannot reach AA at both ends.
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "&:hover": { bgcolor: "primary.dark" },
              boxShadow: (theme) =>
                `0 6px 18px ${alpha(theme.palette.brand.ink, 0.35)}`,
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
        {voice.realtime.isActive ? (
          <>
            <Box sx={{ display: "flex", mb: 1 }}>
              <RawAudioBadge />
            </Box>
            <RealtimeVoicePanel
              voice={voice.realtime}
              onRetry={voice.start}
              retryDisabled={isLoading || isComplete}
              onClear={voice.clear}
            />
          </>
        ) : voice.local.isActive ? (
          <OnDeviceVoicePanel
            voice={voice.local}
            onEnd={voice.end}
            onClear={voice.clear}
          />
        ) : (
          <>
            <VoiceNotices voice={voice} />
            <PrivacyNotice sx={{ mb: 1, borderRadius: 2 }} />
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
              <VoiceMicButton voice={voice} />
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
                slotProps={{
                  htmlInput: { maxLength: 4000, "aria-label": "Message" },
                }}
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
                  color: "primary.contrastText",
                  width: 44,
                  height: 44,
                  "&:hover": { bgcolor: "primary.dark" },
                  "&:disabled": { bgcolor: "grey.300", color: "grey.500" },
                }}
              >
                {isLoading ? (
                  <CircularProgress size={20} sx={{ color: "primary.contrastText" }} />
                ) : (
                  <SendIcon sx={{ fontSize: 20 }} />
                )}
              </IconButton>
            </Box>
          </>
        )}
      </Box>
      <VoiceConsentDialog
        open={voice.consentOpen}
        onCancel={voice.cancelConsent}
        onAgree={voice.agreeToRawAudio}
      />
      <PrivacySnackbar
        open={privacyToast}
        onClose={() => setPrivacyToast(false)}
      />
    </Box>
  );
}
