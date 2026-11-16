import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { useStoredLanguage } from "@/components/common/LanguageSelector";
import { makeVoiceT } from "./voiceI18n";

interface VoiceConsentDialogProps {
  open: boolean;
  onCancel: () => void;
  onAgree: () => void;
}

/** Consent before raw microphone audio is streamed to OpenAI (UI language). */
export default function VoiceConsentDialog({
  open,
  onCancel,
  onAgree,
}: VoiceConsentDialogProps) {
  const t = makeVoiceT(useStoredLanguage());
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      dir="auto"
      aria-labelledby="voice-consent-title"
      aria-describedby="voice-consent-description"
    >
      <DialogTitle id="voice-consent-title" sx={{ fontWeight: 700 }}>
        {t("consent_title")}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="voice-consent-description" sx={{ mb: 1.5 }}>
          {t("consent_body")}
        </DialogContentText>
        <DialogContentText>{t("consent_privacy")}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onCancel}
          autoFocus
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {t("consent_cancel")}
        </Button>
        <Button
          variant="contained"
          disableElevation
          onClick={onAgree}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {t("consent_agree")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
