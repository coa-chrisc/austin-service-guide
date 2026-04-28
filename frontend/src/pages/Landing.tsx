import { useEffect, useState } from "react";
import {
  useNavigate,
  Link as RouterLink,
  useSearchParams,
} from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Skeleton from "@mui/material/Skeleton";
import Link from "@mui/material/Link";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ChatIcon from "@mui/icons-material/Chat";
import SearchIcon from "@mui/icons-material/Search";
import MapIcon from "@mui/icons-material/Map";
import FamilyRestroomIcon from "@mui/icons-material/FamilyRestroom";
import WorkIcon from "@mui/icons-material/Work";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import SchoolIcon from "@mui/icons-material/School";
import ElderlyIcon from "@mui/icons-material/Elderly";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import GavelIcon from "@mui/icons-material/Gavel";
import DirectionsBusIcon from "@mui/icons-material/DirectionsBus";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import MilitaryTechIcon from "@mui/icons-material/MilitaryTech";
import PsychologyIcon from "@mui/icons-material/Psychology";
import PublicIcon from "@mui/icons-material/Public";
import {
  getLifeEvents,
  getPersonas,
  loadPersona,
  type PersonaSummary,
} from "@/lib/api";
import type { LifeEvent } from "@/types";

const PERSONA_ICONS: Record<string, React.ReactNode> = {
  "heat-outdoor-worker": <PsychologyIcon sx={{ fontSize: 28 }} />,
  "schools-anxious-student": <SchoolIcon sx={{ fontSize: 28 }} />,
  "equity-east-austin": <HomeWorkIcon sx={{ fontSize: 28 }} />,
  "refugee-food": <PublicIcon sx={{ fontSize: 28 }} />,
};

function iconForPersonaId(id: string): React.ReactNode {
  // Match longest base id; strips trailing language suffixes like -vi/-es/-zh/-ar.
  const base = id.replace(/-[a-z]{2}(?:-[a-zA-Z]{2,4})?$/, "");
  return (
    PERSONA_ICONS[id] ??
    PERSONA_ICONS[base] ?? <PublicIcon sx={{ fontSize: 28 }} />
  );
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  vi: "Tiếng Việt",
  zh: "中文",
  ar: "العربية",
};

const ICON_MAP: Record<string, React.ReactNode> = {
  family: <FamilyRestroomIcon sx={{ fontSize: 36 }} />,
  job: <WorkIcon sx={{ fontSize: 36 }} />,
  work: <WorkIcon sx={{ fontSize: 36 }} />,
  employment: <WorkIcon sx={{ fontSize: 36 }} />,
  housing: <HomeWorkIcon sx={{ fontSize: 36 }} />,
  home: <HomeWorkIcon sx={{ fontSize: 36 }} />,
  health: <LocalHospitalIcon sx={{ fontSize: 36 }} />,
  medical: <LocalHospitalIcon sx={{ fontSize: 36 }} />,
  education: <SchoolIcon sx={{ fontSize: 36 }} />,
  school: <SchoolIcon sx={{ fontSize: 36 }} />,
  senior: <ElderlyIcon sx={{ fontSize: 36 }} />,
  aging: <ElderlyIcon sx={{ fontSize: 36 }} />,
  child: <ChildCareIcon sx={{ fontSize: 36 }} />,
  baby: <ChildCareIcon sx={{ fontSize: 36 }} />,
  legal: <GavelIcon sx={{ fontSize: 36 }} />,
  transport: <DirectionsBusIcon sx={{ fontSize: 36 }} />,
  food: <RestaurantIcon sx={{ fontSize: 36 }} />,
  hunger: <RestaurantIcon sx={{ fontSize: 36 }} />,
  veteran: <MilitaryTechIcon sx={{ fontSize: 36 }} />,
  mental: <PsychologyIcon sx={{ fontSize: 36 }} />,
  crisis: <PsychologyIcon sx={{ fontSize: 36 }} />,
  immigrant: <PublicIcon sx={{ fontSize: 36 }} />,
  immigration: <PublicIcon sx={{ fontSize: 36 }} />,
};

function getIconForEvent(event: LifeEvent): React.ReactNode {
  if (event.icon && ICON_MAP[event.icon]) return ICON_MAP[event.icon];
  const slug = event.slug.toLowerCase();
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (slug.includes(key)) return icon;
  }
  return <SearchIcon sx={{ fontSize: 36 }} />;
}

