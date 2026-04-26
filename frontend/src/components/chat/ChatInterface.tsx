import { useState, useRef, useEffect } from "react";
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
import { sendIntakeMessage, getCrisisResources } from "@/lib/api";
import { getStoredLanguage } from "@/components/common/LanguageSelector";
import type { IntakeMessage, IntakeSession, CrisisResource } from "@/types";

interface ChatInterfaceProps {
  session: IntakeSession;
  onComplete?: (sessionId: string) => void;
}

export default function ChatInterface({
  session,
  onComplete,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<IntakeMessage[]>(
    session.conversation ?? [],
  );
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [crisisDetected, setCrisisDetected] = useState(false);
  const [crisisResources, setCrisisResources] = useState<CrisisResource[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const convo = session.conversation ?? [];
    if (convo.length > 0) {
      setMessages(convo);
      const last = convo[convo.length - 1];
      setProgress(last.progress_percent);
    }
  }, [session]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;

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
        session.id,
        text.trim(),
        language,
      );
      setMessages((prev) => [...prev, response]);
      setProgress(response.progress_percent);

      if (response.crisis_detected && !crisisDetected) {
        setCrisisDetected(true);
        try {
          const resources = await getCrisisResources();
          setCrisisResources(resources);
        } catch {
          /* best effort */
        }
      }

      if (response.is_complete) {
        setIsComplete(true);
      }
    } catch {
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
      setIsLoading(false);
      inputRef.current?.focus();
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
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 2,
          py: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.length === 0 && !isLoading && (
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

        {/* Typing indicator */}
        {isLoading && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 2,
              animation: "fadeSlideIn 0.3s ease-out",
              "@keyframes fadeSlideIn": {
                from: { opacity: 0, transform: "translateY(8px)" },
                to: { opacity: 1, transform: "translateY(0)" },
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
                    animation: "typingDot 1.4s infinite ease-in-out",
                    animationDelay: `${i * 0.2}s`,
                    "@keyframes typingDot": {
                      "0%, 80%, 100%": {
                        opacity: 0.3,
                        transform: "scale(0.8)",
                      },
                      "40%": { opacity: 1, transform: "scale(1)" },
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
            animation: "ctaSlideIn 0.4s ease-out",
            "@keyframes ctaSlideIn": {
              from: { opacity: 0, transform: "translateY(12px)" },
              to: { opacity: 1, transform: "translateY(0)" },
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
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
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
            sx={{
              bgcolor: "primary.main",
              color: "white",
              width: 42,
              height: 42,
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
      </Box>
    </Box>
  );
}
