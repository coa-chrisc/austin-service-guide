import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { SAFETY_LAYERS } from "./content";
import { ICONS } from "./icons";
import SectionLink, { type JumpHandler } from "./SectionLink";

/** The safeguards as an icon list: two columns where there is room, one at 360 px. */
export default function SafetyLayers({ onJump }: { onJump: JumpHandler }) {
  return (
    <Box
      component="ul"
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        my: 2,
        display: "grid",
        columnGap: 3,
        rowGap: 2.5,
        gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
      }}
    >
      {SAFETY_LAYERS.map((layer) => {
        const Icon = ICONS[layer.icon];
        return (
          <Box component="li" key={layer.title} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
            <Box
              sx={{
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: 1,
                borderColor: "divider",
                color: "primary.main",
              }}
            >
              <Icon fontSize="small" aria-hidden="true" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h4" variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {layer.title}
              </Typography>
              <Typography variant="body2">{layer.text}</Typography>
              {layer.section && (
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  See <SectionLink id={layer.section} onJump={onJump} />
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
