import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import StartHereHero from "./StartHereHero";
import PlanItemRow from "./PlanItemRow";
import MoreServices from "./MoreServices";
import type { ApplicationOrderItem } from "@/lib/api";
import type { ServiceMatch } from "@/types";
import { otherMatches, planSteps } from "@/lib/planSteps";
import { makeResultsT } from "@/lib/resultsI18n";

interface PlanListProps {
  items: ApplicationOrderItem[];
  matches: ServiceMatch[];
  /** Opened from the resident's plan: detail pages link back to it. */
  fromPlan?: boolean;
  language?: string;
}

/**
 * The plan: a short ordered set of steps (planSteps caps it), then every
 * other match in a collapsed "More services that may help" section.
 */
export default function PlanList({
  items,
  matches,
  fromPlan,
  language,
}: PlanListProps) {
  const t = makeResultsT(language);
  const steps = planSteps(items);
  const topItem = steps[0];
  if (!topItem) return null;

  const topMatch = matches.find((m) => m.service.id === topItem.service_id);
  const rest = steps.slice(1);

  return (
    <Box>
      <StartHereHero
        topItem={topItem}
        topMatch={topMatch}
        fromPlan={fromPlan}
        language={language}
      />

      {rest.length > 0 && (
        <Box sx={{ mt: 1, mb: 3 }}>
          <Typography
            variant="overline"
            component="h2"
            sx={{ display: "block", color: "text.secondary", mb: 1 }}
          >
            {t("then_these")}
          </Typography>
          <Stack component="ol" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
            {rest.map((item, idx) => (
              <li key={item.service_id}>
                <PlanItemRow item={item} rank={idx + 2} fromPlan={fromPlan} />
              </li>
            ))}
          </Stack>
        </Box>
      )}

      <MoreServices matches={otherMatches(matches, steps)} language={language} />
    </Box>
  );
}
