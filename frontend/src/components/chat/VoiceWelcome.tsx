import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { VOICE_WELCOME_TEXT } from "@/lib/speech";
import { useStoredLanguage } from "@/components/common/LanguageSelector";
import { makeVoiceT } from "./voiceI18n";

/**
 * The privacy welcome shown at voice start. On-device mode shows the exact
 * text it speaks. Realtime mode speaks nothing on the device, so it shows a
 * short reminder in the UI language instead.
 */
export default function VoiceWelcome({ realtime = false }: { realtime?: boolean }) {
  const language = useStoredLanguage();
  const t = makeVoiceT(realtime ? language : "en");
  return (
    <Alert
      severity="info"
      role="note"
      icon={<ShieldOutlinedIcon />}
      dir={realtime ? "auto" : undefined}
      sx={{ mb: 2, borderRadius: 2 }}
    >
      <AlertTitle sx={{ fontWeight: 700 }}>{t("voice_title")}</AlertTitle>
      {realtime ? t("privacy_reminder") : VOICE_WELCOME_TEXT}
    </Alert>
  );
}
