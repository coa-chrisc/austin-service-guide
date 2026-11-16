import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import ServiceDetailCard from "@/components/services/ServiceDetailCard";
import ServiceMap from "@/components/map/ServiceMap";
import { getServiceBySlug } from "@/lib/api";
import { loadIntakeState } from "@/lib/session";
import { planNavigation } from "@/lib/planSteps";
import { makeResultsT } from "@/lib/resultsI18n";
import type { Service, MapPin } from "@/types";

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromPlan = searchParams.get("plan") === "1";

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Set when the resident moved with prev/next, so focus can follow.
  const stepNavRef = useRef(false);
  const stepLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    getServiceBySlug(slug)
      .then(setService)
      .catch((err) => setError(err.message || "Service not found"))
      .finally(() => setLoading(false));
  }, [slug]);

  // Plan context from this tab's intake state when opened from the plan
  // (?plan=1): a plan step steps through the plan's few ordered steps only
  // ("Step 2 of 5"); any other match just links back to the plan.
  const intakeState = useMemo(() => (fromPlan ? loadIntakeState() : null), [fromPlan]);
  const planNav = useMemo(
    () => (slug && service ? planNavigation(intakeState, slug, service.id) : null),
    [intakeState, slug, service],
  );
  const t = makeResultsT(intakeState?.language);

  // After prev/next, the page re-renders with the new service: move focus to
  // the step label so keyboard and screen-reader users hear "Step 3 of 5".
  useEffect(() => {
    if (!loading && service?.slug === slug && stepNavRef.current) {
      stepNavRef.current = false;
      stepLabelRef.current?.focus();
    }
  }, [loading, service, slug]);

  const goToStep = (target: string | null) => {
    if (!target) return;
    stepNavRef.current = true;
    navigate(`/services/${target}?plan=1`);
  };

  const inPlanContext = !!planNav;
  const step = planNav?.kind === "step" ? planNav : null;

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error || !service) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: "center" }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || "Service not found"}
        </Alert>
        <Button onClick={() => navigate("/services")}>Browse Services</Button>
      </Container>
    );
  }

  const mapPins: MapPin[] = service.locations
    .filter((loc) => loc.latitude !== 0 && loc.longitude !== 0)
    .map((loc) => ({
      id: loc.id,
      service_id: service.slug,
      name: `${service.name} — ${loc.name}`,
      category: service.categories[0] || "Other",
      latitude: loc.latitude,
      longitude: loc.longitude,
    }));

  return (
    <>
      {/* Sticky plan breadcrumb — only when reached from a plan */}
      {inPlanContext && (
        <Paper
          elevation={0}
          sx={{
            position: "sticky",
            top: { xs: 56, sm: 64 },
            zIndex: 1050,
            borderRadius: 0,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "brand.primarySoft",
          }}
        >
          <Container maxWidth="lg">
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                py: 1,
              }}
            >
              <Button
                size="small"
                startIcon={<AssignmentTurnedInIcon />}
                onClick={() => navigate("/results")}
                sx={{
                  fontWeight: 700,
                  textTransform: "none",
                  color: "primary.main",
                  whiteSpace: "nowrap",
                }}
              >
                {t("back_to_my_plan")}
              </Button>
              <Typography
                ref={stepLabelRef}
                component="span"
                tabIndex={-1}
                variant="body2"
                color="text.primary"
                sx={{
                  flex: 1,
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: { xs: 14, sm: 15 },
                  outline: "none",
                }}
              >
                {step
                  ? t("step_n_of_total", { i: step.index + 1, total: step.total })
                  : t("other_match")}
              </Typography>
              {step && (
                <>
                  <IconButton
                    size="small"
                    disabled={!step.prevSlug}
                    onClick={() => goToStep(step.prevSlug)}
                    aria-label={t("previous_step")}
                    sx={{ minWidth: 44, minHeight: 44 }}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={!step.nextSlug}
                    onClick={() => goToStep(step.nextSlug)}
                    aria-label={t("next_step")}
                    sx={{ minWidth: 44, minHeight: 44 }}
                  >
                    <ChevronRightIcon />
                  </IconButton>
                </>
              )}
            </Box>
          </Container>
        </Paper>
      )}

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {/* Breadcrumbs — hidden in plan context to reduce phone clutter */}
        {!inPlanContext && (
          <>
            <Breadcrumbs sx={{ mb: 2 }}>
              <Link
                underline="hover"
                color="inherit"
                sx={{ cursor: "pointer" }}
                onClick={() => navigate("/")}
              >
                Home
              </Link>
              <Link
                underline="hover"
                color="inherit"
                sx={{ cursor: "pointer" }}
                onClick={() => navigate("/services")}
              >
                Services
              </Link>
              <Typography color="text.primary">{service.name}</Typography>
            </Breadcrumbs>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate(-1)}
              sx={{ mb: 2, color: "text.secondary" }}
            >
              Back
            </Button>
          </>
        )}

        {/* Detail card */}
        <ServiceDetailCard service={service} />

        {/* Map showing all locations */}
        {mapPins.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h5" fontWeight={600} gutterBottom>
              Locations
            </Typography>
            <Box
              sx={{
                height: 400,
                borderRadius: (theme) => theme.shape.radius.card,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <ServiceMap pins={mapPins} showControls={false} fitBounds />
            </Box>
          </Box>
        )}
      </Container>
    </>
  );
}
