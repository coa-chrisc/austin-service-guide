import { useNavigate } from "react-router-dom";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import type { Service, MatchConfidence } from "@/types";

interface ServiceCardProps {
  service: Service;
  matchConfidence?: MatchConfidence;
  matchScore?: number;
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
  matchScore,
}: ServiceCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 8px 24px rgba(34, 37, 78, 0.14)",
        },
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onClick={() => navigate(`/services/${service.slug}`)}
    >
      <CardContent sx={{ flex: 1, pb: 1 }}>
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
          {matchScore !== undefined && matchScore > 0 && (
            <Typography variant="caption" color="text.disabled">
              Score: {Math.round(matchScore * 100)}%
            </Typography>
          )}
        </Box>
      </CardContent>

      <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
        <Button
          size="small"
          endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
          sx={{ fontWeight: 600 }}
        >
          Learn More
        </Button>
      </CardActions>
    </Card>
  );
}
