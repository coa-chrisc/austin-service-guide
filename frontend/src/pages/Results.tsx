import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { alpha, useTheme } from "@mui/material/styles";
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
import PlanItemRow from "@/components/results/PlanItemRow";
import PlanStatus, {
  PlanAnnouncer,
  type PlanStatusKind,
} from "@/components/results/PlanStatus";
import {
  fallbackOrder,
  groupByCategory,
  otherMatches,
  planSteps,
} from "@/lib/planSteps";
import {
  buildIntakePlan,
  getIntakeResults,
  getPersonas,
  shareIntakeResults,
  ApiError,
  type ApplicationOrderItem,
  type IntakeResults,
} from "@/lib/api";
import { makeResultsT } from "@/lib/resultsI18n";
import { hasSafetyCrisis } from "@/lib/crisisLines";
import CrisisLinesBlock from "@/components/common/CrisisLinesBlock";
import { useBrandConfig } from "@/hooks/useBrandConfig";
import {
  demoPersonaId,
  ensureIntakePlan,
  hasCompletedPlan,
  loadIntakeState,
  readWithIntakeState,
} from "@/lib/session";
import DemoScenarioBanner from "@/components/demo/DemoScenarioBanner";
import { canNativeShare, nativeShare } from "@/lib/share";
import type {
  Service,
  ServiceMatch,
  MatchConfidence,
  RiskFlag,
  BenefitsEstimate,
} from "@/types";
import { categoryLabel } from "@/lib/categoryLabel";

interface ResultsData {
  matches: ServiceMatch[];
  risk_flags: RiskFlag[];
  benefits_estimate: BenefitsEstimate;
  application_order: ApplicationOrderItem[];
  plan_synthesis: string;
  plan_ai_generated: boolean;
  language: string;
  /** A crisis came up in the intake: the crisis lines lead the page. */
  crisis: boolean;
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
    tint: "brand.primarySoft",
    ring: "primary.light",
  },
  high: {
    icon: <VolunteerActivismIcon />,
    tint: "brand.primarySoft",
    ring: "primary.light",
  },
  medium: {
    icon: <FavoriteBorderIcon />,
    tint: "brand.accentSoft",
    ring: "secondary.light",
  },
  low: {
    icon: <EmojiObjectsIcon />,
    tint: "brand.accentSoft",
    ring: "secondary.light",
  },
};

type ViewMode = "simple" | "all";

// Shares the intake key prefix so "Start over" clears it too.
const VIEW_KEY = "asg.intake.resultsView";

function toResultsData(res: IntakeResults): ResultsData {
  return {
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
    language: res.language ?? "en",
    crisis:
      hasSafetyCrisis(res.profile) ||
      (res.state?.conversation ?? []).some((m) => m.crisis_detected),
  };
}

