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
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import MapIcon from "@mui/icons-material/Map";
import PhoneIcon from "@mui/icons-material/Phone";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChatIcon from "@mui/icons-material/Chat";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EmojiObjectsIcon from "@mui/icons-material/EmojiObjects";
import VolunteerActivismIcon from "@mui/icons-material/VolunteerActivism";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import ShareIcon from "@mui/icons-material/Share";
import SmsIcon from "@mui/icons-material/Sms";
import EmailIcon from "@mui/icons-material/Email";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import ServiceCard from "@/components/services/ServiceCard";
import PlanList from "@/components/results/PlanList";
import {
  getIntakeResults,
  shareIntakeResults,
  type ApplicationOrderItem,
} from "@/lib/api";
import { setActiveSession } from "@/lib/session";
import { canNativeShare, nativeShare } from "@/lib/share";
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
  application_order: ApplicationOrderItem[];
  plan_synthesis: string;
  plan_ai_generated: boolean;
}

const formatCurrency = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

// Risk flags read as "things we noticed and can help with" — the resident
// already knows their situation is hard. Iconography stays warm: helping
// hands, support agent, lightbulb, heart. Severity drives icon choice but
// not alarm color (no red/yellow alerts in the dense view).
const RISK_VISUAL: Record<
  string,
  { icon: React.ReactNode; tint: string; ring: string }
> = {
  critical: {
    icon: <SupportAgentIcon />,
    tint: "primary.50",
    ring: "primary.light",
  },
  high: {
    icon: <VolunteerActivismIcon />,
    tint: "primary.50",
    ring: "primary.light",
  },
  medium: {
    icon: <FavoriteBorderIcon />,
    tint: "secondary.50",
    ring: "secondary.light",
  },
  low: {
    icon: <EmojiObjectsIcon />,
    tint: "secondary.50",
    ring: "secondary.light",
  },
};

type ViewMode = "simple" | "all";

const VIEW_KEY_PREFIX = "asg.results.view.";

