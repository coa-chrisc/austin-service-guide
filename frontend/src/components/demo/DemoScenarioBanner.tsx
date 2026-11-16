import { useNavigate } from "react-router-dom";
import { alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import TheaterComedyIcon from "@mui/icons-material/TheaterComedy";
import { clearIntakeState } from "@/lib/session";

interface DemoScenarioBannerProps {
  /** Scenario name; the banner still says "Sample scenario" without one. */
  label?: string;
  /** What is scripted about this view. */
  message: string;
  /** Slimmer padding for pages where the banner sits above other content. */
  dense?: boolean;
  /** Stay pinned under the sticky header while the page scrolls. */
  sticky?: boolean;
}

const buttonSx = {
  textTransform: "none",
  fontWeight: 600,
  // A 44 px tap target on phones and touch screens; compact on desktop.
  minHeight: { xs: 44, md: 0 },
  "@media (pointer: coarse)": { minHeight: 44 },
} as const;

/**
 * Full-width notice that the resident on screen is a pre-written sample,
 * with ways out: back to the landing page, or a real conversation.
 */
export default function DemoScenarioBanner({ label, message, dense, sticky }: DemoScenarioBannerProps) {
  const navigate = useNavigate();

  const leave = (to: string) => {
    clearIntakeState();
    navigate(to);
  };

  return (
    <Box
      role="region"
      aria-label="Sample scenario"
      sx={(theme) => {
        const tint = alpha(theme.palette.warning.main, 0.12);
        return {
          // Opaque, so content scrolling under a sticky banner stays hidden.
          bgcolor: "background.default",
          backgroundImage: `linear-gradient(${tint}, ${tint})`,
          borderBottom: "1px solid",
          borderColor: alpha(theme.palette.warning.main, 0.4),
          ...(sticky && {
            position: "sticky",
            // Under the sticky header: 56px phones, 64px from sm.
            top: { xs: 56, sm: 64 },
            zIndex: theme.zIndex.appBar - 1,
          }),
        };
      }}
    >
      <Container
        maxWidth="lg"
        sx={{
          py: dense ? 1 : 1.5,
          display: "flex",
          alignItems: "center",
          gap: { xs: 1, sm: 2 },
          flexWrap: "wrap",
        }}
      >
        <TheaterComedyIcon sx={{ color: "warning.dark", display: { xs: "none", sm: "block" } }} />
        <Typography variant="body2" sx={{ flex: "1 1 280px", minWidth: 0 }}>
          <Box component="strong" sx={{ fontWeight: 700 }}>
            Sample scenario{label ? `: ${label}.` : "."}
          </Box>{" "}
          {message}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => leave("/")} sx={buttonSx}>
            Exit demo
          </Button>
          <Button
            size="small"
            variant="contained"
            disableElevation
            onClick={() => leave("/intake?fresh=1")}
            sx={buttonSx}
          >
            Try it live
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
