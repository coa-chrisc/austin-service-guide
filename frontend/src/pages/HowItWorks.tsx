import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import Infographic, { TECHNICAL_ID } from "./howItWorks/Infographic";
import { HERO, TECHNICAL_TITLE } from "./howItWorks/infographicCopy";
import LiveFacts from "./howItWorks/LiveFacts";
import Section, { READING_WIDTH, SCROLL_MARGIN } from "./howItWorks/Section";
import SectionLink, { type JumpHandler } from "./howItWorks/SectionLink";

/* ------------------------------------------------------------------ */
/*  /how-it-works and /admin/how-it-works. On top, an infographic for  */
/*  reviewers (copy in howItWorks/infographicCopy.ts); below it, the   */
/*  technical detail for IT and security reviewers (copy in            */
/*  howItWorks/content.ts, live settings from GET /api/v1/about).      */
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
      <Typography component="h3" id="contents" variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Jump to section
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
  const inConsole = useLocation().pathname.startsWith("/admin");
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
    <>
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
      {/* Full-width band on the resident site; a rounded banner inside the staff console's padded content. */}
      <Box
        sx={{
          bgcolor: "primary.dark",
          color: "primary.contrastText",
          textAlign: "center",
          px: 2,
          // Extra room below the text: the numbers card overlaps the bottom of this band.
          pt: { xs: 4, md: 5 },
          pb: { xs: 8, md: 10 },
          borderRadius: inConsole ? (t) => t.shape.radius.panel : 0,
        }}
      >
        <Typography
          component="h1"
          variant="h3"
          sx={{ fontWeight: 800, lineHeight: 1.15, mx: "auto", maxWidth: "68rem", fontSize: { xs: "1.875rem", sm: "2.5rem", md: "2.75rem" } }}
        >
          {HERO.title}
        </Typography>
        <Typography sx={{ mt: 1.5, mx: "auto", maxWidth: "50rem", fontSize: { xs: "1.0625rem", md: "1.25rem" } }}>
          {HERO.subtitle}
        </Typography>
      </Box>

      <Container maxWidth="lg" disableGutters={inConsole} sx={{ py: { xs: 4, md: 6 } }}>
        <Infographic onJump={onJump} />

        <Box component="section" aria-labelledby={TECHNICAL_ID} sx={{ pt: { xs: 4, md: 5 }, borderTop: 2, borderColor: "divider" }}>
          <Typography
            component="h2"
            variant="h4"
            id={TECHNICAL_ID}
            tabIndex={-1}
            sx={{ fontWeight: 700, mb: 1.5, scrollMarginTop: SCROLL_MARGIN, fontSize: { xs: "1.5rem", md: "1.875rem" } }}
          >
            {TECHNICAL_TITLE}
          </Typography>
          <Typography variant="body1" sx={{ mb: 1, maxWidth: READING_WIDTH }}>
            A technical overview for municipal IT, security reviewers, and coalition partners. Each section summarizes
            what runs in production today, with implementation details and current operational limits one click below.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Technical reference is published in English.
          </Typography>

          {state.status === "failed" && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              Live runtime telemetry could not be reached, so live configuration values (active model, voice mode,
              catalog counts) are hidden. Architectural specifications below still apply.
            </Alert>
          )}
          {state.status === "loading" && (
            <Typography variant="body2" color="text.secondary" role="status" sx={{ mb: 2 }}>
              Reading live deployment configuration...
            </Typography>
          )}
          {about && <LiveFacts sectionId="summary" about={about} headingLevel="h3" />}

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
                  <Typography component="h3" variant="h5" id="full-documents" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Primary engineering and security docs
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 1, maxWidth: READING_WIDTH }}>
                    This page summarizes the repository documentation below. If any detail diverges, the source code
                    and underlying policy files govern.
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
        </Box>
      </Container>
    </>
  );
}