export default function Results() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterConfidence, setFilterConfidence] =
    useState<MatchConfidence | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareChannel, setShareChannel] = useState<"sms" | "email">("sms");
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined" || !sessionId) return "simple";
    const stored = window.sessionStorage.getItem(VIEW_KEY_PREFIX + sessionId);
    return stored === "all" ? "all" : "simple";
  });

  useEffect(() => {
    if (typeof window === "undefined" || !sessionId) return;
    window.sessionStorage.setItem(VIEW_KEY_PREFIX + sessionId, view);
  }, [view, sessionId]);

  const handlePrint = () => window.print();

  const openShareDialog = () => {
    setShareChannel("sms");
    setShareOpen(true);
  };

  const handleShare = async () => {
    if (!sessionId) return;
    const url = `${window.location.origin}/results/${sessionId}`;
    const matchCount = data?.matches.length ?? 0;
    const text =
      matchCount > 0
        ? `My Austin Service Guide plan — ${matchCount} matched service${matchCount !== 1 ? "s" : ""}.`
        : "My Austin Service Guide plan.";

    if (canNativeShare()) {
      const result = await nativeShare({
        title: "My Austin Service Guide plan",
        text,
        url,
      });
      if (result.kind === "shared" || result.kind === "cancelled") return;
      // unsupported / error → fall through to dialog
    }
    openShareDialog();
  };

  const handleShareSubmit = async () => {
    if (!sessionId || !shareRecipient.trim()) return;
    setShareSending(true);
    try {
      const res = await shareIntakeResults(sessionId, {
        channel: shareChannel,
        recipient: shareRecipient.trim(),
      });
      setSnackbar(
        res.demo
          ? `${shareChannel === "sms" ? "Text" : "Email"} queued (demo mode — no real send).`
          : `${shareChannel === "sms" ? "Text" : "Email"} sent to ${res.to}.`,
      );
      setShareOpen(false);
      setShareRecipient("");
    } catch (err) {
      setSnackbar(
        `Failed to send: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setShareSending(false);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    getIntakeResults(sessionId)
      .then((res) => {
        setActiveSession(sessionId);
        setData({
          matches: res.matches ?? [],
          risk_flags: res.risk_flags ?? [],
          benefits_estimate: res.benefits_estimate ?? {
            total_monthly_value: 0,
            total_annual_value: 0,
            breakdown: [],
          },
          application_order: res.application_order ?? [],
          plan_synthesis: res.plan_synthesis ?? "",
          plan_ai_generated: res.plan_ai_generated ?? false,
        });
      })
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

  const benefits = data.benefits_estimate;
  const hasBenefits =
    benefits.total_monthly_value > 0 || benefits.breakdown.length > 0;

  // Find rank-1 service from sequencing — used by hero + sticky bar
  const topItem = data.application_order[0];
  const topMatch = topItem
    ? matches.find((m) => m.service.id === topItem.service_id)
    : undefined;
  const criticalRiskFlag = data.risk_flags.find(
    (f) => f.severity === "critical",
  );
  const topPhone = topMatch?.service.phone?.replace(/[^\d+]/g, "") ?? "";

  return (
    <Box sx={{ pb: 10 }} className="results-root">
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { background: white !important; }
          header, nav, .no-print, .MuiDrawer-root, .MuiDialog-root,
          .MuiSnackbar-root, .MuiFab-root { display: none !important; }
          .results-root .MuiAccordion-root { break-inside: avoid; box-shadow: none !important; border: 1px solid #ddd !important; }
          .results-root .MuiAccordionDetails-root .MuiGrid-root { display: block !important; }
          .results-root .MuiAccordionDetails-root .MuiGrid-root > .MuiGrid-root { max-width: 100% !important; flex-basis: 100% !important; padding: 4px 0 !important; break-inside: avoid; }
          .results-root .MuiCard-root { break-inside: avoid; box-shadow: none !important; border: 1px solid #ccc !important; background: white !important; color: #111 !important; }
          .results-root [class*="MuiCardContent-root"] { color: #111 !important; }
        }
      `}</style>
      <Container maxWidth="lg" sx={{ py: { xs: 2.5, sm: 4 } }}>
        {/* View toggle */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mb: 2,
          }}
          className="no-print"
        >
          <ToggleButtonGroup
            value={view}
            exclusive
            size="small"
            onChange={(_, v) => v && setView(v)}
            sx={{
              "& .MuiToggleButton-root": {
                textTransform: "none",
                fontWeight: 600,
                px: 2,
              },
            }}
          >
            <ToggleButton value="simple">My plan</ToggleButton>
            <ToggleButton value="all">All matches</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* ───────────── Simple view ───────────── */}
        {view === "simple" && (
          <>
            {/* One-line benefits estimate */}
            {hasBenefits && (
              <Box
                sx={{
                  mb: 2.5,
                  p: 2,
                  borderRadius: 2,
                  bgcolor: "success.50",
                  border: "1px solid",
                  borderColor: "success.light",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <CheckCircleIcon color="success" />
                <Typography variant="body1" sx={{ fontSize: "1rem" }}>
                  You may qualify for about{" "}
                  <Box component="span" sx={{ fontWeight: 800 }}>
                    {formatCurrency(benefits.total_monthly_value)}/month
                  </Box>{" "}
                  in support.
                </Typography>
              </Box>
            )}

            {/* Critical risk only — calm, supportive framing */}
            {criticalRiskFlag && (
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  mb: 2.5,
                  bgcolor: "primary.50",
                  borderColor: "primary.light",
                }}
              >
                <CardContent
                  sx={{
                    p: 2,
                    display: "flex",
                    gap: 1.5,
                    "&:last-child": { pb: 2 },
                  }}
                >
                  <SupportAgentIcon
                    color="primary"
                    sx={{ mt: 0.25, flexShrink: 0 }}
                  />
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {criticalRiskFlag.risk_type}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.5, lineHeight: 1.5 }}
                    >
                      {criticalRiskFlag.description}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            )}

            {topItem ? (
              <>
                {data.plan_synthesis && (
                  <Box
                    sx={{
                      mb: 2,
                      p: 2,
                      borderRadius: 2,
                      bgcolor: "primary.50",
                      border: "1px solid",
                      borderColor: "primary.light",
                    }}
                  >
                    <Typography
                      variant="overline"
                      sx={{
                        display: "block",
                        fontWeight: 700,
                        color: "primary.dark",
                        mb: 0.5,
                        letterSpacing: 0.5,
                      }}
                    >
                      Why this order
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "text.primary", lineHeight: 1.55 }}
                    >
                      {data.plan_synthesis}
                    </Typography>
                  </Box>
                )}
                <PlanList
                  items={data.application_order}
                  matches={matches}
                  sessionId={sessionId}
                  onShowAll={() => setView("all")}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    mt: 2,
                    px: 0.5,
                    lineHeight: 1.5,
                  }}
                >
                  {data.plan_ai_generated
                    ? "AI-suggested order based on what you shared. Double-check eligibility and hours before you go. "
                    : "Suggested order based on what you shared. Double-check eligibility and hours before you go. "}
                  <Box
                    component="a"
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      setView("all");
                    }}
                    sx={{
                      color: "primary.main",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    See all matches
                  </Box>{" "}
                  if you'd rather pick your own.
                </Typography>
              </>
            ) : (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  We couldn't find any matches yet.
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => navigate("/intake")}
                >
                  Start a new intake
                </Button>
              </Box>
            )}
          </>
        )}

        {/* ───────────── Dense (all) view ───────────── */}
        {view === "all" && (
          <>
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
                  We found {matches.length} service
                  {matches.length !== 1 ? "s" : ""} you may be eligible for
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ opacity: 0.9, maxWidth: 700, lineHeight: 1.7 }}
                >
                  Based on our conversation, we've matched you with services
                  across {categories.length} categories. Review each one below
                  to see eligibility details, documents needed, and how to
                  apply.
                </Typography>

                {/* Benefits hero band */}
                {hasBenefits && (
                  <Box
                    sx={{
                      mt: 3,
                      p: 2.5,
                      borderRadius: 2,
                      bgcolor: "rgba(0,0,0,0.18)",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <Box sx={{ minWidth: 220 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          opacity: 0.85,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                        }}
                      >
                        Estimated value to you
                      </Typography>
                      <Typography
                        variant="h3"
                        fontWeight={800}
                        sx={{ lineHeight: 1.1, mt: 0.5 }}
                      >
                        {formatCurrency(benefits.total_monthly_value)}
                        <Typography
                          component="span"
                          variant="body1"
                          sx={{ opacity: 0.85, fontWeight: 500, ml: 0.5 }}
                        >
                          /mo
                        </Typography>
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ opacity: 0.85, mt: 0.25 }}
                      >
                        ≈ {formatCurrency(benefits.total_annual_value)} per year
                      </Typography>
                    </Box>
                    {benefits.breakdown.length > 0 && (
                      <Box sx={{ flex: 1, minWidth: 240 }}>
                        <Typography
                          variant="caption"
                          sx={{ opacity: 0.85, display: "block", mb: 0.75 }}
                        >
                          Top contributors
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          flexWrap="wrap"
                          useFlexGap
                        >
                          {benefits.breakdown.slice(0, 5).map((b, i) => (
                            <Chip
                              key={i}
                              size="small"
                              label={`${b.service} · ${formatCurrency(b.monthly_value)}/mo`}
                              sx={{
                                bgcolor: "rgba(255,255,255,0.18)",
                                color: "white",
                                fontWeight: 500,
                              }}
                            />
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Box>
                )}

                <Box
                  sx={{ display: "flex", gap: 1.5, mt: 3, flexWrap: "wrap" }}
                  className="no-print"
                >
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
                    startIcon={<PrintIcon />}
                    onClick={handlePrint}
                    sx={{
                      bgcolor: "rgba(255,255,255,0.2)",
                      color: "white",
                      "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
                    }}
                  >
                    Save as PDF
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<ShareIcon />}
                    onClick={handleShare}
                    sx={{
                      bgcolor: "rgba(255,255,255,0.2)",
                      color: "white",
                      "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
                    }}
                  >
                    Send to me
                  </Button>
                </Box>
              </CardContent>
            </Card>

            {/* Start here — sequencing */}
            {data.application_order.length > 0 && (
              <Card
                sx={{
                  mb: 4,
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "primary.light",
                }}
              >
                <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 1.5,
                    }}
                  >
                    <RocketLaunchIcon color="primary" />
                    <Typography variant="h6" fontWeight={700}>
                      Start here
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      · suggested order based on what's most urgent
                    </Typography>
                  </Box>
                  <Stack spacing={1.25}>
                    {data.application_order.slice(0, 3).map((item) => (
                      <Box
                        key={item.service_id}
                        sx={{
                          display: "flex",
                          gap: 1.5,
                          alignItems: "flex-start",
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: "primary.50",
                          cursor: "pointer",
                          transition: "background 0.15s",
                          "&:hover": { bgcolor: "primary.100" },
                        }}
                        onClick={() =>
                          navigate(`/services/${item.service_slug}`)
                        }
                      >
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            bgcolor: "primary.main",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {item.rank}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {item.service_name}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.25 }}
                          >
                            {item.reason}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* Risk flags — framed as "Areas Where We Can Help" */}
            {data.risk_flags.length > 0 && (
              <Box sx={{ mb: 4 }}>
                <Typography
                  variant="h5"
                  fontWeight={600}
                  gutterBottom
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <VolunteerActivismIcon color="primary" />
                  Areas Where We Can Help
                </Typography>
                <Grid container spacing={2}>
                  {data.risk_flags.map((flag: RiskFlag, idx: number) => {
                    const visual =
                      RISK_VISUAL[flag.severity] || RISK_VISUAL.low;
                    return (
                      <Grid key={idx} size={{ xs: 12, md: 6 }}>
                        <Card
                          variant="outlined"
                          sx={{
                            borderRadius: 2,
                            height: "100%",
                            bgcolor: visual.tint,
                            borderColor: visual.ring,
                          }}
                        >
                          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                            <Box sx={{ display: "flex", gap: 1.5 }}>
                              <Box
                                sx={{
                                  color: "primary.main",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  pt: 0.25,
                                }}
                              >
                                {visual.icon}
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                  variant="subtitle2"
                                  fontWeight={700}
                                >
                                  {flag.risk_type}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ mt: 0.5, lineHeight: 1.5 }}
                                >
                                  {flag.description}
                                </Typography>
                                {flag.prevention_services.length > 0 && (
                                  <Box
                                    sx={{
                                      display: "flex",
                                      gap: 0.5,
                                      flexWrap: "wrap",
                                      mt: 1.25,
                                    }}
                                  >
                                    {flag.prevention_services.map((s) => (
                                      <Chip
                                        key={s}
                                        label={s}
                                        size="small"
                                        variant="outlined"
                                        sx={{
                                          fontSize: 11,
                                          bgcolor: "background.paper",
                                        }}
                                      />
                                    ))}
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>
            )}

            {/* Filter chips */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 1 }}
              >
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
                    setFilterConfidence(
                      filterConfidence === "high" ? null : "high",
                    )
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
                  variant={
                    filterConfidence === "medium" ? "filled" : "outlined"
                  }
                  size="small"
                />
                {(filterCategory || filterConfidence) && (
                  <Chip
                    label="Clear filter"
                    icon={<CloseIcon style={{ fontSize: 14 }} />}
                    onClick={() => {
                      setFilterCategory(null);
                      setFilterConfidence(null);
                    }}
                    size="small"
                    sx={{
                      ml: 0.5,
                      fontWeight: 600,
                      color: "text.secondary",
                    }}
                  />
                )}
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
                      <Grid
                        key={match.service.id}
                        size={{ xs: 12, sm: 12, md: 6 }}
                      >
                        <ServiceCard
                          service={match.service}
                          matchConfidence={match.match_confidence}
                          fromSessionId={sessionId}
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
          </>
        )}
      </Container>

      {/* Sticky bottom action bar — simple view only */}
      {view === "simple" && topItem && (
        <Paper
          elevation={8}
          className="no-print"
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1100,
            borderRadius: 0,
            borderTop: "1px solid",
            borderColor: "divider",
            pt: 1,
            pb: "calc(8px + env(safe-area-inset-bottom, 0px))",
            px: 1,
            display: "flex",
            gap: 1,
          }}
        >
          {topPhone && (
            <Button
              variant="contained"
              color="primary"
              fullWidth
              startIcon={<PhoneIcon />}
              href={`tel:${topPhone}`}
              sx={{ minHeight: 48, fontWeight: 700, borderRadius: "24px" }}
            >
              Call
            </Button>
          )}
          <Button
            variant="outlined"
            fullWidth
            startIcon={<ShareIcon />}
            onClick={handleShare}
            sx={{ minHeight: 48, fontWeight: 600, borderRadius: "24px" }}
          >
            Send to me
          </Button>
        </Paper>
      )}

      {/* Follow-up FAB — hide on phone in simple view (sticky bar takes its place) */}
      <Fab
        color="primary"
        className="no-print"
        onClick={() => setChatOpen(true)}
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: view === "simple" ? { xs: "none", md: "flex" } : "flex",
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

      {/* Share dialog */}
      <Dialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        maxWidth="xs"
        fullWidth
        fullScreen={isPhone}
        className="no-print"
      >
        <DialogTitle>Send your plan</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <Typography variant="body2" color="text.secondary">
            We'll send you a list of your matched services with phone numbers
            and links you can save or share.
          </Typography>
          <ToggleButtonGroup
            value={shareChannel}
            exclusive
            onChange={(_, v) => v && setShareChannel(v)}
            fullWidth
            size="small"
          >
            <ToggleButton value="sms">
              <SmsIcon fontSize="small" sx={{ mr: 1 }} /> Text message
            </ToggleButton>
            <ToggleButton value="email">
              <EmailIcon fontSize="small" sx={{ mr: 1 }} /> Email
            </ToggleButton>
          </ToggleButtonGroup>
          <TextField
            autoFocus
            fullWidth
            size="small"
            type={shareChannel === "email" ? "email" : "tel"}
            label={shareChannel === "sms" ? "Phone number" : "Email address"}
            placeholder={
              shareChannel === "sms" ? "+1 512 555 1234" : "you@example.com"
            }
            value={shareRecipient}
            onChange={(e) => setShareRecipient(e.target.value)}
            helperText={
              shareChannel === "sms"
                ? "Include country code, e.g. +15125551234"
                : ""
            }
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: -0.5 }}
          >
            Want to keep your plan across devices?{" "}
            <Box
              component="a"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                setShareOpen(false);
                navigate(
                  `/login?return=${encodeURIComponent(
                    `/results/${sessionId ?? ""}`,
                  )}`,
                );
              }}
              sx={{
                color: "primary.main",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Sign in
            </Box>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleShareSubmit}
            disabled={shareSending || !shareRecipient.trim()}
          >
            {shareSending ? "Sending…" : "Send"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        message={snackbar ?? ""}
        sx={{
          // Lift above the sticky action bar in simple view (the bar is
          // ~64px tall after safe-area inset).
          bottom: {
            xs: view === "simple" && topItem ? 88 : 24,
            sm: 24,
          },
        }}
      />
    </Box>
  );
}
