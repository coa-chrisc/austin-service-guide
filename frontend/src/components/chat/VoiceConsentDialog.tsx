import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";

interface VoiceConsentDialogProps {
  open: boolean;
  onCancel: () => void;
  onAgree: () => void;
}

/** Consent before raw microphone audio is streamed to OpenAI. */
export default function VoiceConsentDialog({
  open,
  onCancel,
  onAgree,
}: VoiceConsentDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby="voice-consent-title"
      aria-describedby="voice-consent-description"
    >
      <DialogTitle id="voice-consent-title" sx={{ fontWeight: 700 }}>
        Your voice will be sent to OpenAI
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="voice-consent-description" sx={{ mb: 1.5 }}>
          In this voice mode, the audio from your microphone is streamed
          directly to OpenAI's Realtime API, which listens and answers out
          loud. This mode is intended for deployments that have a
          zero-data-retention agreement with OpenAI.
        </DialogContentText>
        <DialogContentText>
          Please do not say your name, street address, phone number, or Social
          Security number. If you'd rather not send audio, choose Cancel and
          type your messages instead.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onCancel}
          autoFocus
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          disableElevation
          onClick={onAgree}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          I agree, start voice
        </Button>
      </DialogActions>
    </Dialog>
  );
}
