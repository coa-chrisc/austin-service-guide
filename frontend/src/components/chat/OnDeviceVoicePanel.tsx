import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, type Theme } from "@mui/material/styles";
import MicIcon from "@mui/icons-material/Mic";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import HearingIcon from "@mui/icons-material/Hearing";
import type { OnDeviceVoiceIntake } from "@/hooks/useOnDeviceVoiceIntake";
import { ClearVoiceSessionButton } from "./VoiceControls";
import { focusRing } from "./voiceStyles";

interface OnDeviceVoicePanelProps {
  voice: OnDeviceVoiceIntake;
  onEnd: () => void;
  onClear: () => void;
}

const LABELS: Record<OnDeviceVoiceIntake["status"], string> = {
  idle: "Voice on",
  installing: "Downloading speech pack",
  speaking: "Assistant speaking",
  listening: "Listening",
  processing: "Sending what you said",
  paused: "Paused",
  error: "Voice unavailable",
};

const DETAILS: Partial<Record<OnDeviceVoiceIntake["status"], string>> = {
  listening: "Speak now. Your speech is turned into text on this device.",
  processing: "Personal details are removed before your words are sent.",
  speaking: "Reading the reply aloud with an on-device voice.",
};

/** Status and controls for an active on-device voice session. */
export default function OnDeviceVoicePanel({
  voice,
  onEnd,
  onClear,
}: OnDeviceVoicePanelProps) {
  const { status } = voice;
  const label = LABELS[status];
  const detail = voice.message || DETAILS[status] || "";
  const isError = status === "error";
  const buttonSx = (color: "primary" | "error") => (theme: Theme) => ({
    border: "1px solid",
    borderColor: alpha(theme.palette[color].main, 0.22),
    bgcolor: alpha(theme.palette[color].main, 0.06),
    width: 34,
    height: 34,
    ...focusRing(theme),
  });

  return (
    <Box
      sx={(theme) => ({
        px: { xs: 1.25, sm: 1.5 },
        py: 1.25,
        borderRadius: 2,
        border: "1px solid",
        borderColor: isError
          ? alpha(theme.palette.error.main, 0.28)
          : alpha(theme.palette.primary.main, 0.18),
        bgcolor: "background.paper",
        boxShadow: `0 4px 14px ${alpha(theme.palette.text.primary, 0.08)}`,
      })}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minHeight: 40 }}>
        <Avatar
          sx={{
            width: 36,
            height: 36,
            flexShrink: 0,
            bgcolor: isError
              ? "error.main"
              : status === "speaking"
                ? "secondary.main"
                : "primary.main",
          }}
        >
          {status === "listening" ? (
            <HearingIcon sx={{ fontSize: 18 }} />
          ) : (
            <MicIcon sx={{ fontSize: 18 }} />
          )}
        </Avatar>
        <Box role="status" aria-live="polite" sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            fontWeight={800}
            color={isError ? "error.main" : "primary.dark"}
            sx={{ display: "block", lineHeight: 1.35 }}
          >
            {label}
          </Typography>
          {detail && (
            <Typography
              variant="caption"
              color={isError ? "error.main" : "text.secondary"}
              sx={{ display: "block", mt: 0.25 }}
            >
              {detail}
            </Typography>
          )}
        </Box>
        {status === "listening" && (
          <Tooltip title="Stop listening">
            <IconButton
              size="small"
              color="primary"
              onClick={voice.stopListening}
              aria-label="Stop listening"
              sx={buttonSx("primary")}
            >
              <StopCircleIcon />
            </IconButton>
          </Tooltip>
        )}
        {status === "speaking" && (
          <Tooltip title="Stop speaking">
            <IconButton
              size="small"
              color="primary"
              onClick={voice.stopListening}
              aria-label="Stop speaking"
              sx={buttonSx("primary")}
            >
              <VolumeOffIcon />
            </IconButton>
          </Tooltip>
        )}
        {status === "paused" && (
          <Tooltip title="Listen">
            <IconButton
              size="small"
              color="primary"
              onClick={voice.resume}
              aria-label="Listen"
              sx={buttonSx("primary")}
            >
              <MicIcon />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="End voice chat">
          <IconButton
            size="small"
            color="error"
            onClick={onEnd}
            aria-label="End voice chat"
            sx={buttonSx("error")}
          >
            <CallEndIcon />
          </IconButton>
        </Tooltip>
        <ClearVoiceSessionButton onClear={onClear} compact />
      </Box>
      {voice.noLocalVoice && (
        <Typography
          variant="caption"
          color="text.secondary"
          role="note"
          sx={{ display: "block", mt: 1 }}
        >
          {voice.noLocalVoiceMessage}
        </Typography>
      )}
    </Box>
  );
}
