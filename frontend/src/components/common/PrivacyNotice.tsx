import { Link as RouterLink } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import type { SxProps, Theme } from "@mui/material/styles";
import { useBrandConfig } from "@/hooks/useBrandConfig";

/** Permanent privacy notice (brand copy). Static text: no live-region role, so screen readers read it in page order, once. */
export default function PrivacyNotice({ sx }: { sx?: SxProps<Theme> }) {
  const { copy } = useBrandConfig().serviceGuide;
  return (
    <Alert
      severity="info"
      role="note"
      sx={[{ py: 0, "& .MuiAlert-message": { py: 0.75 }, fontSize: 13 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {copy.privacyNotice}{" "}
      <Link component={RouterLink} to="/how-it-works#pii" color="inherit" sx={{ fontWeight: 600 }}>
        How this works
      </Link>
    </Alert>
  );
}
