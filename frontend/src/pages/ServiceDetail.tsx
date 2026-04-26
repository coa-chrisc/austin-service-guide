import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ServiceDetailCard from "@/components/services/ServiceDetailCard";
import ServiceMap from "@/components/map/ServiceMap";
import { getServiceBySlug } from "@/lib/api";
import type { Service, MapPin } from "@/types";

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    getServiceBySlug(slug)
      .then(setService)
      .catch((err) => setError(err.message || "Service not found"))
      .finally(() => setLoading(false));
  }, [slug]);

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
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Breadcrumbs */}
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

      {/* Back button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(-1)}
        sx={{ mb: 2, color: "text.secondary" }}
      >
        Back
      </Button>

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
  );
}
