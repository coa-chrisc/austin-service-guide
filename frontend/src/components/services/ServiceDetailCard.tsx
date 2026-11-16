import type { ReactNode } from "react";
import { alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Grid from "@mui/material/Grid";
import PhoneIcon from "@mui/icons-material/Phone";
import EmailIcon from "@mui/icons-material/Email";
import LanguageIcon from "@mui/icons-material/Language";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PlaceIcon from "@mui/icons-material/Place";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DescriptionIcon from "@mui/icons-material/Description";
import DirectionsIcon from "@mui/icons-material/Directions";
import ShareIcon from "@mui/icons-material/Share";
import AccessibleIcon from "@mui/icons-material/Accessible";
import TranslateIcon from "@mui/icons-material/Translate";
import { openStatusLabel } from "@/lib/hours";
import type { Service } from "@/types";
import { categoryLabel } from "@/lib/categoryLabel";

interface ServiceDetailCardProps {
  service: Service;
}

const COST_LABELS: Record<string, string> = {
  free: "Free",
  sliding_scale: "Sliding Scale",
  flat_fee: "Fee Required",
  insurance: "Insurance Accepted",
  varies: "Cost Varies",
};

/**
 * A call, email or website link as a whole row. Tap-to-call is the main
 * action on a phone, so on small screens and touch devices the row is a
 * bordered, full-width target at least 44 px tall; on desktop it stays a
 * plain icon-and-text line.
 */
function ContactLink({
  href,
  icon,
  external = false,
  children,
}: {
  href: string;
  icon: ReactNode;
  external?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      component="a"
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        minHeight: { xs: 44, md: 32 },
        px: { xs: 1.5, md: 0 },
        mb: 1,
        border: { xs: 1, md: 0 },
        borderColor: "divider",
        borderRadius: 2,
        bgcolor: { xs: "background.paper", md: "transparent" },
        color: "primary.main",
        textDecoration: "none",
        "&:hover": { textDecoration: "underline" },
        "@media (pointer: coarse)": { minHeight: 44 },
      }}
    >
      {icon}
      <Typography
        component="span"
        variant="body2"
        sx={{ minWidth: 0, overflowWrap: "anywhere" }}
      >
        {children}
      </Typography>
    </Box>
  );
}