const FALLBACK_EVENTS: LifeEvent[] = [
  {
    id: "1",
    name: "Lost My Job",
    slug: "lost-job",
    description: "Unemployment benefits, job training, and career services",
    icon: "work",
    related_categories: [],
  },
  {
    id: "2",
    name: "Need Food Help",
    slug: "need-food",
    description: "Food pantries, SNAP benefits, and meal programs",
    icon: "food",
    related_categories: [],
  },
  {
    id: "3",
    name: "Facing Eviction",
    slug: "facing-eviction",
    description: "Emergency housing, rental assistance, and legal aid",
    icon: "housing",
    related_categories: [],
  },
  {
    id: "4",
    name: "Having a Baby",
    slug: "having-baby",
    description: "Prenatal care, WIC, childcare resources",
    icon: "baby",
    related_categories: [],
  },
  {
    id: "5",
    name: "Need Healthcare",
    slug: "need-healthcare",
    description: "Medicaid, clinics, prescription assistance",
    icon: "health",
    related_categories: [],
  },
  {
    id: "6",
    name: "Mental Health Support",
    slug: "mental-health",
    description: "Counseling, crisis support, peer groups",
    icon: "mental",
    related_categories: [],
  },
  {
    id: "7",
    name: "Senior Assistance",
    slug: "senior-help",
    description: "Medicare, meals on wheels, elder care",
    icon: "senior",
    related_categories: [],
  },
  {
    id: "8",
    name: "Veteran Benefits",
    slug: "veteran-benefits",
    description: "VA healthcare, housing, employment programs",
    icon: "veteran",
    related_categories: [],
  },
  {
    id: "9",
    name: "New to Austin",
    slug: "new-to-austin",
    description: "Settling in, schools, community resources",
    icon: "immigration",
    related_categories: [],
  },
  {
    id: "10",
    name: "Legal Trouble",
    slug: "legal-trouble",
    description: "Legal aid, court help, rights information",
    icon: "legal",
    related_categories: [],
  },
  {
    id: "11",
    name: "Child Care Needs",
    slug: "child-care",
    description: "Subsidized childcare, pre-K, after-school programs",
    icon: "child",
    related_categories: [],
  },
  {
    id: "12",
    name: "Back to School",
    slug: "back-to-school",
    description: "GED, college aid, vocational training",
    icon: "education",
    related_categories: [],
  },
];

const STEPS = [
  {
    icon: <ChatIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    title: "Tell Us Your Situation",
    description:
      "Have a simple conversation with our AI assistant about what you need help with.",
  },
  {
    icon: <SearchIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    title: "We Find Matching Services",
    description:
      "Our system searches 200+ services to find ones you're likely eligible for.",
  },
  {
    icon: <MapIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    title: "See Where to Go",
    description:
      "View matched services on a map with directions, hours, and contact info.",
  },
];

