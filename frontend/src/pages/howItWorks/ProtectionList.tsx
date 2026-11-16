import type { SvgIconComponent } from "@mui/icons-material";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import RouteOutlined from "@mui/icons-material/RouteOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { PROTECTIONS, STATUS_LABELS, type ProtectionStatus } from "./content";

const ORDER: ProtectionStatus[] = ["in_place", "in_progress", "not_planned"];

/** How each status looks. The label text always carries the status, so color is never the only cue. */
const STYLE: Record<ProtectionStatus, { color: "success" | "warning" | "default"; Icon: SvgIconComponent; note?: string }> = {
  in_place: { color: "success", Icon: CheckCircleOutline },
  in_progress: { color: "warning", Icon: ScheduleOutlined, note: "Not yet active in this deployment" },
  not_planned: { color: "default", Icon: RouteOutlined, note: "Planned next steps. None of them is built yet." },
};

/** The status list (in place, in progress, Phase 2 roadmap), one card per status. Each item's status lives in content.ts. */
export default function ProtectionList({ repoUrl }: { repoUrl: string }) {
  return (
    <Box sx={{ my: 2, display: "grid", gap: 2 }}>
      {ORDER.map((status) => {
        const items = PROTECTIONS.filter((p) => p.status === status);
        if (!items.length) return null;
        const { color, Icon, note } = STYLE[status];
        return (
          <Paper key={status} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 1 }}>
              <Typography component="h4" variant="subtitle1" sx={{ fontWeight: 700 }}>
                <Chip
                  icon={<Icon aria-hidden="true" />}
                  label={`${STATUS_LABELS[status]} (${items.length})`}
                  color={color}
                  variant="outlined"
                  // A long status label wraps inside the chip instead of being cut off on a narrow screen.
                  sx={{ fontWeight: 700, fontSize: "inherit", height: "auto", minHeight: 32, "& .MuiChip-label": { whiteSpace: "normal" } }}
                />
              </Typography>
              {note && (
                <Typography variant="body2" color="text.secondary">
                  {note}
                </Typography>
              )}
            </Box>
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 1 }}>
              {items.map((item) => (
                <Box component="li" key={item.label} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <Icon fontSize="small" color={color === "default" ? "action" : color} aria-hidden="true" sx={{ mt: 0.25 }} />
                  <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {item.label}
                    {item.issue != null && (
                      <>
                        {" "}
                        (
                        {repoUrl ? (
                          <Link href={`${repoUrl}/issues/${item.issue}`} target="_blank" rel="noopener noreferrer">
                            issue #{item.issue}
                          </Link>
                        ) : (
                          `issue #${item.issue}`
                        )}
                        )
                      </>
                    )}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
