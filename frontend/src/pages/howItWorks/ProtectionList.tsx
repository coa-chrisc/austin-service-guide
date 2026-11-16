import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { PROTECTIONS, STATUS_LABELS, type ProtectionStatus } from "./content";

const ORDER: ProtectionStatus[] = ["in_place", "in_progress", "not_planned"];

/** Section 9's status list, grouped by status. The status of each item lives in content.ts. */
export default function ProtectionList({ repoUrl }: { repoUrl: string }) {
  return (
    <Box sx={{ my: 2 }}>
      {ORDER.map((status) => {
        const items = PROTECTIONS.filter((p) => p.status === status);
        if (!items.length) return null;
        return (
          <Box key={status} sx={{ mb: 2 }}>
            <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
              {STATUS_LABELS[status]}
              {status === "in_progress" && " (not yet active in this deployment)"}
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3 }}>
              {items.map((item) => (
                <Typography component="li" variant="body1" key={item.label}>
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
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
