import type { ReactNode } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import FlowDiagram from "@/components/common/FlowDiagram";
import type { AboutInfo } from "@/lib/api";
import type { HowItWorksSection } from "./content";
import { DIAGRAMS_BY_SECTION } from "./diagrams";
import LiveFacts from "./LiveFacts";
import ProtectionList from "./ProtectionList";
import SafetyLayers from "./SafetyLayers";
import SectionLink, { type JumpHandler } from "./SectionLink";

/* ------------------------------------------------------------------ */
/*  One section: title, short summary and its visual stay open, so the */
/*  page scans quickly. The full points and the limits sit in two      */
/*  collapsed panels (opened for print by HowItWorks' print styles).   */
/* ------------------------------------------------------------------ */

/** Space kept above a heading scrolled into view, so the sticky app bar does not cover it. */
export const SCROLL_MARGIN = 96;

/** Comfortable line length for running text. */
export const READING_WIDTH = "75ch";

// Long file names and links may break anywhere, so no line forces the page wider than a 360 px screen.
const listSx = { m: 0, pl: 3, maxWidth: READING_WIDTH, "& > li": { mb: 0.75, overflowWrap: "anywhere" } } as const;

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Accordion
      disableGutters
      variant="outlined"
      sx={{ borderRadius: 1, "&::before": { display: "none" }, "& + &": { mt: 1 } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls={`${id}-content`} id={`${id}-header`}>
        <Typography component="span" variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails id={`${id}-content`}>{children}</AccordionDetails>
    </Accordion>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <Box component="ul" sx={listSx}>
      {items.map((item) => (
        <Typography component="li" variant="body1" key={item}>
          {item}
        </Typography>
      ))}
    </Box>
  );
}

function Sources({ paths, repoUrl }: { paths: string[]; repoUrl: string }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, overflowWrap: "anywhere" }}>
      Where this is in the code:{" "}
      {paths.map((path, i) => (
        <span key={path}>
          {i > 0 && ", "}
          {repoUrl ? (
            <Link href={`${repoUrl}/blob/main/${path}`} target="_blank" rel="noopener noreferrer">
              <code>{path}</code>
            </Link>
          ) : (
            <code>{path}</code>
          )}
        </span>
      ))}
    </Typography>
  );
}

export default function Section({
  section,
  about,
  repoUrl,
  onJump,
}: {
  section: HowItWorksSection;
  about: AboutInfo | null;
  repoUrl: string;
  onJump: JumpHandler;
}) {
  const diagram = DIAGRAMS_BY_SECTION[section.id];
  return (
    <Box
      component="section"
      aria-labelledby={section.id}
      sx={{ pt: 4, mb: 4, borderTop: 1, borderColor: "divider", breakInside: "avoid-page" }}
    >
      <Typography
        component="h2"
        variant="h5"
        id={section.id}
        tabIndex={-1}
        sx={{ fontWeight: 700, mb: 1.5, scrollMarginTop: SCROLL_MARGIN }}
      >
        {section.title}
      </Typography>
      <Typography variant="body1" sx={{ fontSize: "1.0625rem", maxWidth: READING_WIDTH, mb: 2 }}>
        {section.summary}
      </Typography>
      {section.id === "safety" && <SafetyLayers onJump={onJump} />}
      {about && <LiveFacts sectionId={section.id} about={about} />}
      {diagram && <FlowDiagram caption={diagram.caption} lanes={diagram.lanes} arrows={diagram.arrows} />}
      {section.id === "status" && <ProtectionList repoUrl={repoUrl} />}
      <Box sx={{ mt: 2 }}>
        <Panel id={`${section.id}-details`} title={`Details (${section.points.length})`}>
          <BulletList items={section.points} />
          <Sources paths={section.sources} repoUrl={repoUrl} />
        </Panel>
        <Panel id={`${section.id}-limits`} title={`Limits (${section.limits.length})`}>
          <BulletList items={section.limits} />
        </Panel>
      </Box>
      {section.related && section.related.length > 0 && (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          See also:{" "}
          {section.related.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <SectionLink id={id} onJump={onJump} />
            </span>
          ))}
        </Typography>
      )}
    </Box>
  );
}
