import { useEffect, useMemo, useState } from "react";
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
import { getServiceBySlug, getIntakeResults } from "@/lib/api";
import type { Service, MapPin } from "@/types";

interface PlanContext {
  sessionId: string;
  slugs: string[];
}

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planSessionId = searchParams.get("session");

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanContext | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    getServiceBySlug(slug)
      .then(setService)
      .catch((err) => setError(err.message || "Service not found"))
      .finally(() => setLoading(false));
  }, [slug]);

  // Load plan context (matched service slugs in plan order) when ?session= is present.
  useEffect(() => {
    if (!planSessionId) {
      setPlan(null);
      return;
    }
    getIntakeResults(planSessionId)
      .then((res) => {
        const slugs = (res.matches ?? []).map((m) => m.service.slug);
        if (slugs.length > 0) setPlan({ sessionId: planSessionId, slugs });
        else setPlan(null);
      })
      .catch(() => setPlan(null));
  }, [planSessionId]);

  const planNav = useMemo(() => {
    if (!plan || !slug) return null;
    const idx = plan.slugs.indexOf(slug);
    if (idx === -1) return null;
    return {
      index: idx,
      total: plan.slugs.length,
      prevSlug: idx > 0 ? plan.slugs[idx - 1] : null,
      nextSlug: idx < plan.slugs.length - 1 ? plan.slugs[idx + 1] : null,
    };
  }, [plan, slug]);

  const inPlanContext = !!planNav;
  const sessionQs = inPlanContext ? `?session=${plan!.sessionId}` : "";

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
            top: 64,
            zIndex: 1050,
            borderRadius: 0,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "primary.50",
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
                onClick={() => navigate(`/results/${plan!.sessionId}`)}
                sx={{
                  fontWeight: 700,
                  textTransform: "none",
                  color: "primary.main",
                  whiteSpace: "nowrap",
                }}
              >
                Back to my plan
              </Button>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  flex: 1,
                  textAlign: "center",
                  fontWeight: 600,
                  fontSize: { xs: 12, sm: 14 },
                }}
              >
                Service {planNav!.index + 1} of {planNav!.total}
              </Typography>
              <IconButton
                size="small"
                disabled={!planNav!.prevSlug}
                onClick={() =>
                  planNav!.prevSlug &&
                  navigate(`/services/${planNav!.prevSlug}${sessionQs}`)
                }
                aria-label="Previous service"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <ChevronLeftIcon />
              </IconButton>
              <IconButton
                size="small"
                disabled={!planNav!.nextSlug}
                onClick={() =>
                  planNav!.nextSlug &&
                  navigate(`/services/${planNav!.nextSlug}${sessionQs}`)
                }
                aria-label="Next service"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <ChevronRightIcon />
              </IconButton>
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
                borderRadius: 3,
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
