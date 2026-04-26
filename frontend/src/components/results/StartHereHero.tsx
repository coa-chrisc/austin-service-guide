import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import PhoneIcon from "@mui/icons-material/Phone";
import DirectionsIcon from "@mui/icons-material/Directions";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import CheckIcon from "@mui/icons-material/Check";
import type { ApplicationOrderItem } from "@/lib/api";
import type { ServiceMatch } from "@/types";

interface StartHereHeroProps {
  topItem: ApplicationOrderItem;
  topMatch?: ServiceMatch;
}

export default function StartHereHero({
  topItem,
  topMatch,
}: StartHereHeroProps) {
  const service = topMatch?.service;
  const primaryLocation =
    service?.locations?.find((l) => l.is_primary) ?? service?.locations?.[0];
  const directionsUrl = primaryLocation
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${primaryLocation.address}, ${primaryLocation.city}, ${primaryLocation.state} ${primaryLocation.zip_code}`,
      )}`
    : null;

  return (
    <Box>
      {/* Hero card — the rank-1 service */}
      <Card
        sx={{
          borderRadius: 3,
          overflow: "hidden",
          border: "2px solid",
          borderColor: "primary.main",
          boxShadow: "0 8px 24px rgba(0, 91, 187, 0.18)",
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
          <RocketLaunchIcon />
          <Typography
            variant="overline"
            fontWeight={700}
            sx={{ letterSpacing: 1 }}
          >
            Start here
          </Typography>
        </Box>
        <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ lineHeight: 1.25, mb: 0.5 }}
          >
            {topItem.service_name}
          </Typography>
          {service?.provider_name && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {service.provider_name}
            </Typography>
          )}
          <Typography
            variant="body1"
            sx={{ mb: 2.5, color: "text.primary", lineHeight: 1.5 }}
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
                  borderRadius: "28px",
                  flex: 1,
                }}
              >
                Call now
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
                  borderRadius: "28px",
                  flex: 1,
                }}
              >
                Get directions
              </Button>
            )}
          </Stack>

          {service?.phone && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1, fontWeight: 500 }}
            >
              📞 {service.phone}
            </Typography>
          )}
          {primaryLocation && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              📍 {primaryLocation.address}, {primaryLocation.city},{" "}
              {primaryLocation.state} {primaryLocation.zip_code}
            </Typography>
          )}

          {/* What to bring — inline, not collapsed */}
          {service && service.documents && service.documents.length > 0 && (
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: "primary.50",
                border: "1px solid",
                borderColor: "primary.100",
              }}
            >
              <Typography
                variant="subtitle2"
                fontWeight={700}
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <CheckIcon fontSize="small" color="primary" />
                What to bring
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
                        bgcolor: d.is_required ? "error.main" : "text.disabled",
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
                            label="Optional"
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
