import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Tooltip from "@mui/material/Tooltip";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ChecklistIcon from "@mui/icons-material/Checklist";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import CloseIcon from "@mui/icons-material/Close";
import { QRCodeSVG } from "qrcode.react";
import type { Service, MatchConfidence } from "@/types";

interface ServiceCardProps {
  service: Service;
  matchConfidence?: MatchConfidence;
  fromSessionId?: string;
}

const CONFIDENCE_COLORS: Record<
  MatchConfidence,
  "success" | "warning" | "default"
> = {
  high: "success",
  medium: "warning",
  low: "default",
};

const CONFIDENCE_LABELS: Record<MatchConfidence, string> = {
  high: "Strong Match",
  medium: "Likely Match",
  low: "Possible Match",
};

const COST_LABELS: Record<string, string> = {
  free: "Free",
  sliding_scale: "Sliding Scale",
  flat_fee: "Fee Required",
  insurance: "Insurance",
  varies: "Varies",
};

export default function ServiceCard({
  service,
  matchConfidence,
  fromSessionId,
}: ServiceCardProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const [docsOpen, setDocsOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const docCount = service.documents?.length ?? 0;
  const primaryLocation =
    service.locations?.find((l) => l.is_primary) ?? service.locations?.[0];
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/services/${service.slug}`
      : `/services/${service.slug}`;

  const navigateToDetail = () =>
    navigate(
      `/services/${service.slug}${fromSessionId ? `?session=${fromSessionId}` : ""}`,
    );

  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 8px 24px rgba(34, 37, 78, 0.14)",
        },
      }}
    >
      <CardActionArea
        onClick={navigateToDetail}
        aria-label={`View details for ${service.name}`}
        sx={{ flex: 1, alignItems: "stretch", display: "flex" }}
      >
        <CardContent sx={{ flex: 1, pb: 1, width: "100%" }}>
          {/* Top row: categories + confidence */}
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1.5 }}>
            {service.categories.slice(0, 2).map((cat) => (
              <Chip
                key={cat}
                label={cat}
                size="small"
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  height: 22,
                }}
              />
            ))}
            {matchConfidence && (
              <Chip
                label={CONFIDENCE_LABELS[matchConfidence]}
                size="small"
                color={CONFIDENCE_COLORS[matchConfidence]}
                variant="outlined"
                sx={{ fontSize: 11, fontWeight: 600, height: 22, ml: "auto" }}
              />
            )}
          </Box>

          {/* Service name */}
          <Typography
            variant="subtitle1"
            fontWeight={700}
            gutterBottom
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              lineHeight: 1.3,
            }}
          >
            {service.name}
          </Typography>

          {/* Provider */}
          {service.provider_name && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {service.provider_name}
            </Typography>
          )}

          {/* Description */}
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              mb: 1.5,
              lineHeight: 1.5,
            }}
          >
            {service.description}
          </Typography>

          {/* Cost indicator */}
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Chip
              label={COST_LABELS[service.cost_type] ?? service.cost_type}
              size="small"
              variant="outlined"
              sx={{
                fontSize: 11,
                fontWeight: 500,
                height: 22,
                color:
                  service.cost_type === "free"
                    ? "success.main"
                    : "text.secondary",
                borderColor:
                  service.cost_type === "free" ? "success.main" : "divider",
              }}
            />
          </Box>
        </CardContent>
      </CardActionArea>

      <Collapse in={docsOpen} unmountOnExit>
        <Box
          sx={{
            mx: 2,
            mb: 1,
            p: 1.25,
            borderRadius: 1,
            bgcolor: "action.hover",
          }}
          onClick={stop}
        >
          <Typography
            variant="caption"
            sx={{
              display: "block",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              mb: 0.75,
              color: "text.secondary",
            }}
          >
            What to bring
          </Typography>
          {docCount === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No documents required — walk-ins welcome.
            </Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
              {service.documents.map((d) => (
                <Box
                  component="li"
                  key={d.name}
                  sx={{ mb: 0.5, "&:last-child": { mb: 0 } }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      {d.name}
                    </Typography>
                    {d.is_required ? (
                      <Chip
                        label="Required"
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
                      />
                    ) : (
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
              ))}
            </Box>
          )}
        </Box>
      </Collapse>

      <CardActions
        sx={{ px: 2, pb: 2, pt: 0, display: "flex", alignItems: "center" }}
      >
        <Button
          size="small"
          endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
          sx={{ fontWeight: 600 }}
        >
          Learn More
        </Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={docsOpen ? "Hide checklist" : "What to bring"}>
          <IconButton
            size={isPhone ? "medium" : "small"}
            onClick={(e) => {
              stop(e);
              setDocsOpen((v) => !v);
            }}
            sx={{
              color: docsOpen ? "primary.main" : "text.secondary",
              minWidth: 44,
              minHeight: 44,
            }}
          >
            <ChecklistIcon fontSize={isPhone ? "medium" : "small"} />
          </IconButton>
        </Tooltip>
        <Tooltip title="QR code for staff handoff">
          <IconButton
            size={isPhone ? "medium" : "small"}
            onClick={(e) => {
              stop(e);
              setQrOpen(true);
            }}
            sx={{
              color: "text.secondary",
              minWidth: 44,
              minHeight: 44,
            }}
          >
            <QrCode2Icon fontSize={isPhone ? "medium" : "small"} />
          </IconButton>
        </Tooltip>
      </CardActions>

      <Dialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onClick={stop}
        maxWidth="xs"
        fullWidth
        fullScreen={isPhone}
      >
        <DialogTitle
          sx={{
            pb: 0.5,
            pr: 6,
            display: "flex",
            alignItems: "flex-start",
          }}
        >
          <Box sx={{ flex: 1 }}>{service.name}</Box>
          <IconButton
            aria-label="Close"
            onClick={() => setQrOpen(false)}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              minWidth: 44,
              minHeight: 44,
              color: "text.secondary",
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Scan to open this service on a phone — useful for staff handoff at
            intake.
          </Typography>
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              p: 2,
              bgcolor: "#fff",
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <QRCodeSVG value={shareUrl} size={220} level="M" />
          </Box>
          <Box sx={{ mt: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ wordBreak: "break-all", display: "block" }}
            >
              {shareUrl}
            </Typography>
            {service.phone && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>Phone:</strong> {service.phone}
              </Typography>
            )}
            {primaryLocation && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <strong>Address:</strong> {primaryLocation.address},{" "}
                {primaryLocation.city}, {primaryLocation.state}{" "}
                {primaryLocation.zip_code}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
