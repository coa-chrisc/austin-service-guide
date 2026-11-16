import { Link as RouterLink } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import type { SxProps, Theme } from "@mui/material/styles";
import { useBrandConfig } from "@/hooks/useBrandConfig";

/** The one-line notice shown while the crisis lines need the room. */
const COMPACT_NOTICE = "Don't share personal details.";

/**
 * Permanent privacy notice (brand copy). Static text: no live-region role, so screen readers read it in page order, once.
 * `compact` shortens it to one line, for when the crisis lines take the space above it.
 */
export default function PrivacyNotice({ sx, compact = false }: { sx?: SxProps<Theme>; compact?: boolean }) {
  const { copy } = useBrandConfig().serviceGuide;
  return (
    <Alert
      severity="info"
      role="note"
      sx={[
        { py: 0, "& .MuiAlert-message": { py: 0.75 }, fontSize: 13 },
        compact && {
          px: 0.75,
          "& .MuiAlert-icon": { py: 0.5, mr: 0.5, fontSize: 18 },
          "& .MuiAlert-message": { py: 0.5 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {compact ? COMPACT_NOTICE : copy.privacyNotice}{" "}
      <Link component={RouterLink} to="/how-it-works#pii" color="inherit" sx={{ fontWeight: 600 }}>
        How this works
      </Link>
    </Alert>
  );
}
