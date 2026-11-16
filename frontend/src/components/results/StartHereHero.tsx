import { alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import PhoneIcon from "@mui/icons-material/Phone";
import DirectionsIcon from "@mui/icons-material/Directions";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import CheckIcon from "@mui/icons-material/Check";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { useNavigate } from "react-router-dom";
import { openStatusLabel } from "@/lib/hours";
import type { ApplicationOrderItem } from "@/lib/api";
import type { ServiceMatch } from "@/types";
import { makeResultsT } from "@/lib/resultsI18n";

interface StartHereHeroProps {
  topItem: ApplicationOrderItem;
  topMatch?: ServiceMatch;
  /** Opened from the resident's plan: detail pages link back to it. */
  fromPlan?: boolean;
  language?: string;
}

export default function StartHereHero({
  topItem,
  topMatch,
  fromPlan,
  language,
}: StartHereHeroProps) {
  const navigate = useNavigate();
  const t = makeResultsT(language);
  const service = topMatch?.service;
  const primaryLocation =
    service?.locations?.find((l) => l.is_primary) ?? service?.locations?.[0];
  const directionsUrl = primaryLocation
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${primaryLocation.address}, ${primaryLocation.city}, ${primaryLocation.state} ${primaryLocation.zip_code}`,
      )}`
    : null;
  const planQs = fromPlan ? "?plan=1" : "";

  return (
    <Box>
      {/* Hero card — the rank-1 service */}
      <Card
        sx={{
          overflow: "hidden",
          border: "2px solid",
          borderColor: "primary.main",
          boxShadow: (t) => `0 8px 24px ${alpha(t.palette.brand.ink, 0.18)}`,
          mb: 2.5,
        }}
      >
        <Box
          sx={{
            px: { xs: 2.5, sm: 3 },
            py: 1.5,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <RocketLaunchIcon fontSize="small" />
          <Typography variant="overline">
            {t("start_here")}
          </Typography>
        </Box>
        <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
          <Typography
            variant="h5"
            component="h2"
            fontWeight={700}
            sx={{ mb: 0.5 }}
          >
            {topItem.service_name}
          </Typography>
          {/* Skip the provider line when it only repeats the service name. */}
          {service?.provider_name &&
            service.provider_name !== topItem.service_name && (
              <Typography variant="body2" color="text.secondary">
                {service.provider_name}
              </Typography>
            )}
          <Typography
            variant="body1"
            sx={{ mt: 1.5, mb: 3, color: "text.primary" }}
          >
            {topItem.reason}
          </Typography>

          {/* Primary actions — full-width on phone */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.25}
            sx={{ mb: 2.5 }}
          >
            {service?.phone && (
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<PhoneIcon />}
                href={`tel:${service.phone.replace(/[^\d+]/g, "")}`}
                sx={{
                  minHeight: 56,
                  fontSize: "1.05rem",
                  fontWeight: 700,
                                    flex: 1,
                }}
              >
                {t("call_now")}
              </Button>
            )}
            {directionsUrl && (
              <Button
                variant="outlined"
                size="large"
                fullWidth
                startIcon={<DirectionsIcon />}
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  minHeight: 56,
                  fontSize: "1rem",
                  fontWeight: 600,
                                    flex: 1,
                }}
              >
                {t("get_directions")}
              </Button>
            )}
            <Button
              variant={
                service?.phone || directionsUrl ? "outlined" : "contained"
              }
              size="large"
              fullWidth
              endIcon={<ArrowForwardIcon />}
              onClick={() =>
                navigate(`/services/${topItem.service_slug}${planQs}`)
              }
              sx={{
                minHeight: 56,
                fontSize: "1rem",
                fontWeight: 600,
                                flex: 1,
              }}
            >
              {t("view_details")}
            </Button>
          </Stack>

          {service?.phone && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}
            >
              <PhoneIcon sx={{ fontSize: 18 }} />
              {service.phone}
            </Typography>
          )}
          {primaryLocation && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1.5, display: "flex", alignItems: "flex-start", gap: 1 }}
            >
              <PlaceOutlinedIcon sx={{ fontSize: 18, mt: "1px" }} />
              {primaryLocation.address}, {primaryLocation.city},{" "}
              {primaryLocation.state} {primaryLocation.zip_code}
            </Typography>
          )}
          {primaryLocation &&
            (() => {
              const status = openStatusLabel(primaryLocation);
              return (
                <Chip
                  label={status.open ? t("open_now") : status.label}
                  size="small"
                  variant={status.open ? "filled" : "outlined"}
                  sx={{
                    mb: 2.5,
                    height: 24,
                    fontSize: 12,
                    fontWeight: 600,
                    bgcolor: status.open ? (theme) => alpha(theme.palette.success.main, 0.12) : "transparent",
                    color: status.open ? "success.dark" : "text.secondary",
                    borderColor: status.open ? "success.light" : "divider",
                  }}
                />
              );
            })()}

          {/* What to bring — inline, not collapsed */}
          {service && service.documents && service.documents.length > 0 && (
            <Box
              sx={{
                px: 2.5,
                py: 2,
                borderRadius: (theme) => theme.shape.radius.control,
                bgcolor: "brand.primarySoft",
                border: "1px solid",
                borderColor: "primary.light",
              }}
            >
              <Typography
                variant="subtitle2"
                fontWeight={700}
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <CheckIcon fontSize="small" color="primary" />
                {t("what_to_bring")}
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {service.documents.map((d) => (
                  <Box
                    key={d.name}
                    sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}
                  >
                    <Box
                      sx={{
                        mt: "6px",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        // Required items get the brand dot; red read as an error.
                        bgcolor: d.is_required ? "primary.main" : "text.disabled",
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Box
                        sx={{
                          display: "flex",
                          gap: 0.75,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <Typography variant="body2" fontWeight={600}>
                          {d.name}
                        </Typography>
                        {!d.is_required && (
                          <Chip
                            label={t("optional")}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: 10 }}
                          />
                        )}
                      </Box>
                      {d.description && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", lineHeight: 1.4 }}
                        >
                          {d.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
