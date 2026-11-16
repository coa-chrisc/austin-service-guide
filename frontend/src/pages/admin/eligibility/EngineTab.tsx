import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import type { EngineConstants } from "../../../lib/adminEligibility";

const WEIGHT_LABEL: Record<string, string> = {
  category_overlap_each: "Each category that matches a need",
  category_overlap_max: "Most points from category matches",
  need_keyword: "Each need word found in the name or description",
  language: "Offered in a language the resident speaks",
  low_income_free: "Free or sliding-scale service, low income bracket",
  same_zip: "A location in the resident's ZIP",
  same_zip3: "A location sharing the ZIP's first three digits",
  veteran: "Veterans category, resident is a veteran",
  disability: "Disability category, resident has a disability",
};

const BAND_LABEL: Record<string, string> = {
  keep_above: "Score needed to be listed at all",
  high: "Score for high confidence",
  medium: "Score for medium confidence",
  unconfirmed_cap: "Highest score while a gate is unconfirmed",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function KeyValues({ rows }: { rows: [string, string | number][] }) {
  return (
    <Table size="small">
      <TableBody>
        {rows.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell>{k}</TableCell>
            <TableCell align="right">{v}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Layer 3: constants built into the engine. Read-only. */
export default function EngineTab({ engine }: { engine: EngineConstants }) {
  const needsByCategory: Record<string, string[]> = {};
  for (const [word, cats] of Object.entries(engine.need_keywords)) {
    for (const c of cats) (needsByCategory[c] ??= []).push(word);
  }
  return (
    <Stack spacing={3}>
      <Alert severity="info" variant="outlined">
        These values are built into the matching engine ({engine.source}).
        Changing these needs a code change; this page only shows them.
      </Alert>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Section title="Score points">
            <KeyValues rows={Object.entries(engine.score_weights).map(([k, v]) => [WEIGHT_LABEL[k] ?? k, v])} />
          </Section>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Section title="Cut-offs">
            <KeyValues
              rows={[
                ...Object.entries(engine.bands).map(([k, v]) => [BAND_LABEL[k] ?? k, v] as [string, number]),
                ["Most services listed (crisis services not counted)", engine.max_matches],
              ]}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Low income brackets: {engine.low_income_brackets.join(", ")}.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Age bands: older adult {engine.age_bands.older_adult?.[0]}+, youth{" "}
              {engine.age_bands.youth?.[0]} to {engine.age_bands.youth?.[1]}. They are compared
              with the age range the resident gives, never an exact age.
            </Typography>
          </Section>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Section title="Need words and the categories they match">
            <Stack spacing={1}>
              {Object.entries(needsByCategory).map(([cat, words]) => (
                <Stack key={cat} direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
                  <Typography variant="body2" fontWeight={600} sx={{ minWidth: 140 }}>
                    {cat}
                  </Typography>
                  {words.map((w) => (
                    <Chip key={w} size="small" variant="outlined" label={w} />
                  ))}
                </Stack>
              ))}
            </Stack>
          </Section>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Section title="Plan order">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Higher numbers come first in the resident's plan. Categories not
              listed say "{engine.default_sequence_reason}"
            </Typography>
            <Table size="small">
              <TableBody>
                {Object.entries(engine.sequence_priority).map(([cat, n]) => (
                  <TableRow key={cat}>
                    <TableCell>{cat}</TableCell>
                    <TableCell>{n}</TableCell>
                    <TableCell>{engine.sequence_reasons[cat] ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </Grid>
      </Grid>
    </Stack>
  );
}
