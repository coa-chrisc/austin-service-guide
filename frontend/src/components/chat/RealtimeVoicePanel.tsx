import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import type { useRealtimeVoiceSession } from "@/hooks/useRealtimeVoiceSession";
import { ClearVoiceSessionButton } from "./VoiceControls";

interface RealtimeVoicePanelProps {
  voice: ReturnType<typeof useRealtimeVoiceSession>;
  onRetry: () => void;
  retryDisabled: boolean;
  onClear: () => void;
}

/** Status and controls for an active OpenAI Realtime (raw audio) session. */
export default function RealtimeVoicePanel({
  voice,
  onRetry,
  retryDisabled,
  onClear,
}: RealtimeVoicePanelProps) {
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

  return (
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
                voice.status === "error" ? "brand.negativeText" : "primary.dark",
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
            voice.status === "error" ? "brand.negativeText" : "text.secondary"
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
          <ClearVoiceSessionButton onClear={onClear} compact />
        </>
      ) : (
        <Tooltip title="Try voice chat again">
          <IconButton
            size="small"
            color="primary"
            onClick={onRetry}
            disabled={retryDisabled}
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
  );
}
