import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ChatIcon from "@mui/icons-material/Chat";
import ThermostatIcon from "@mui/icons-material/Thermostat";
import SchoolIcon from "@mui/icons-material/School";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import PublicIcon from "@mui/icons-material/Public";
import { loadPersona, type PersonaSummary } from "@/lib/api";
import { clearIntakeState, startNewIntakeState } from "@/lib/session";
import { groupScenarios } from "@/lib/demoScenarios";
import type { DemoState } from "@/pages/DemoIntake";

// Keyed by the persona id's theme prefix (the part before the first "-"),
// so ids stay free to name the place, e.g. "equity-<neighborhood>-zh".
const PERSONA_ICONS: Record<string, React.ReactNode> = {
  heat: <ThermostatIcon sx={{ fontSize: 26 }} />,
  schools: <SchoolIcon sx={{ fontSize: 26 }} />,
  equity: <HomeWorkIcon sx={{ fontSize: 26 }} />,
  refugee: <PublicIcon sx={{ fontSize: 26 }} />,
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  vi: "Tiếng Việt",
  zh: "中文",
  ar: "العربية",
};

const buttonSx = { textTransform: "none", fontWeight: 600 } as const;

/** The ?demo=1 scenario launcher on the landing page. */
export default function DemoLauncher({ personas }: { personas: PersonaSummary[] }) {
  const navigate = useNavigate();
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const scenarios = groupScenarios(personas);

  const launch = async (persona: PersonaSummary, base: PersonaSummary) => {
    setLaunchingId(persona.id);
    setError(false);
    try {
      const res = await loadPersona(persona.id);
      startNewIntakeState(res.state);
      const demoState: DemoState = {
        openingMessage: res.opening_message,
        script: res.script,
        personaLabel: persona.label,
        personaSummary: persona.summary || base.summary,
      };
      navigate("/demo", { state: demoState });
    } catch (err) {
      console.error("Failed to load persona", err);
      setError(true);
      setLaunchingId(null);
    }
  };

  const startLive = () => {
    clearIntakeState();
    navigate("/intake?fresh=1");
  };

  return (
    <Box
      id="demo-launcher"
      sx={(theme) => ({
        // Clear the sticky header (56px phones, 64px from sm) when scrolled into view.
        scrollMarginTop: { xs: 56, sm: 64 },
        bgcolor: alpha(theme.palette.warning.main, 0.12),
        borderBottom: "1px solid",
        borderColor: alpha(theme.palette.warning.main, 0.4),
      })}
    >
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: { xs: "flex-start", md: "flex-end" },
            justifyContent: "space-between",
            flexDirection: { xs: "column", md: "row" },
            mb: 3,
          }}
        >
          <Box sx={{ maxWidth: 720 }}>
            <Typography variant="overline" sx={{ color: "warning.dark", fontWeight: 700 }}>
              Demo mode
            </Typography>
            <Typography variant="h5" component="h2" fontWeight={700} gutterBottom>
              Watch a sample resident scenario
            </Typography>
            <Typography variant="body1" color="text.secondary">
              These are pre-written conversations that replay automatically,
              with no live AI. The plan at the end comes from the real matching
              engine and service catalog.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<ChatIcon />}
            onClick={startLive}
            sx={{ ...buttonSx, flexShrink: 0, bgcolor: "background.paper" }}
          >
            Start a live conversation
          </Button>
        </Box>

        {error && (
          <Typography role="alert" color="error" variant="body2" sx={{ mb: 2 }}>
            That scenario didn't load. Please try again.
          </Typography>
        )}

        <Grid container spacing={2}>
          {scenarios.map(({ base, variants }) => (
            <Grid key={base.id} size={{ xs: 12, sm: 6, lg: 3 }}>
              <Card
                variant="outlined"
                sx={{ height: "100%", p: 2.25, display: "flex", flexDirection: "column" }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.25 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      flexShrink: 0,
                      borderRadius: "50%",
                      bgcolor: "warning.light",
                      color: "warning.dark",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {PERSONA_ICONS[base.id.split("-")[0]] ?? <PublicIcon sx={{ fontSize: 26 }} />}
                  </Box>
                  <Typography variant="subtitle1" component="h3" fontWeight={700} lineHeight={1.25}>
                    {base.label}
                  </Typography>
                </Box>
                {base.summary && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    {base.summary}
                  </Typography>
                )}
                {base.shows.length > 0 && (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1.5 }}>
                    {base.shows.map((tag) => (
                      <Chip key={tag} label={tag} size="small" />
                    ))}
                  </Box>
                )}
                <Box sx={{ mt: "auto" }}>
                  <Button
                    fullWidth
                    variant="contained"
                    disableElevation
                    startIcon={<PlayArrowIcon />}
                    disabled={launchingId !== null}
                    onClick={() => launch(base, base)}
                    sx={buttonSx}
                  >
                    {launchingId === base.id ? (
                      "Loading…"
                    ) : (
                      <Box component="span" sx={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                        Play scenario
                        <Box component="span" sx={{ fontWeight: 400, fontSize: "0.8125rem", opacity: 0.9 }}>
                          about 30 seconds
                        </Box>
                      </Box>
                    )}
                  </Button>
                  {variants.length > 0 && (
                    <Box sx={{ mt: 1.25, display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                      <Typography variant="caption" color="text.secondary">
                        Also in:
                      </Typography>
                      {variants.map((v) => {
                        const language = LANGUAGE_LABELS[v.language] ?? v.language;
                        return (
                          <Chip
                            key={v.id}
                            size="small"
                            variant="outlined"
                            color="primary"
                            clickable
                            disabled={launchingId !== null}
                            onClick={() => launch(v, base)}
                            label={launchingId === v.id ? "Loading…" : language}
                            aria-label={`Play this scenario in ${language}`}
                          />
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