export default function Results() {
  const { appName, serviceGuide } = useBrandConfig();
  const navigate = useNavigate();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  // Print is always black on white paper, whatever the screen mode.
  const printLine = alpha(theme.palette.common.black, 0.2); // theme-exempt: print output is black on white paper
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // No completed intake in this tab (fresh tab, old share link, start over).
  const [noPlan, setNoPlan] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterConfidence, setFilterConfidence] =
    useState<MatchConfidence | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareChannel, setShareChannel] = useState<"sms" | "email">("sms");
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  // Set when this plan came from the demo scenario launcher.
  const [personaId] = useState(() => demoPersonaId());
  const [personaLabel, setPersonaLabel] = useState<string | undefined>();
  const [planStatus, setPlanStatus] = useState<PlanStatusKind>("ready");
  // Announce "plan ready" only after a build the resident waited for.
  const [announceReady, setAnnounceReady] = useState(false);
  const mountedRef = useRef(true);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "simple";
    return window.sessionStorage.getItem(VIEW_KEY) === "all" ? "all" : "simple";
  });

  useEffect(() => {
    if (typeof window === "undefined" || noPlan) return;
    window.sessionStorage.setItem(VIEW_KEY, view);
  }, [view, noPlan]);

  const handlePrint = () => window.print();

  const openShareDialog = () => {
    setShareChannel("sms");
    setShareOpen(true);
  };

  // Services to share, in plan order when there is a plan.
  const sharedServices = () => {
    if (!data) return [];
    const byId = new Map(data.matches.map((m) => [m.service.id, m.service]));
    const ordered = data.application_order
      .map((item) => byId.get(item.service_id))
      .filter((svc): svc is Service => svc !== undefined);
    return ordered.length > 0 ? ordered : data.matches.map((m) => m.service);
  };

  const handleShare = async () => {
    if (!data) return;
    // There is no plan link to share: plans live only in this tab. Share
    // catalog names, phone numbers and the public service directory.
    const lines = sharedServices()
      .slice(0, 5)
      .map((svc, i) => `${i + 1}. ${svc.name}${svc.phone ? ` — ${svc.phone}` : ""}`);
    const shareText = [`My ${appName} services:`, ...lines].join("\n");

    if (canNativeShare()) {
      const result = await nativeShare({
        title: `My ${appName} plan`,
        text: shareText,
        url: `${window.location.origin}/services`,
      });
      if (result.kind === "shared" || result.kind === "cancelled") return;
      // unsupported / error → fall through to dialog
    }
    openShareDialog();
  };

  const handleShareSubmit = async () => {
    if (!data || !shareRecipient.trim()) return;
    setShareSending(true);
    try {
      const res = await shareIntakeResults({
        channel: shareChannel,
        recipient: shareRecipient.trim(),
        service_ids: sharedServices().map((svc) => svc.id),
        language: data.language,
      });
      setSnackbar(
        res.demo
          ? `${shareChannel === "sms" ? "Text" : "Email"} queued (demo mode — no real send).`
          : `${shareChannel === "sms" ? "Text" : "Email"} sent.`,
      );
      setShareOpen(false);
      setShareRecipient("");
    } catch (err) {
      setSnackbar(
        err instanceof ApiError && err.status === 422
          ? `Please check the ${shareChannel === "sms" ? "phone number" : "email address"} and try again.`
          : "Couldn't send right now. Please try again.",
      );
    } finally {
      setShareSending(false);
    }
  };

  useEffect(() => {
    if (!personaId) return;
    let cancelled = false;
    getPersonas()
      .then((res) => {
        if (!cancelled) setPersonaLabel(res.personas.find((p) => p.id === personaId)?.label);
      })
      .catch(() => undefined); // the banner reads "Sample scenario." without a name
    return () => {
      cancelled = true;
    };
  }, [personaId]);

  // Build the plan once (shared with a build the intake page already
  // started), then re-hydrate so its reasons come back translated.
  const buildPlan = (isCancelled: () => boolean) => {
    setPlanStatus("building");
    setAnnounceReady(true);
    ensureIntakePlan(buildIntakePlan)
      .then(() => readWithIntakeState(getIntakeResults))
      .then((planned) => {
        if (isCancelled()) return;
        setData(toResultsData(planned));
        setPlanStatus("ready");
      })
      .catch(() => {
        // Matches stay usable; the plan area shows a best-fit fallback.
        if (!isCancelled()) setPlanStatus("failed");
      });
  };
  const retryPlan = () => buildPlan(() => !mountedRef.current);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!hasCompletedPlan(loadIntakeState())) {
      setNoPlan(true);
      setLoading(false);
      return;
    }
    // Hydrate from this tab's intake state (catalog data, no model call),
    // then build the plan once if it hasn't been built yet. The read skips
    // the request queue so matches show at once, even while a plan build
    // started on the intake page is still running.
    readWithIntakeState(getIntakeResults)
      .then((res) => {
        if (cancelled) return;
        setData(toResultsData(res));
        setLoading(false);
        if (res.plan_pending) buildPlan(() => cancelled);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 422) {
          setNoPlan(true); // stored state no longer matches the server schema
        } else {
          setError(err.message || "Failed to load results");
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const t = makeResultsT(data?.language ?? "en");

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton
          variant="rounded"
          height={120}
          sx={{ mb: 3, borderRadius: (theme) => theme.shape.radius.card }}
        />
        <Skeleton
          variant="rounded"
          height={60}
          sx={{ mb: 2, borderRadius: (theme) => theme.shape.radius.card }}
        />
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <Skeleton
                variant="rounded"
                height={200}
                sx={{ borderRadius: (theme) => theme.shape.radius.card }}
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
        <Alert severity={noPlan ? "info" : "error"}>
          {noPlan ? t("no_plan_here") : error || t("failed_to_load")}
        </Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate("/intake")}>
          {t("start_new_intake")}
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

  const benefits = data.benefits_estimate;
  // Estimates are rough rule-of-thumb figures: shown only when the city
  // config opts in (serviceGuide.showBenefitEstimates).
  const hasBenefits =
    serviceGuide.showBenefitEstimates &&
    (benefits.total_monthly_value > 0 || benefits.breakdown.length > 0);

  // The ordered steps shown first: the plan, or a best-fit order when the
  // plan request itself failed. Everything else sits under "More services".
  const shownOrder =
    data.application_order.length > 0
      ? data.application_order
      : planStatus === "failed"
        ? fallbackOrder(matches)
        : [];
  const steps = planSteps(shownOrder);
  const topItem = steps[0]; // used by the hero and the sticky bar
  // All-matches view: the matches beyond the steps, collapsed by category.
  // A filter searches every match, steps included, and opens its results.
  const filtersActive = !!filterCategory || !!filterConfidence;
  const browseList = filtersActive
    ? filteredMatches
    : otherMatches(filteredMatches, steps);
  const browseGroups = groupByCategory(browseList);
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
          body { background: ${theme.palette.common.white} !important; /* theme-exempt: print output is black on white paper */ }
          header, nav, .no-print, .MuiDrawer-root, .MuiDialog-root,
          .MuiSnackbar-root, .MuiFab-root { display: none !important; }
          .results-root .MuiCollapse-root { height: auto !important; visibility: visible !important; }
          .results-root .MuiAccordion-root { break-inside: avoid; box-shadow: none !important; border: 1px solid ${printLine} !important; }
          .results-root .MuiAccordionDetails-root .MuiGrid-root { display: block !important; }
          .results-root .MuiAccordionDetails-root .MuiGrid-root > .MuiGrid-root { max-width: 100% !important; flex-basis: 100% !important; padding: 4px 0 !important; break-inside: avoid; }
          .results-root .MuiCard-root { break-inside: avoid; box-shadow: none !important; border: 1px solid ${printLine} !important; background: ${theme.palette.common.white} !important; color: ${theme.palette.common.black} !important; /* theme-exempt: print output is black on white paper */ }
          .results-root [class*="MuiCardContent-root"] { color: ${theme.palette.common.black} !important; /* theme-exempt: print output is black on white paper */ }
        }
      `}</style>
      <PlanAnnouncer
        status={planStatus}
        announceReady={announceReady}
        language={data.language}
      />
      {personaId && (
        <Box className="no-print">
          <DemoScenarioBanner
            dense
            label={personaLabel}
            message="This plan was built from a scripted profile."
          />
        </Box>
      )}
      <Container maxWidth="lg" sx={{ py: { xs: 2.5, sm: 4 } }}>
        {/* Crisis lines lead both views when a crisis came up. */}
        {data.crisis && (
          <CrisisLinesBlock
            sx={{ mb: { xs: 2, sm: 3 } }}
            labels={{
              heading: t("crisis_heading"),
              intro: t("crisis_intro"),
              text988: t("crisis_text_988"),
            }}
          />
        )}
        {/* Page title (simple view; the all-matches card has its own) + view toggle */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: view === "simple" ? "space-between" : "flex-end",
            gap: 2,
            mb: { xs: 2, sm: 3 },
          }}
        >
          {view === "simple" && (
            <Typography
              variant="h4"
              component="h1"
              sx={{ fontSize: { xs: "1.75rem", sm: "2.125rem" } }}
            >
              {t("my_plan")}
            </Typography>
          )}
          <ToggleButtonGroup
            value={view}
            exclusive
            size="small"
            className="no-print"
            onChange={(_, v) => v && setView(v)}
            sx={{
              flexShrink: 0,
              "& .MuiToggleButton-root": { px: 2 },
            }}
          >
            <ToggleButton value="simple">{t("my_plan")}</ToggleButton>
            <ToggleButton value="all">{t("all_matches")}</ToggleButton>
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
                  px: 2.5,
                  py: 2,
                  borderRadius: (theme) => theme.shape.radius.card,
                  bgcolor: (theme) => alpha(theme.palette.success.main, 0.12),
                  border: "1px solid",
                  borderColor: "success.light",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <CheckCircleIcon color="success" />
                <Typography variant="body1">
                  {t("qualify_prefix")}{" "}
                  <Box component="span" sx={{ fontWeight: 800 }}>
                    {formatCurrency(benefits.total_monthly_value)}
                    {t("per_month")}
                  </Box>{" "}
                  {t("qualify_suffix")}
                </Typography>
              </Box>
            )}

            {/* Critical risk only — calm, supportive framing */}
            {criticalRiskFlag && (
              <Card
                variant="outlined"
                sx={{
                  mb: 2.5,
                  bgcolor: "brand.primarySoft",
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
                    <Typography variant="subtitle2" component="h2" fontWeight={700}>
                      {criticalRiskFlag.label ?? criticalRiskFlag.risk_type}
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

            {planStatus === "building" ? (
              <PlanStatus
                status="building"
                language={data.language}
                onRetry={retryPlan}
                onShowAll={() => setView("all")}
              />
            ) : topItem ? (
              <>
                {planStatus === "failed" && (
                  <PlanStatus status="failed" language={data.language} onRetry={retryPlan} />
                )}
                {data.plan_synthesis && (
                  <Box
                    sx={{
                      mb: 2.5,
                      px: 2.5,
                      py: 2,
                      borderRadius: (theme) => theme.shape.radius.card,
                      bgcolor: "brand.primarySoft",
                      border: "1px solid",
                      borderColor: "primary.light",
                    }}
                  >
                    <Typography
                      variant="overline"
                      sx={{
                        display: "block",
                        color: "brand.inkText",
                        mb: 0.5,
                      }}
                    >
                      {t("why_this_order")}
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
                  items={shownOrder}
                  matches={matches}
                  fromPlan
                  language={data.language}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    mt: 3,
                    textAlign: "center",
                  }}
                >
                  {data.plan_ai_generated
                    ? t("ai_suggested_footer") + " "
                    : t("suggested_footer") + " "}
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
                    {t("see_all_matches")}
                  </Box>{" "}
                  {t("see_all_matches_suffix")}
                </Typography>
                <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }} className="no-print">
                  <Button
                    variant="outlined"
                    startIcon={<MapIcon />}
                    onClick={() => navigate("/map?plan=1")}
                    sx={{ textTransform: "none", fontWeight: 600 }}
                  >
                    {t("see_plan_on_map")}
                  </Button>
                </Box>
              </>
            ) : (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  {t("no_matches")}
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => navigate("/intake")}
                >
                  {t("start_new_intake")}
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
                // primary to ink, not to accent: text over the accent end cannot reach AA.
                background: (theme) =>
                  `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                color: "primary.contrastText",
              }}
            >
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
                  {t("we_found_prefix")} {matches.length}{" "}
                  {matches.length !== 1 ? t("services") : t("service")}{" "}
                  {t("we_found_suffix")}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ opacity: 0.9, maxWidth: 700, lineHeight: 1.7 }}
                >
                  {t("based_on_conversation_prefix")} {categories.length}{" "}
                  {t("based_on_conversation_suffix")}
                </Typography>

                {/* Benefits hero band */}
                {hasBenefits && (
                  <Box
                    sx={{
                      mt: 3,
                      p: 2.5,
                      borderRadius: (theme) => theme.shape.radius.control,
                      bgcolor: (theme) => alpha(theme.palette.brand.ink, 0.25),
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
                        {t("estimated_value")}
                      </Typography>
                      <Typography
                        variant="h3"
                        component="p"
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
                        {t("per_year_prefix")}{" "}
                        {formatCurrency(benefits.total_annual_value)}{" "}
                        {t("per_year_suffix")}
                      </Typography>
                    </Box>
                    {benefits.breakdown.length > 0 && (
                      <Box sx={{ flex: 1, minWidth: 240 }}>
                        <Typography
                          variant="caption"
                          sx={{ opacity: 0.85, display: "block", mb: 0.75 }}
                        >
                          {t("top_contributors")}
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
                              label={`${b.service} · ${formatCurrency(b.monthly_value)}${t("per_month")}`}
                              sx={{
                                bgcolor: (theme) =>
                                  alpha(theme.palette.primary.contrastText, 0.18),
                                color: "primary.contrastText",
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
                    onClick={() => navigate("/map?plan=1")}
                    sx={{
                      bgcolor: (theme) =>
                        alpha(theme.palette.primary.contrastText, 0.2),
                      color: "primary.contrastText",
                      "&:hover": {
                        bgcolor: (theme) =>
                          alpha(theme.palette.primary.contrastText, 0.3),
                      },
                    }}
                  >
                    {t("view_on_map")}
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<PrintIcon />}
                    onClick={handlePrint}
                    sx={{
                      bgcolor: (theme) =>
                        alpha(theme.palette.primary.contrastText, 0.2),
                      color: "primary.contrastText",
                      "&:hover": {
                        bgcolor: (theme) =>
                          alpha(theme.palette.primary.contrastText, 0.3),
                      },
                    }}
                  >
                    {t("save_as_pdf")}
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<ShareIcon />}
                    onClick={handleShare}
                    sx={{
                      bgcolor: (theme) =>
                        alpha(theme.palette.primary.contrastText, 0.2),
                      color: "primary.contrastText",
                      "&:hover": {
                        bgcolor: (theme) =>
                          alpha(theme.palette.primary.contrastText, 0.3),
                      },
                    }}
                  >
                    {t("send_to_me")}
                  </Button>
                </Box>
              </CardContent>
            </Card>

            {/* Start here — the plan steps (or its build status) */}
            {planStatus !== "ready" && (
              <PlanStatus
                status={planStatus}
                compact
                language={data.language}
                onRetry={retryPlan}
              />
            )}
            {steps.length > 0 && (
              <Card
                sx={{
                  mb: 4,
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
                    <Typography variant="h6" component="h2" fontWeight={700}>
                      {t("start_here")}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t("suggested_order_caption")}
                    </Typography>
                  </Box>
                  <Stack component="ol" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
                    {steps.map((item, idx) => (
                      <li key={item.service_id}>
                        <PlanItemRow item={item} rank={idx + 1} fromPlan />
                      </li>
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
                  component="h2"
                  fontWeight={600}
                  gutterBottom
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <VolunteerActivismIcon color="primary" />
                  {t("areas_we_can_help")}
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
                                  component="h3"
                                  fontWeight={700}
                                >
                                  {flag.label ?? flag.risk_type}
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
                component="p"
                color="text.secondary"
                sx={{ mb: 1 }}
              >
                {t("filter_by")}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                <Chip
                  label={t("all")}
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
                    label={categoryLabel(cat)}
                    onClick={() =>
                      setFilterCategory(filterCategory === cat ? null : cat)
                    }
                    color={filterCategory === cat ? "primary" : "default"}
                    variant={filterCategory === cat ? "filled" : "outlined"}
                    size="small"
                  />
                ))}
                <Chip
                  label={t("strong_match")}
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
                  label={t("likely_match")}
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
                    label={t("clear_filter")}
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

            {/* Grouped service results: the matches beyond the steps */}
            {browseList.length > 0 && (
              <Typography variant="h5" component="h2" fontWeight={600} sx={{ mb: 2 }}>
                {steps.length > 0 && !filtersActive
                  ? t("more_services", { n: browseList.length })
                  : t("your_matches", { n: browseList.length })}
              </Typography>
            )}
            {browseGroups.map(([category, catMatches]) => (
              <Accordion
                // Collapsed to keep the page short; a filter opens its results.
                key={`${category}-${filterCategory ?? ""}-${filterConfidence ?? ""}`}
                defaultExpanded={filtersActive}
                sx={{
                  mb: 2,
                  boxShadow: (theme) => `0 1px 3px ${alpha(theme.palette.brand.ink, 0.08)}`,
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6" component="span" fontWeight={600}>
                    {categoryLabel(category)}
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
                          fromPlan
                        />
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}

            {filteredMatches.length === 0 && (
              <Box sx={{ textAlign: "center", py: 6 }}>
                <Typography variant="h6" component="p" color="text.secondary">
                  {t("no_services_match")}
                </Typography>
                <Button
                  sx={{ mt: 2 }}
                  onClick={() => {
                    setFilterCategory(null);
                    setFilterConfidence(null);
                  }}
                >
                  {t("clear_filters")}
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
          }}
        >
          {/* Keep the pair a thumb-width wide on desktop instead of spanning the window. */}
          <Box sx={{ display: "flex", gap: 1, maxWidth: 560, mx: "auto" }}>
            {topPhone && (
              <Button
                variant="contained"
                color="primary"
                size="large"
                fullWidth
                startIcon={<PhoneIcon />}
                href={`tel:${topPhone}`}
                sx={{ fontWeight: 700 }}
              >
                {t("call")}
              </Button>
            )}
            <Button
              variant="outlined"
              size="large"
              fullWidth
              startIcon={<ShareIcon />}
              onClick={handleShare}
            >
              {t("send_to_me")}
            </Button>
          </Box>
        </Paper>
      )}

      {/* Follow-up FAB — hide on phone in simple view (sticky bar takes its place) */}
      <Fab
        color="primary"
        className="no-print"
        onClick={() => setChatOpen(true)}
        sx={{
          position: "fixed",
          // Sit above the sticky action bar when it is showing.
          bottom: view === "simple" && topItem ? 88 : 24,
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
          <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
            {t("ask_followup")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("ask_followup_intro")}
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
              {t("followup_chat_note")}
            </Typography>
          </Box>
          <Button variant="outlined" onClick={() => setChatOpen(false)}>
            {t("close")}
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
        <DialogTitle>{t("send_your_plan")}</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <Typography variant="body2" color="text.secondary">
            {t("share_intro")}
          </Typography>
          <ToggleButtonGroup
            value={shareChannel}
            exclusive
            onChange={(_, v) => v && setShareChannel(v)}
            fullWidth
            size="small"
          >
            <ToggleButton value="sms">
              <SmsIcon fontSize="small" sx={{ mr: 1 }} /> {t("text_message")}
            </ToggleButton>
            <ToggleButton value="email">
              <EmailIcon fontSize="small" sx={{ mr: 1 }} /> {t("email")}
            </ToggleButton>
          </ToggleButtonGroup>
          <TextField
            autoFocus
            fullWidth
            size="small"
            type={shareChannel === "email" ? "email" : "tel"}
            label={
              shareChannel === "sms" ? t("phone_number") : t("email_address")
            }
            placeholder={
              shareChannel === "sms" ? "555-0100" : "you@example.com"
            }
            value={shareRecipient}
            onChange={(e) => setShareRecipient(e.target.value)}
            helperText={shareChannel === "sms" ? t("phone_helper") : ""}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>{t("cancel")}</Button>
          <Button
            variant="contained"
            onClick={handleShareSubmit}
            disabled={shareSending || !shareRecipient.trim()}
          >
            {shareSending ? t("sending") : t("send")}
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