const FOOTER_LINKS = [
  { label: "Home", path: "/" },
  { label: "Services", path: "/services" },
  { label: "Map", path: "/map" },
  { label: "Get Started", path: "/intake" },
];

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const demoMode = searchParams.get("demo") === "1";
  const [lifeEvents, setLifeEvents] = useState<LifeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  useEffect(() => {
    getLifeEvents()
      .then(setLifeEvents)
      .catch(() => setLifeEvents(FALLBACK_EVENTS))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    getPersonas()
      .then((res) => setPersonas(res.personas))
      .catch((err) => console.error("Failed to load personas", err));
  }, [demoMode]);

  // When the Demo nav button drops the user on /?demo=1, scroll the
  // launcher into view so they don't have to hunt for it past the hero.
  useEffect(() => {
    if (!demoMode) return;
    const t = setTimeout(() => {
      document
        .getElementById("demo-launcher")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, [demoMode]);

  const handleLaunchPersona = async (id: string) => {
    setLaunchingId(id);
    try {
      const res = await loadPersona(id);
      const personaLabel = personas.find((p) => p.id === id)?.label;
      navigate(`/demo/${res.session_id}`, {
        state: {
          openingMessage: res.opening_message,
          script: res.script,
          personaLabel,
        },
      });
    } catch (err) {
      console.error("Failed to load persona", err);
      setLaunchingId(null);
    }
  };

  const displayEvents = lifeEvents.length > 0 ? lifeEvents : FALLBACK_EVENTS;

  return (
    <Box>
      {/* Hero section */}
      <Box
        sx={{
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 60%, ${theme.palette.secondary.dark} 100%)`,
          color: "white",
          py: { xs: 8, md: 12 },
          px: 2,
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.06) 0%, transparent 50%)",
          },
        }}
      >
        <Container maxWidth="md" sx={{ position: "relative", zIndex: 1 }}>
          <Typography
            variant="h2"
            fontWeight={800}
            sx={{
              fontSize: { xs: "2rem", sm: "2.75rem", md: "3.25rem" },
              mb: 2,
              lineHeight: 1.2,
            }}
          >
            Find services you're eligible for — in minutes
          </Typography>
          <Typography
            variant="h6"
            sx={{
              opacity: 0.9,
              fontWeight: 400,
              mb: 4,
              maxWidth: 600,
              mx: "auto",
              fontSize: { xs: "1rem", md: "1.2rem" },
              lineHeight: 1.6,
            }}
          >
            Answer a few simple questions and our AI will match you with city,
            county, state, and nonprofit services across Austin.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate("/intake")}
            endIcon={<ArrowForwardIcon />}
            sx={{
              bgcolor: "white",
              color: "primary.dark",
              fontWeight: 700,
              fontSize: "1.1rem",
              px: 5,
              py: 1.5,
              borderRadius: "28px",
              "&:hover": {
                bgcolor: "rgba(255,255,255,0.92)",
                transform: "translateY(-1px)",
              },
              transition: "all 0.2s ease",
              boxShadow: "0 4px 14px rgba(34, 37, 78, 0.25)",
            }}
          >
            Get Started
          </Button>
          <Typography variant="body2" sx={{ mt: 2, opacity: 0.75 }}>
            No account needed. Free and confidential.
          </Typography>
        </Container>
      </Box>

      {/* Demo persona launcher (?demo=1) */}
      {demoMode && (
        <Box
          id="demo-launcher"
          sx={{ bgcolor: "#fff7e6", borderBottom: "1px solid #f0d8a8" }}
        >
          <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="overline" sx={{ color: "warning.dark" }}>
                Demo mode
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                Launch a scripted resident scenario
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Each persona seeds a baseline profile and a realistic opening
                message — the live AI takes over from there. Click one to jump
                straight to the matched-services result.
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {personas.map((p) => (
                <Grid key={p.id} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card>
                    <CardActionArea
                      onClick={() => handleLaunchPersona(p.id)}
                      disabled={launchingId !== null}
                      sx={{ p: 2.25, height: "100%" }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.25,
                          mb: 1,
                        }}
                      >
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            bgcolor: "warning.light",
                            color: "warning.dark",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {iconForPersonaId(p.id) ?? (
                            <ChatIcon sx={{ fontSize: 24 }} />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {LANGUAGE_LABELS[p.language] ?? p.language}
                        </Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {p.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mt: 0.5 }}
                      >
                        {launchingId === p.id ? "Launching…" : "Click to load"}
                      </Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>
      )}

      {/* How It Works */}
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Typography
          variant="h4"
          fontWeight={700}
          textAlign="center"
          gutterBottom
        >
          How It Works
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          textAlign="center"
          sx={{ mb: 6, maxWidth: 500, mx: "auto" }}
        >
          Three simple steps to find the help you need
        </Typography>
        <Grid container spacing={4} sx={{ position: "relative" }}>
          {/* Connector lines (desktop only) */}
          <Box
            sx={{
              display: { xs: "none", md: "block" },
              position: "absolute",
              top: 48,
              left: "calc(33.33% / 2 + 48px)",
              right: "calc(33.33% / 2 + 48px)",
              height: 0,
              borderTop: "2px dashed",
              borderColor: "divider",
              zIndex: 0,
            }}
          />
          {STEPS.map((step, idx) => (
            <Grid key={idx} size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  textAlign: "center",
                  px: 2,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <Box
                  sx={{
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mx: "auto",
                    mb: 3,
                    position: "relative",
                    "& .MuiSvgIcon-root": { color: "white !important" },
                  }}
                >
                  {step.icon}
                  <Box
                    sx={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      bgcolor: "secondary.main",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {idx + 1}
                  </Box>
                </Box>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  {step.title}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  lineHeight={1.6}
                >
                  {step.description}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Life Events */}
      <Box sx={{ bgcolor: "#dcf2fd33", py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography
            variant="h4"
            fontWeight={700}
            textAlign="center"
            gutterBottom
          >
            What's Going On?
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            textAlign="center"
            sx={{ mb: 6, maxWidth: 500, mx: "auto" }}
          >
            Select a life situation to get tailored service recommendations
          </Typography>
          <Grid container spacing={2}>
            {loading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <Grid key={i} size={{ xs: 6, sm: 4, md: 3 }}>
                    <Skeleton
                      variant="rounded"
                      height={140}
                      sx={{ borderRadius: 2 }}
                    />
                  </Grid>
                ))
              : displayEvents.slice(0, 12).map((event) => (
                  <Grid key={event.id} size={{ xs: 6, sm: 4, md: 3 }}>
                    <Card
                      sx={{
                        height: "100%",
                        "&:hover": {
                          transform: "translateY(-3px)",
                          boxShadow: "0 8px 24px rgba(34, 37, 78, 0.14)",
                        },
                        transition: "transform 0.2s ease, box-shadow 0.2s ease",
                      }}
                    >
                      <CardActionArea
                        onClick={() => navigate(`/intake?event=${event.slug}`)}
                        sx={{ height: "100%", p: 2.5 }}
                      >
                        <Box
                          sx={{
                            width: 56,
                            height: 56,
                            borderRadius: "50%",
                            bgcolor: "#dcf2fd",
                            color: "primary.main",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            mb: 1.5,
                          }}
                        >
                          {getIconForEvent(event)}
                        </Box>
                        <Typography
                          variant="subtitle1"
                          fontWeight={600}
                          gutterBottom
                        >
                          {event.name}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            lineHeight: 1.5,
                          }}
                        >
                          {event.description}
                        </Typography>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
          </Grid>
        </Container>
      </Box>

      {/* Stats Section */}
      <Box
        sx={{
          py: { xs: 6, md: 8 },
          bgcolor: "primary.main",
          color: "white",
          textAlign: "center",
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {[
              { value: "200+", label: "Services Available" },
              { value: "14", label: "Service Categories" },
              { value: "1M+", label: "Austin Residents Served" },
              { value: "7+", label: "Languages Supported" },
            ].map((stat) => (
              <Grid key={stat.label} size={{ xs: 6, md: 3 }}>
                <Typography
                  variant="h3"
                  fontWeight={800}
                  sx={{ fontSize: { xs: "2rem", md: "2.5rem" } }}
                >
                  {stat.value}
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.85, mt: 0.5 }}>
                  {stat.label}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Footer */}
      <Box
        component="footer"
        sx={{
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "linear-gradient(90deg, #44499C 0%, #009F4D 100%)",
          },
        }}
      >
        <Box sx={{ bgcolor: "primary.dark", color: "white", py: 5, px: 2 }}>
          <Container maxWidth="lg">
            <Grid container spacing={4} alignItems="center">
              <Grid size={{ xs: 12, md: 5 }}>
                <Box
                  component="img"
                  src="/aph-logo.png"
                  alt="Austin Public Health"
                  sx={{
                    height: 40,
                    width: "auto",
                    filter: "brightness(0) invert(1)",
                    mb: 1.5,
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{ opacity: 0.7, maxWidth: 320 }}
                >
                  Connecting Austin residents to the services they need through
                  AI-powered guidance.
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    mb: 1,
                    opacity: 0.5,
                    letterSpacing: 1,
                  }}
                >
                  QUICK LINKS
                </Typography>
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {FOOTER_LINKS.map((link) => (
                    <Link
                      key={link.path}
                      component={RouterLink}
                      to={link.path}
                      underline="hover"
                      sx={{
                        color: "rgba(255,255,255,0.8)",
                        fontSize: 14,
                        "&:hover": { color: "white" },
                      }}
                    >
                      {link.label}
                    </Link>
                  ))}
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    mb: 1,
                    opacity: 0.5,
                    letterSpacing: 1,
                  }}
                >
                  EMERGENCY
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  If you are in crisis, call 988
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Emergency: 911
                </Typography>
              </Grid>
            </Grid>
            <Box
              sx={{
                mt: 4,
                pt: 3,
                borderTop: "1px solid rgba(255,255,255,0.12)",
                textAlign: "center",
              }}
            >
              <Typography variant="caption" sx={{ opacity: 0.5 }}>
                Austin Public Health | City of Austin & Travis County
              </Typography>
            </Box>
          </Container>
        </Box>
      </Box>
    </Box>
  );
}
