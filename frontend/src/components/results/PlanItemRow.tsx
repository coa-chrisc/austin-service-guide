import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useNavigate } from "react-router-dom";
import type { ApplicationOrderItem } from "@/lib/api";

interface PlanItemRowProps {
  item: ApplicationOrderItem;
  rank: number;
  sessionId?: string;
}

export default function PlanItemRow({
  item,
  rank,
  sessionId,
}: PlanItemRowProps) {
  const navigate = useNavigate();
  const sessionQs = sessionId ? `?session=${sessionId}` : "";

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.08)" },
      }}
    >
      <CardActionArea
        onClick={() => navigate(`/services/${item.service_slug}${sessionQs}`)}
        aria-label={`View details for ${item.service_name}`}
        sx={{ p: 1.5, minHeight: 56 }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {rank}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={700} noWrap>
              {item.service_name}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {item.reason}
            </Typography>
          </Box>
          <ArrowForwardIcon color="action" sx={{ flexShrink: 0 }} />
        </Box>
      </CardActionArea>
    </Card>
  );
}
