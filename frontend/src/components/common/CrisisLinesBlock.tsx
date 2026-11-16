import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import PhoneIcon from "@mui/icons-material/Phone";
import SmsIcon from "@mui/icons-material/Sms";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { SxProps, Theme } from "@mui/material/styles";
import { getCrisisResources } from "@/lib/api";
import {
  NATIONAL_CRISIS_LINES,
  mergeCrisisLines,
  phoneDigits,
} from "@/lib/crisisLines";
import type { CrisisResource } from "@/types";

export interface CrisisLinesLabels {
  heading: string;
  intro: string;
  /** Label for the "text 988" button. */
  text988: string;
}

const ENGLISH: CrisisLinesLabels = {
  heading: "Help is available right now",
  intro:
    "If you are in immediate danger, call 9-1-1. These lines are free, confidential and open 24/7.",
  text988: "Text 988",
};

const BUTTON_SX = {
  textTransform: "none",
  fontWeight: 600,
  borderRadius: (theme: Theme) => theme.shape.radius.pill,
  // A 44 px call target on phones and touch screens; compact on desktop.
  minHeight: { xs: 44, md: 32 },
  "@media (pointer: coarse)": { minHeight: 44 },
} as const;

/**
 * Pinned crisis lines with tap-to-call buttons. Renders the built-in
 * national lines at once and adds the pack's lines when the fetch returns;
 * a failed fetch leaves the national lines in place.
 */
export default function CrisisLinesBlock({
  labels = ENGLISH,
  sx,
}: {
  labels?: CrisisLinesLabels;
  sx?: SxProps<Theme>;
}) {
  const [lines, setLines] = useState<CrisisResource[]>(NATIONAL_CRISIS_LINES);

  useEffect(() => {
    let active = true;
    getCrisisResources()
      .then((fetched) => {
        if (active) setLines(mergeCrisisLines(fetched));
      })
      .catch(() => {
        /* the built-in national lines stay */
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Alert
      severity="error"
      icon={<WarningAmberIcon />}
      role="region"
      aria-label={labels.heading}
      sx={[
        { "& .MuiAlert-message": { width: "100%" } },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography variant="subtitle2" component="h2" fontWeight={700} gutterBottom>
        {labels.heading}
      </Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {labels.intro}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {lines.map((line) => (
          <Button
            key={line.phone}
            variant="contained"
            color="error"
            size="small"
            disableElevation
            startIcon={<PhoneIcon />}
            href={`tel:${phoneDigits(line.phone)}`}
            sx={BUTTON_SX}
          >
            {line.name}: {line.phone}
          </Button>
        ))}
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<SmsIcon />}
          href="sms:988"
          sx={BUTTON_SX}
        >
          {labels.text988}
        </Button>
      </Box>
    </Alert>
  );
}
