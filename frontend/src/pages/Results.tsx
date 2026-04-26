import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Skeleton from "@mui/material/Skeleton";
import Fab from "@mui/material/Fab";
import Drawer from "@mui/material/Drawer";
import MapIcon from "@mui/icons-material/Map";
import SaveIcon from "@mui/icons-material/Save";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChatIcon from "@mui/icons-material/Chat";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoIcon from "@mui/icons-material/Info";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EmojiObjectsIcon from "@mui/icons-material/EmojiObjects";
import ServiceCard from "@/components/services/ServiceCard";
import { getIntakeResults } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type {
  ServiceMatch,
  MatchConfidence,
  RiskFlag,
  BenefitsEstimate,
} from "@/types";

interface ResultsData {
  matches: ServiceMatch[];
  risk_flags: RiskFlag[];
  benefits_estimate: BenefitsEstimate;
}

const SEVERITY_CONFIG: Record<
  string,
  { color: "error" | "warning" | "info"; icon: React.ReactNode }
> = {
  critical: { color: "error", icon: <ErrorOutlineIcon /> },
  high: { color: "error", icon: <WarningAmberIcon /> },
  medium: { color: "warning", icon: <InfoIcon /> },
  low: { color: "info", icon: <EmojiObjectsIcon /> },
};

