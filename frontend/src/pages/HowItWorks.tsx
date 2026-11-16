import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import GlobalStyles from "@mui/material/GlobalStyles";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import FlowDiagram from "@/components/common/FlowDiagram";
import { useBrandConfig } from "@/hooks/useBrandConfig";
import { getAbout, type AboutInfo } from "@/lib/api";
import { SECTIONS, type HowItWorksSection } from "./howItWorks/content";
import { DIAGRAMS_BY_SECTION } from "./howItWorks/diagrams";
import LiveFacts from "./howItWorks/LiveFacts";
import ProtectionList from "./howItWorks/ProtectionList";

/* ------------------------------------------------------------------ */
/*  /how-it-works and /admin/how-it-works: a plain-language account of */
/*  the system for reviewers. Copy lives in howItWorks/content.ts;     */
/*  live settings come from GET /api/v1/about.                         */
/* ------------------------------------------------------------------ */

const DOCUMENTS = [
  { label: "Security: SECURITY.md", path: "SECURITY.md" },
  { label: "Privacy: docs/PRIVACY.md", path: "docs/PRIVACY.md" },
  { label: "Architecture: ARCHITECTURE.md", path: "ARCHITECTURE.md" },
];

/** Space kept above a heading scrolled into view, so the sticky app bar does not cover it. */
const SCROLL_MARGIN = 96;

/** Move focus to a section heading (it has tabIndex -1) and bring it into view. */
function focusSection(id: string): void {
  const heading = document.getElementById(id);
  if (!heading) return;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: "start" });
}

type AboutState = { status: "loading" } | { status: "ok"; about: AboutInfo } | { status: "failed" };

function Section({ section, about, repoUrl }: { section: HowItWorksSection; about: AboutInfo | null; repoUrl: string }) {
  const diagram = DIAGRAMS_BY_SECTION[section.id];
  return (
    <Box component="section" aria-labelledby={section.id} sx={{ mb: 6, breakInside: "avoid-page" }}>
      <Typography
        component="h2"
        variant="h5"
        id={section.id}
        tabIndex={-1}
        sx={{ fontWeight: 700, mb: 1, scrollMarginTop: SCROLL_MARGIN }}
      >
        {section.title}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 600, mb: 1.5 }}>
        {section.summary}
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 3, "& > li": { mb: 0.75 } }}>
        {section.points.map((point) => (
          <Typography component="li" variant="body1" key={point}>
            {point}
          </Typography>
        ))}
      </Box>
      {about && <LiveFacts sectionId={section.id} about={about} />}
      {diagram && <FlowDiagram caption={diagram.caption} lanes={diagram.lanes} arrows={diagram.arrows} />}
      {section.id === "security" && <ProtectionList repoUrl={repoUrl} />}
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700, mt: 2 }}>
        Limits
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 3, "& > li": { mb: 0.75 } }}>
        {section.limits.map((limit) => (
          <Typography component="li" variant="body1" key={limit}>
            {limit}
          </Typography>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, overflowWrap: "anywhere" }}>
        Where this is in the code:{" "}
        {section.sources.map((path, i) => (
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

  const onTocClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
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
          },
        }}
      />
      <Typography component="h1" variant="h4" sx={{ fontWeight: 700, mb: 1.5 }}>
        How this guide works
      </Typography>
      <Typography variant="body1" sx={{ mb: 1, maxWidth: 760 }}>
        What happens to what a resident types or says, what the guide keeps, how it uses AI, and what it does not
        protect against. Each section ends with its limits and the files in the code where it happens.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This page is in English only.
      </Typography>

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

      <Grid container spacing={{ xs: 2, md: 4 }} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Box
            component="nav"
            aria-label="On this page"
            sx={{ position: { md: "sticky" }, top: { md: SCROLL_MARGIN } }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              On this page
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 3, "& > li": { mb: 0.5 } }}>
              {SECTIONS.map((section) => (
                <Typography component="li" variant="body2" key={section.id}>
                  <Link href={`#${section.id}`} onClick={(e) => onTocClick(e, section.id)}>
                    {section.title}
                  </Link>
                </Typography>
              ))}
            </Box>
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 9 }}>
          {SECTIONS.map((section) => (
            <Section key={section.id} section={section} about={about} repoUrl={repoUrl} />
          ))}
          {repoUrl && (
            <Box component="section" aria-labelledby="full-documents" sx={{ mb: 4 }}>
              <Typography component="h2" variant="h5" id="full-documents" sx={{ fontWeight: 700, mb: 1 }}>
                Read the full documents
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
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