export default function ServiceDetailCard({ service }: ServiceDetailCardProps) {
  const primaryLocation =
    service.locations.find((l) => l.is_primary) || service.locations[0];

  const handleShare = async () => {
    try {
      await navigator.share({
        title: service.name,
        text: service.description,
        url: window.location.href,
      });
    } catch {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <Card sx={{ overflow: "visible" }}>
      <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 2 }}>
            {service.categories.map((cat) => (
              <Chip
                key={cat}
                label={categoryLabel(cat)}
                size="small"
                sx={{
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  fontWeight: 600,
                }}
              />
            ))}
            <Chip
              label={COST_LABELS[service.cost_type] ?? service.cost_type}
              size="small"
              variant="outlined"
              color={service.cost_type === "free" ? "success" : "default"}
              sx={{
                fontWeight: 500,
                // Outlined success text is success.main, under 4.5:1; success.dark is the text-safe green.
                color: service.cost_type === "free" ? "success.dark" : undefined,
              }}
            />
          </Box>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
            {service.name}
          </Typography>
          {service.provider_name && service.provider_name !== service.name && (
            <Typography variant="h6" component="p" color="text.secondary" fontWeight={400}>
              {service.provider_name}
            </Typography>
          )}
        </Box>

        {/* Description */}
        <Typography variant="body1" sx={{ lineHeight: 1.8, mb: 3 }}>
          {service.description}
        </Typography>

        <Divider sx={{ my: 3 }} />

        <Grid container spacing={4}>
          {/* Left column */}
          <Grid size={{ xs: 12, md: 7 }}>
            {/* Eligibility */}
            {service.eligibility_summary && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
                  Eligibility
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.7 }}>
                  {service.eligibility_summary}
                </Typography>
              </Box>
            )}

            {/* Documents needed */}
            {service.documents.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
                  Documents Needed
                </Typography>
                <List dense disablePadding>
                  {service.documents.map((doc) => (
                    <ListItem key={doc.name} disableGutters sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {doc.is_required ? (
                          <CheckCircleOutlineIcon
                            color="primary"
                            fontSize="small"
                          />
                        ) : (
                          <DescriptionIcon color="action" fontSize="small" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={doc.name}
                        secondary={
                          doc.description +
                          (doc.is_required ? "" : " (optional)")
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {/* How to apply */}
            {service.how_to_apply && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
                  How to Apply
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.7 }}>
                  {service.how_to_apply}
                </Typography>
              </Box>
            )}
          </Grid>

          {/* Right column - Contact & Details */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Card
              variant="outlined"
              sx={{ bgcolor: "brand.subtle", mb: 3 }}
            >
              <CardContent>
                <Typography variant="subtitle1" component="h2" fontWeight={600} gutterBottom>
                  Contact Information
                </Typography>

                {service.phone && (
                  <ContactLink
                    href={`tel:${service.phone}`}
                    icon={<PhoneIcon color="action" fontSize="small" />}
                  >
                    {service.phone}
                  </ContactLink>
                )}

                {service.email && (
                  <ContactLink
                    href={`mailto:${service.email}`}
                    icon={<EmailIcon color="action" fontSize="small" />}
                  >
                    {service.email}
                  </ContactLink>
                )}

                {service.website_url && (
                  <ContactLink
                    href={service.website_url}
                    icon={<LanguageIcon color="action" fontSize="small" />}
                    external
                  >
                    Visit Website
                  </ContactLink>
                )}

                {/* Primary location */}
                {primaryLocation && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <PlaceIcon
                        color="action"
                        fontSize="small"
                        sx={{ mt: 0.25 }}
                      />
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {primaryLocation.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {primaryLocation.address}, {primaryLocation.city},{" "}
                          {primaryLocation.state} {primaryLocation.zip_code}
                        </Typography>
                      </Box>
                    </Box>

                    {primaryLocation.phone && (
                      <ContactLink
                        href={`tel:${primaryLocation.phone}`}
                        icon={<PhoneIcon color="action" fontSize="small" />}
                      >
                        {primaryLocation.phone}
                      </ContactLink>
                    )}

                    {Object.keys(primaryLocation.hours).length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            mb: 0.5,
                            flexWrap: "wrap",
                          }}
                        >
                          <AccessTimeIcon
                            color="action"
                            sx={{ fontSize: 16 }}
                          />
                          <Typography variant="body2" fontWeight={500}>
                            Hours
                          </Typography>
                          {(() => {
                            const status = openStatusLabel(primaryLocation);
                            return (
                              <Chip
                                label={status.open ? "Open now" : status.label}
                                size="small"
                                variant={status.open ? "filled" : "outlined"}
                                sx={{
                                  minHeight: 20,
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  bgcolor: status.open
                                    ? (theme) => alpha(theme.palette.success.main, 0.12)
                                    : "transparent",
                                  color: status.open
                                    ? "success.dark"
                                    : "text.secondary",
                                  borderColor: status.open
                                    ? "success.light"
                                    : "divider",
                                }}
                              />
                            );
                          })()}
                        </Box>
                        {Object.entries(primaryLocation.hours).map(
                          ([day, hours]) => (
                            <Box
                              key={day}
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                ml: 2.5,
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ textTransform: "capitalize" }}
                              >
                                {day}
                              </Typography>
                              <Typography variant="caption">{hours}</Typography>
                            </Box>
                          ),
                        )}
                      </Box>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Languages */}
            {service.languages_offered.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    mb: 1,
                  }}
                >
                  <TranslateIcon color="action" fontSize="small" />
                  <Typography variant="subtitle2" component="h2" fontWeight={600}>
                    Languages
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {service.languages_offered.map((lang) => (
                    <Chip
                      key={lang}
                      label={lang.toUpperCase()}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* Accessibility */}
            {service.accessibility_features.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    mb: 1,
                  }}
                >
                  <AccessibleIcon color="action" fontSize="small" />
                  <Typography variant="subtitle2" component="h2" fontWeight={600}>
                    Accessibility
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {service.accessibility_features.map((feat) => (
                    <Chip
                      key={feat}
                      label={feat}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* Action buttons */}
            <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
              {primaryLocation && (
                <Button
                  variant="contained"
                  startIcon={<DirectionsIcon />}
                  href={`https://www.google.com/maps/dir/?api=1&destination=${primaryLocation.latitude},${primaryLocation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ flex: 1 }}
                >
                  Get Directions
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<ShareIcon />}
                onClick={handleShare}
              >
                Share
              </Button>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1.5 }}
            >
              Demonstration data. Confirm details with the provider.
            </Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
