import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { categoryLabel } from "@/lib/categoryLabel";
import { groupByCategory } from "@/lib/planSteps";
import { makeResultsT } from "@/lib/resultsI18n";
import type { ServiceMatch } from "@/types";

function MatchRow({ match }: { match: ServiceMatch }) {
  const navigate = useNavigate();
  const { service } = match;
  return (
    <Card
      variant="outlined"
      sx={{
        "&:hover": { boxShadow: (t) => `0 4px 12px ${alpha(t.palette.brand.ink, 0.08)}` },
      }}
    >
      <CardActionArea
        onClick={() => navigate(`/services/${service.slug}?plan=1`)}
        aria-label={`View details for ${service.name}`}
        sx={{ px: 2, py: 1.25, minHeight: 56 }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" component="p" fontWeight={700} noWrap>
              {service.name}
            </Typography>
            {match.match_reasoning && (
              <Typography variant="body2" color="text.secondary" noWrap>
                {match.match_reasoning}
              </Typography>
            )}
          </Box>
          <ArrowForwardIcon color="action" sx={{ flexShrink: 0 }} />
        </Box>
      </CardActionArea>
    </Card>
  );
}

interface MoreServicesProps {
  matches: ServiceMatch[];
  language?: string;
}

/**
 * Every match that is not a plan step, collapsed by default and grouped by
 * category, so the plan stays short without hiding any match. A disclosure
 * button inside a heading (WAI-ARIA disclosure pattern); focus stays on it.
 */
export default function MoreServices({ matches, language }: MoreServicesProps) {
  const [open, setOpen] = useState(false);
  const t = makeResultsT(language);
  const id = useId();
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;

  if (matches.length === 0) return null;

  return (
    <Box sx={{ mt: 1, mb: 2 }}>
      <Typography component="h2" variant="h6" sx={{ m: 0 }}>
        <Button
          id={buttonId}
          variant="outlined"
          size="large"
          fullWidth
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{ minHeight: 52, justifyContent: "space-between", fontSize: "1rem" }}
        >
          {t("more_services", { n: matches.length })}
        </Button>
      </Typography>
      {/* Kept mounted (hidden while closed) so aria-controls always resolves. */}
      <Collapse in={open}>
        <Box id={panelId} role="region" aria-labelledby={buttonId} sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("more_services_intro")}
          </Typography>
          {groupByCategory(matches).map(([category, group]) => (
            <Box key={category} sx={{ mb: 2.5 }}>
              <Typography
                component="h3"
                variant="overline"
                sx={{ display: "block", color: "text.secondary", mb: 1 }}
              >
                {categoryLabel(category)} · {group.length}
              </Typography>
              <Stack spacing={1}>
                {group.map((m) => (
                  <MatchRow key={m.service.id} match={m} />
                ))}
              </Stack>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
