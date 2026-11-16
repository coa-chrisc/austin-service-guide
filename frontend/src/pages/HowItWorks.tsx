import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import GlobalStyles from "@mui/material/GlobalStyles";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { useBrandConfig } from "@/hooks/useBrandConfig";
import { getAbout, type AboutInfo } from "@/lib/api";
import { SECTIONS } from "./howItWorks/content";
import LiveFacts from "./howItWorks/LiveFacts";
import { KeyNumbers, OverviewCards } from "./howItWorks/Overview";
import Section, { READING_WIDTH, SCROLL_MARGIN } from "./howItWorks/Section";
import SectionLink, { type JumpHandler } from "./howItWorks/SectionLink";

/* ------------------------------------------------------------------ */
/*  /how-it-works and /admin/how-it-works: a plain-language account of */
/*  the system for reviewers. Copy lives in howItWorks/content.ts;     */
/*  live settings come from GET /api/v1/about.                         */
/* ------------------------------------------------------------------ */

const DOCUMENTS = [
  { label: "Security: SECURITY.md", path: "SECURITY.md" },
  { label: "Privacy: docs/PRIVACY.md", path: "docs/PRIVACY.md" },
  { label: "Architecture: ARCHITECTURE.md", path: "ARCHITECTURE.md" },
  { label: "Security assessment, 16 November 2026", path: "docs/SECURITY_ASSESSMENT_2026-11-16.md" },
  { label: "Security remediation plan", path: "docs/SECURITY_REMEDIATION_PLAN.md" },
];

/** Move focus to a section heading (it has tabIndex -1) and bring it into view. */
function focusSection(id: string): void {
  const heading = document.getElementById(id);
  if (!heading) return;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: "start" });
}

type AboutState = { status: "loading" } | { status: "ok"; about: AboutInfo } | { status: "failed" };

function Contents({ onJump }: { onJump: JumpHandler }) {
  return (
    <Box
      component="nav"
      aria-labelledby="contents"
      sx={{
        position: { lg: "sticky" },
        top: { lg: SCROLL_MARGIN },
        border: { xs: 1, lg: 0 },
        borderColor: "divider",
        borderRadius: 2,
        p: { xs: 2, lg: 0 },
      }}
    >
      <Typography component="h2" id="contents" variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        On this page
      </Typography>
      <Box
        component="ol"
        sx={{
          m: 0,
          pl: 3,
          columnCount: { xs: 1, sm: 2, lg: 1 },
          columnGap: 4,
          "& > li": { mb: 0.5, breakInside: "avoid" },
        }}
      >
        {SECTIONS.map((section) => (
          <Typography component="li" variant="body2" key={section.id}>
            <SectionLink id={section.id} onJump={onJump} />
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export default function HowItWorks() {
  const navigate = useNavigate();
  const repoUrl = useBrandConfig().serviceGuide.links.sourceRepoUrl;
  const [state, setState] = useState<AboutState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    getAbout()
      .then((about) => active && setState({ status: "ok", about }))
      .catch(() => active && setState({ status: "failed" }));
    return () => {
      active = false;
    };
  }, []);

  // A link such as /how-it-works#pii lands on that section's heading. Wait
  // for the settings call to settle: the summary box it adds moves the page.
  const handledHash = useRef(false);
  useEffect(() => {
    if (state.status === "loading" || handledHash.current) return;
    handledHash.current = true;
    const id = window.location.hash.slice(1);
    // Section ids are plain ASCII, so no decoding is needed.
    if (id) focusSection(id);
  }, [state.status]);

  const onJump: JumpHandler = (event, id) => {
    event.preventDefault();
    navigate({ hash: `#${id}` }, { replace: true, preventScrollReset: true });
    focusSection(id);
  };

  const about = state.status === "ok" ? state.about : null;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <GlobalStyles
        styles={{
          "@media print": {
            "header, nav, .MuiDrawer-root, .MuiAppBar-root": { display: "none !important" },
            // Print every collapsed Details and Limits panel open.
            ".MuiCollapse-root": { height: "auto !important", visibility: "visible !important" },
            ".MuiAccordionSummary-expandIconWrapper": { display: "none !important" },
          },
        }}
      />
      <Typography component="h1" variant="h4" sx={{ fontWeight: 700, mb: 1.5 }}>
        How the guide finds services and protects residents
      </Typography>
      <Typography variant="body1" sx={{ mb: 1, maxWidth: READING_WIDTH }}>
        For reviewers, city technology leaders and residents: what the guide does today, how it is built, what
        happens to resident data, how it uses AI, and where it goes next. Each section opens with a short summary;
        its details and known limits are one click below, and planned work is marked as planned.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        This page is in English only.
      </Typography>

      <OverviewCards onJump={onJump} />
      <KeyNumbers onJump={onJump} />

      {state.status === "failed" && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          This deployment's live settings could not be loaded, so the specific values (model, voice mode, catalog
          counts) are missing. The explanations below still apply.
        </Alert>
      )}
      {state.status === "loading" && (
        <Typography variant="body2" color="text.secondary" role="status" sx={{ mb: 2 }}>
          Loading this deployment's settings…
        </Typography>
      )}
      {about && <LiveFacts sectionId="summary" about={about} />}

      <Grid container spacing={{ xs: 3, lg: 5 }} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, lg: 3 }}>
          <Contents onJump={onJump} />
        </Grid>
        <Grid size={{ xs: 12, lg: 9 }}>
          {SECTIONS.map((section) => (
            <Section key={section.id} section={section} about={about} repoUrl={repoUrl} onJump={onJump} />
          ))}
          {repoUrl && (
            <Box
              component="section"
              aria-labelledby="full-documents"
              sx={{ pt: 4, mb: 4, borderTop: 1, borderColor: "divider" }}
            >
              <Typography component="h2" variant="h5" id="full-documents" sx={{ fontWeight: 700, mb: 1.5 }}>
                Read the full documents
              </Typography>
              <Typography variant="body1" sx={{ mb: 1, maxWidth: READING_WIDTH }}>
                This page is a plain-language summary of these files. Where they differ, the files and the code are
                correct and this page is out of date.
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 3 }}>
                {DOCUMENTS.map((doc) => (
                  <Typography component="li" variant="body1" key={doc.path}>
                    <Link href={`${repoUrl}/blob/main/${doc.path}`} target="_blank" rel="noopener noreferrer">
                      {doc.label}
                    </Link>
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
        </Grid>
      </Grid>
    </Container>
  );
}