export default function Results() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterConfidence, setFilterConfidence] =
    useState<MatchConfidence | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    getIntakeResults(sessionId)
      .then((res) =>
        setData({
          matches: res.matches ?? [],
          risk_flags: res.risk_flags ?? [],
          benefits_estimate: res.benefits_estimate ?? {
            total_monthly_value: 0,
            total_annual_value: 0,
            breakdown: [],
          },
        }),
      )
      .catch((err) => setError(err.message || "Failed to load results"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton
          variant="rounded"
          height={120}
          sx={{ mb: 3, borderRadius: 3 }}
        />
        <Skeleton
          variant="rounded"
          height={60}
          sx={{ mb: 2, borderRadius: 2 }}
        />
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <Skeleton
                variant="rounded"
                height={200}
                sx={{ borderRadius: 3 }}
              />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  if (error || !data) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: "center" }}>
        <Alert severity="error">{error || "Session not found"}</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate("/intake")}>
          Start New Intake
        </Button>
      </Container>
    );
  }

  const matches = data.matches;

  // Gather unique categories from matches
  const categories = Array.from(
    new Set(matches.flatMap((m) => m.service.categories)),
  );

  // Apply filters
  let filteredMatches = matches;
  if (filterCategory) {
    filteredMatches = filteredMatches.filter((m) =>
      m.service.categories.includes(filterCategory),
    );
  }
  if (filterConfidence) {
    filteredMatches = filteredMatches.filter(
      (m) => m.match_confidence === filterConfidence,
    );
  }

  // Group by category
  const grouped: Record<string, ServiceMatch[]> = {};
  for (const m of filteredMatches) {
    const cat = m.service.categories[0] || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Summary card */}
        <Card
          sx={{
            mb: 4,
            borderRadius: 3,
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            color: "white",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Typography variant="h4" fontWeight={700} gutterBottom>
              We found {matches.length} service{matches.length !== 1 ? "s" : ""}{" "}
              you may be eligible for
            </Typography>
            <Typography
              variant="body1"
              sx={{ opacity: 0.9, maxWidth: 700, lineHeight: 1.7 }}
            >
              Based on our conversation, we've matched you with services across{" "}
              {categories.length} categories. Review each one below to see
              eligibility details, documents needed, and how to apply.
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5, mt: 3, flexWrap: "wrap" }}>
              <Button
                variant="contained"
                startIcon={<MapIcon />}
                onClick={() => navigate("/map")}
                sx={{
                  bgcolor: "rgba(255,255,255,0.2)",
                  color: "white",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
                }}
              >
                View on Map
              </Button>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={() => {
                  if (!isAuthenticated) {
                    navigate("/login");
                  }
                }}
                sx={{
                  bgcolor: "rgba(255,255,255,0.2)",
                  color: "white",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
                }}
              >
                {isAuthenticated ? "Save Results" : "Sign In to Save"}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Risk flags */}
        {data.risk_flags.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography
              variant="h5"
              fontWeight={600}
              gutterBottom
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
              <CheckCircleIcon color="primary" />
              Areas Where We Can Help
            </Typography>
            <Grid container spacing={2}>
              {data.risk_flags.map((flag: RiskFlag, idx: number) => {
                const config =
                  SEVERITY_CONFIG[flag.severity] || SEVERITY_CONFIG.low;
                return (
                  <Grid key={idx} size={{ xs: 12, md: 6 }}>
                    <Alert
                      severity={config.color}
                      icon={config.icon}
                      sx={{ borderRadius: 2, height: "100%" }}
                    >
                      <Typography variant="subtitle2" fontWeight={600}>
                        {flag.risk_type}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {flag.description}
                      </Typography>
                      {flag.prevention_services.length > 0 && (
                        <Box
                          sx={{
                            display: "flex",
                            gap: 0.5,
                            flexWrap: "wrap",
                            mt: 1,
                          }}
                        >
                          {flag.prevention_services.map((s) => (
                            <Chip
                              key={s}
                              label={s}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: 11 }}
                            />
                          ))}
                        </Box>
                      )}
                    </Alert>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* Filter chips */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Filter by:
          </Typography>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
            <Chip
              label="All"
              onClick={() => {
                setFilterCategory(null);
                setFilterConfidence(null);
              }}
              color={
                !filterCategory && !filterConfidence ? "primary" : "default"
              }
              variant={
                !filterCategory && !filterConfidence ? "filled" : "outlined"
              }
              size="small"
            />
            {categories.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                onClick={() =>
                  setFilterCategory(filterCategory === cat ? null : cat)
                }
                color={filterCategory === cat ? "primary" : "default"}
                variant={filterCategory === cat ? "filled" : "outlined"}
                size="small"
              />
            ))}
            <Chip
              label="Strong Match"
              onClick={() =>
                setFilterConfidence(filterConfidence === "high" ? null : "high")
              }
              color={filterConfidence === "high" ? "success" : "default"}
              variant={filterConfidence === "high" ? "filled" : "outlined"}
              size="small"
            />
            <Chip
              label="Likely Match"
              onClick={() =>
                setFilterConfidence(
                  filterConfidence === "medium" ? null : "medium",
                )
              }
              color={filterConfidence === "medium" ? "warning" : "default"}
              variant={filterConfidence === "medium" ? "filled" : "outlined"}
              size="small"
            />
          </Box>
        </Box>

        {/* Grouped service results */}
        {Object.entries(grouped).map(([category, catMatches]) => (
          <Accordion
            key={category}
            defaultExpanded
            sx={{
              mb: 2,
              borderRadius: "12px !important",
              "&::before": { display: "none" },
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6" fontWeight={600}>
                {category}
              </Typography>
              <Chip
                label={catMatches.length}
                size="small"
                color="primary"
                sx={{ ml: 1.5, fontWeight: 600 }}
              />
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {catMatches.map((match) => (
                  <Grid key={match.service.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <ServiceCard
                      service={match.service}
                      matchConfidence={match.match_confidence}
                      matchScore={match.match_score}
                    />
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>
        ))}

        {filteredMatches.length === 0 && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <Typography variant="h6" color="text.secondary">
              No services match the current filters.
            </Typography>
            <Button
              sx={{ mt: 2 }}
              onClick={() => {
                setFilterCategory(null);
                setFilterConfidence(null);
              }}
            >
              Clear Filters
            </Button>
          </Box>
        )}
      </Container>

      {/* Follow-up FAB */}
      <Fab
        color="primary"
        onClick={() => setChatOpen(true)}
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 1200,
        }}
        aria-label="Ask a follow-up question"
      >
        <ChatIcon />
      </Fab>

      {/* Follow-up drawer */}
      <Drawer
        anchor="right"
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        slotProps={{
          paper: {
            sx: { width: { xs: "100%", sm: 420 } },
          },
        }}
      >
        <Box
          sx={{
            p: 3,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Ask a Follow-up
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Have questions about your results? Ask here.
          </Typography>
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography
              variant="body2"
              color="text.disabled"
              textAlign="center"
            >
              Follow-up chat connects to the same AI assistant that conducted
              your intake.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={() => setChatOpen(false)}>
            Close
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
}
