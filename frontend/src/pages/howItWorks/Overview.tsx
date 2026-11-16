import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { KEY_NUMBERS, KEY_NUMBERS_NOTE, OVERVIEW } from "./content";
import { ICONS } from "./icons";
import SectionLink, { type JumpHandler } from "./SectionLink";

/* ------------------------------------------------------------------ */
/*  The top of the page: one card per topic, then the key numbers.     */
/*  Both fit as many columns as there is room for (one card or two     */
/*  number tiles per row at 360 px).                                   */
/* ------------------------------------------------------------------ */

export function OverviewCards({ onJump }: { onJump: JumpHandler }) {
  return (
    <Box component="section" aria-labelledby="overview" sx={{ mb: 4 }}>
      <Typography component="h2" variant="h6" id="overview" sx={{ fontWeight: 700, mb: 1.5 }}>
        In one minute
      </Typography>
      {/* Wrapping flex row, not a grid: the cards share one row on a wide screen, and a short last
          row stretches instead of leaving one card alone in a column. */}
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexWrap: "wrap", gap: 2 }}>
        {OVERVIEW.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <Paper
              component="li"
              variant="outlined"
              key={item.label}
              sx={{ flex: "1 1 12rem", p: 2, display: "flex", flexDirection: "column", gap: 1, borderRadius: 2 }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Icon color="primary" aria-hidden="true" />
                <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {item.label}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {item.text}
              </Typography>
              <Typography variant="body2">
                <SectionLink id={item.section} onJump={onJump} label={`More on ${item.label.toLowerCase()}`} />
              </Typography>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}

export function KeyNumbers({ onJump }: { onJump: JumpHandler }) {
  return (
    <Box component="section" aria-labelledby="key-numbers" sx={{ mb: 4 }}>
      <Typography component="h2" variant="h6" id="key-numbers" sx={{ fontWeight: 700, mb: 1.5 }}>
        Key numbers, and why they matter to residents
      </Typography>
      <Box
        component="ul"
        sx={{
          listStyle: "none",
          m: 0,
          p: 0,
          display: "grid",
          gap: 2,
          gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
        }}
      >
        {KEY_NUMBERS.map((n) => (
          <Paper component="li" variant="outlined" key={n.label} sx={{ p: 2, borderRadius: 2 }}>
            <Typography sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem" }, fontWeight: 700, lineHeight: 1.2, color: "primary.main" }}>
              {n.value}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              <SectionLink id={n.section} onJump={onJump} label={n.label} />
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {n.why}
            </Typography>
          </Paper>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {KEY_NUMBERS_NOTE}
      </Typography>
    </Box>
  );
}
