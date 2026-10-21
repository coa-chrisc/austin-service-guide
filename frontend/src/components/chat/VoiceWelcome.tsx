import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { VOICE_WELCOME_TEXT } from "@/lib/speech";

/** The privacy welcome, shown while it is spoken at voice start. */
export default function VoiceWelcome() {
  return (
    <Alert
      severity="info"
      role="note"
      icon={<ShieldOutlinedIcon />}
      sx={{ mb: 2, borderRadius: 2 }}
    >
      <AlertTitle sx={{ fontWeight: 700 }}>Voice assistant</AlertTitle>
      {VOICE_WELCOME_TEXT}
    </Alert>
  );
}
