import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import StartHereHero from "./StartHereHero";
import PlanItemRow from "./PlanItemRow";
import type { ApplicationOrderItem } from "@/lib/api";
import type { ServiceMatch } from "@/types";

// Display caps. ≤5 in the primary plan matches working-memory limits for
// residents in scarcity (Cowan 2001 ~4±1 chunks; Iyengar & Lepper 2000
// jam study; Mullainathan & Shafir 2013 Scarcity). Extended cap of 12
// keeps the long-tail option without paying full choice-overload cost.
const PLAN_PRIMARY_CAP = 5;
const PLAN_EXTENDED_CAP = 12;

interface PlanListProps {
  items: ApplicationOrderItem[];
  matches: ServiceMatch[];
  sessionId?: string;
  onShowAll: () => void;
}

export default function PlanList({
  items,
  matches,
  sessionId,
  onShowAll,
}: PlanListProps) {
  const [extendedOpen, setExtendedOpen] = useState(false);

  const topItem = items[0];
  const topMatch = topItem
    ? matches.find((m) => m.service.id === topItem.service_id)
    : undefined;

  const primary = items.slice(1, PLAN_PRIMARY_CAP);
  const extended = items.slice(PLAN_PRIMARY_CAP, PLAN_EXTENDED_CAP);
  const beyondExtended = Math.max(items.length - PLAN_EXTENDED_CAP, 0);

  if (!topItem) return null;

  return (
    <Box>
      <StartHereHero topItem={topItem} topMatch={topMatch} />

      {primary.length > 0 && (
        <Box sx={{ mt: 1, mb: 2 }}>
          <Typography
            variant="overline"
            sx={{
              display: "block",
              fontWeight: 700,
              color: "text.secondary",
              letterSpacing: 0.6,
              mb: 1,
            }}
          >
            Then these
          </Typography>
          <Stack spacing={1}>
            {primary.map((item, idx) => (
              <PlanItemRow
                key={item.service_id}
                item={item}
                rank={idx + 2}
                sessionId={sessionId}
              />
            ))}
          </Stack>
        </Box>
      )}

      {extended.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            size="large"
            fullWidth
            onClick={() => setExtendedOpen((v) => !v)}
            endIcon={extendedOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{
              minHeight: 52,
              fontSize: "1rem",
              fontWeight: 600,
              borderRadius: "28px",
            }}
          >
            {extendedOpen
              ? "Show fewer options"
              : `See ${extended.length} more option${extended.length !== 1 ? "s" : ""}`}
          </Button>
          <Collapse in={extendedOpen} unmountOnExit>
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              {extended.map((item, idx) => (
                <PlanItemRow
                  key={item.service_id}
                  item={item}
                  rank={idx + PLAN_PRIMARY_CAP + 1}
                  sessionId={sessionId}
                />
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}

      {beyondExtended > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ textAlign: "center", mb: 1 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1 }}
            >
              {beyondExtended} more service{beyondExtended !== 1 ? "s" : ""}{" "}
              matched
            </Typography>
            <Button
              size="small"
              onClick={onShowAll}
              sx={{ fontWeight: 600, textTransform: "none" }}
            >
              Browse all matches
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
