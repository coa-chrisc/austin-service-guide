import Chip from "@mui/material/Chip";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";

/** Shown whenever this deployment streams raw voice audio to OpenAI. */
export default function RawAudioBadge() {
  return (
    <Chip
      icon={<GraphicEqIcon />}
      label="Raw audio streamed to OpenAI"
      size="small"
      variant="outlined"
      sx={{
        fontWeight: 600,
        color: "warning.dark",
        borderColor: "warning.main",
        "& .MuiChip-icon": { color: "warning.dark" },
      }}
    />
  );
}
