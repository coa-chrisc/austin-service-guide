import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import MicIcon from "@mui/icons-material/Mic";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import DownloadIcon from "@mui/icons-material/Download";
import RawAudioBadge from "./RawAudioBadge";
import { focusRing } from "./voiceStyles";
import type { IntakeVoice } from "./useIntakeVoice";

/** Stops voice, clears live transcript and voice state; keeps the text chat. */
export function ClearVoiceSessionButton({
  onClear,
  compact = false,
}: {
  onClear: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Tooltip title="Clear voice session">
        <IconButton
          size="small"
          onClick={onClear}
          aria-label="Clear voice session"
          sx={(theme) => ({
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            width: 34,
            height: 34,
            ...focusRing(theme),
          })}
        >
          <DeleteSweepIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }
  return (
    <Button
      size="small"
      variant="outlined"
      disableElevation
      onClick={onClear}
      aria-label="Clear voice session"
      startIcon={<DeleteSweepIcon />}
      sx={(theme) => ({
        textTransform: "none",
        fontWeight: 600,
        borderRadius: 2,
        ...focusRing(theme),
      })}
    >
      Clear voice session
    </Button>
  );
}

/** The mic button in the text input row. */
export function VoiceMicButton({ voice }: { voice: IntakeVoice }) {
  const retry = voice.realtime.status === "error" || voice.local.status === "error";
  const label = retry ? "Try voice chat again" : "Start voice chat";
  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          color="primary"
          onClick={voice.start}
          disabled={voice.disabled || voice.starting}
          aria-label={label}
          sx={(theme) => ({
            bgcolor: "grey.100",
            color: "primary.main",
            width: 44,
            height: 44,
            "&:hover": { bgcolor: "grey.200" },
            "&:disabled": { bgcolor: "grey.200", color: "grey.500" },
            ...focusRing(theme),
          })}
        >
          {voice.starting ? (
            <CircularProgress size={20} />
          ) : (
            <MicIcon sx={{ fontSize: 20 }} />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}

/**
 * Voice notices above the text input while no voice session is running:
 * the raw-audio badge, voice errors, the on-device availability message
 * with a "Download speech pack" action, and Clear voice session.
 */
export function VoiceNotices({ voice }: { voice: IntakeVoice }) {
  const { local, realtime } = voice;
  const showRealtimeError = voice.isRealtime && realtime.status === "error";
  const showLocalMessage = !voice.isRealtime && !!local.message;
  const canDownload =
    !voice.isRealtime &&
    (local.availability === "downloadable" || local.status === "installing");
  return (
    <>
      {voice.isRealtime && (
        <Box sx={{ display: "flex", mb: 1 }}>
          <RawAudioBadge />
        </Box>
      )}
      {/* Always mounted so screen readers announce new voice status text. */}
      <Box role="status" aria-live="polite">
        {showRealtimeError && (
          <Alert severity="error" sx={{ mb: 1, borderRadius: 2 }}>
            {realtime.error ||
              "Voice chat couldn't start. You can keep typing or try voice again."}
          </Alert>
        )}
        {showLocalMessage && (
          <Alert
            severity={local.status === "error" ? "error" : "info"}
            sx={{ mb: 1, borderRadius: 2 }}
            action={
              canDownload ? (
                <Button
                  size="small"
                  variant="contained"
                  disableElevation
                  onClick={() => void voice.installSpeechPack()}
                  disabled={local.status === "installing"}
                  startIcon={
                    local.status === "installing" ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <DownloadIcon />
                    )
                  }
                  sx={(theme) => ({
                    textTransform: "none",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    ...focusRing(theme),
                  })}
                >
                  Download speech pack
                </Button>
              ) : undefined
            }
          >
            {local.message}
          </Alert>
        )}
      </Box>
      {voice.hasVoiceState && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          <ClearVoiceSessionButton onClear={voice.clear} />
        </Box>
      )}
    </>
  );
}
