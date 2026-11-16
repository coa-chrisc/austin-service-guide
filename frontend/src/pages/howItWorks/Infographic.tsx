import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import type { SvgIconComponent } from "@mui/icons-material";
import RouteOutlined from "@mui/icons-material/RouteOutlined";
import VerifiedOutlined from "@mui/icons-material/VerifiedOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { alpha, type Theme } from "@mui/material/styles";
import { resolveTextOn } from "@/theme/contrast";
import cityImg from "./images/city-swap.webp";
import cloudImg from "./images/cloud-hosting.webp";
import askImg from "./images/journey-ask.webp";
import mapImg from "./images/journey-map.webp";
import matchImg from "./images/journey-match.webp";
import crisisImg from "./images/safety-crisis.webp";
import privacyImg from "./images/safety-privacy.webp";
import staffImg from "./images/safety-staff.webp";
import {
  CTA,
  JOURNEY,
  METRICS,
  METRICS_TITLE,
  ROADMAP,
  SAFETY,
  SCALE,
  type CardIcon,
  type ImageKey,
  type InfoCard,
  type InfoRow,
} from "./infographicCopy";
import type { JumpHandler } from "./SectionLink";

/* ------------------------------------------------------------------ */
/*  The infographic between the hero and the technical detail: the     */
/*  numbers (a band that overlaps the hero), the three-step resident   */
/*  journey, why it is safe and why it scales (side by side on a wide  */
/*  screen), then the roadmap bar with the two buttons. The copy is in */
/*  infographicCopy.ts.                                                */
/* ------------------------------------------------------------------ */

/** Hashed asset URLs; the How it works chunk loads on demand, so none of these is in the first load. */
const IMAGES: Record<ImageKey, string> = {
  "journey-ask": askImg,
  "journey-match": matchImg,
  "journey-map": mapImg,
  "safety-privacy": privacyImg,
  "safety-crisis": crisisImg,
  "safety-staff": staffImg,
  "city-swap": cityImg,
  "cloud-hosting": cloudImg,
};

/** Decorative: the card title beside the icon carries the meaning. */
const ICONS: Record<CardIcon, SvgIconComponent> = {
  verified: VerifiedOutlined,
};

/** The id of the technical detail heading; the secondary button jumps to it. */
export const TECHNICAL_ID = "technical-detail";

const visuallyHidden = {
  position: "absolute",
  // Strings, not numbers: in sx a width of 1 means 100%.
  width: "1px",
  height: "1px",
  margin: "-1px",
  p: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

// These cards are not links, so they keep the theme card's resting shadow on hover.
const restingShadow = (t: Theme) => `0 2px 8px ${alpha(t.palette.brand.ink, 0.08)}`;
const rowGap = { mb: { xs: 4, md: 5 } } as const;
const listSx = { listStyle: "none", m: 0, p: 0 } as const;

/** Primary text on the roadmap's subtle fill, or body text where primary misses AA (dark mode). */
const onSubtle = (t: Theme) =>
  resolveTextOn(t.palette.brand.subtle, [
    { role: "primary", color: t.palette.primary.main },
    { role: "body", color: t.palette.text.primary },
  ]).color;

type Responsive = string | Partial<Record<"xs" | "sm" | "md" | "lg", string>>;

/** Card text, with the parts between asterisks in italics. */
function CardText({ text }: { text: string }) {
  return (
    <>
      {text.split("*").map((part, i) => (i % 2 === 1 ? <em key={i}>{part}</em> : part))}
    </>
  );
}

function RowHeading({ row, id, align = "center" }: { row: InfoRow; id: string; align?: "center" | "left" }) {
  return (
    <Box sx={{ textAlign: align, mb: { xs: 2, md: 2.5 } }}>
      <Typography component="h2" variant="h4" id={id} sx={{ fontWeight: 700, fontSize: { xs: "1.5rem", md: "1.75rem" } }}>
        {row.title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5, fontSize: { xs: "1rem", md: "1.0625rem" } }}>
        {row.subtitle}
      </Typography>
    </Box>
  );
}

function CardTitle({ children, step }: { children: ReactNode; step?: number }) {
  return (
    <Typography
      component="h3"
      variant="h6"
      sx={{
        fontWeight: 700,
        lineHeight: 1.3,
        fontSize: { xs: "1.0625rem", sm: "1.125rem" },
        overflowWrap: "anywhere",
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
      }}
    >
      {step != null && (
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            mt: "-2px",
            display: "inline-grid",
            placeItems: "center",
            width: 26,
            height: 26,
            borderRadius: "50%",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            fontSize: "0.875rem",
          }}
        >
          {step}
        </Box>
      )}
      <span>{children}</span>
    </Typography>
  );
}

/** The card's picture, or its icon in a tinted circle on a panel the same size as a picture. */
function CardVisual({ card, width }: { card: InfoCard; width: Responsive }) {
  const frame = {
    display: "block",
    width,
    height: "auto",
    aspectRatio: "4 / 3",
    borderRadius: (t: Theme) => t.shape.radius.control,
    bgcolor: (t: Theme) => t.palette.brand.subtle,
    flexShrink: 0,
  } as const;
  if ("image" in card) {
    return (
      <Box
        component="img"
        src={IMAGES[card.image]}
        alt={card.alt}
        width={800}
        height={600}
        loading="lazy"
        decoding="async"
        sx={{ ...frame, objectFit: "cover" }}
      />
    );
  }
  const Icon = ICONS[card.icon];
  return (
    <Box sx={{ ...frame, display: "grid", placeItems: "center" }}>
      <Box
        sx={{
          height: "72%",
          aspectRatio: "1",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.12),
          color: "primary.main",
        }}
      >
        <Icon aria-hidden="true" sx={{ fontSize: { xs: "2rem", sm: "3rem" } }} />
      </Box>
    </Box>
  );
}

/** The numbers, in a card that sits half on the hero band above it. */
function Metrics() {
  return (
    <Box
      component="section"
      aria-labelledby="metrics-row"
      // Pulls the card over the hero: past the container's top padding and a little more.
      sx={{ mt: { xs: -8, md: -11 }, mb: { xs: 4, md: 5 }, position: "relative" }}
    >
      <Typography component="h2" id="metrics-row" sx={visuallyHidden}>
        {METRICS_TITLE}
      </Typography>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          border: 1,
          borderColor: "divider",
          boxShadow: (t: Theme) => `0 8px 24px ${alpha(t.palette.brand.ink, 0.16)}`,
        }}
      >
        <Box
          component="ul"
          sx={{
            ...listSx,
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              sm: "repeat(2, minmax(0, 1fr))",
              md: "repeat(3, minmax(0, 1fr))",
              lg: "repeat(5, minmax(0, 1fr))",
            },
            columnGap: { xs: 3, lg: 0 },
            rowGap: { xs: 2, md: 2.5 },
          }}
        >
          {METRICS.map((m, i) => (
            <Box
              component="li"
              key={m.label}
              sx={{
                minWidth: 0,
                px: { lg: 2.5 },
                pt: { xs: i > 0 ? 2 : 0, sm: 0 },
                borderTop: { xs: i > 0 ? 1 : 0, sm: 0 },
                borderLeft: { lg: i > 0 ? 1 : 0 },
                borderColor: "divider",
                "&:first-of-type": { pl: { lg: 0.5 } },
              }}
            >
              {/* On a phone the label sits beside the number to save a line. */}
              <Box sx={{ display: "flex", flexDirection: { xs: "row", sm: "column" }, flexWrap: "wrap", alignItems: { xs: "baseline", sm: "flex-start" }, columnGap: 1.5 }}>
                <Typography
                  component="p"
                  sx={{ color: "primary.main", fontSize: { xs: "1.875rem", md: "2.25rem" }, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap" }}
                >
                  {m.spoken ? (
                    <>
                      <span aria-hidden="true">{m.value}</span>
                      <Box component="span" sx={visuallyHidden}>
                        {m.spoken}
                      </Box>
                    </>
                  ) : (
                    m.value
                  )}
                </Typography>
                <Typography variant="body1" sx={{ mt: { sm: 0.5 }, fontWeight: 700, lineHeight: 1.3 }}>
                  {m.label}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.875rem", lineHeight: 1.45 }}>
                {m.text}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}

function Journey() {
  return (
    <Box component="section" aria-labelledby="journey-row" sx={rowGap}>
      <RowHeading row={JOURNEY} id="journey-row" />
      <Grid component="ol" container spacing={{ xs: 1.5, md: 2.5 }} sx={listSx}>
        {JOURNEY.cards.map((card, i) => (
          <Grid component="li" key={card.title} size={{ xs: 12, md: 4 }}>
            {/* Picture beside the text on a phone or tablet; the three steps sit in one row from md up. */}
            <Card
              sx={{
                height: "100%",
                p: { xs: 1.5, sm: 2 },
                display: "flex",
                flexDirection: { xs: "row", md: "column" },
                alignItems: { xs: "center", md: "stretch" },
                gap: 2,
                "&:hover": { boxShadow: restingShadow },
              }}
            >
              <CardVisual card={card} width={{ xs: "34%", sm: "28%", md: "100%" }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <CardTitle step={i + 1}>{card.title}</CardTitle>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, fontSize: "0.9375rem", lineHeight: 1.5 }}>
                  <CardText text={card.text} />
                </Typography>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

/** A panel with a heading and a list: a small picture beside a bold title and a short line. */
function ListPanel({ row, id }: { row: InfoRow; id: string }) {
  return (
    <Paper
      component="section"
      aria-labelledby={id}
      variant="outlined"
      sx={{ height: "100%", p: { xs: 2, md: 3 }, borderRadius: (t: Theme) => t.shape.radius.panel }}
    >
      <RowHeading row={row} id={id} align="left" />
      <Box component="ul" sx={{ ...listSx, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: { xs: 2, md: 2.5 } }}>
        {row.cards.map((card, i) => (
          <Box
            component="li"
            key={card.title}
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              gap: { xs: 1.5, sm: 2.5 },
              pt: i > 0 ? { xs: 2, md: 2.5 } : 0,
              borderTop: i > 0 ? 1 : 0,
              borderColor: "divider",
            }}
          >
            <CardVisual card={card} width={{ xs: "96px", sm: "140px" }} />
            <Box sx={{ minWidth: 0, flex: "1 1 8rem" }}>
              <CardTitle>{card.title}</CardTitle>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.9375rem", lineHeight: 1.5 }}>
                <CardText text={card.text} />
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function SafetyAndScale() {
  return (
    <Grid container spacing={{ xs: 3, lg: 3 }} sx={rowGap}>
      <Grid size={{ xs: 12, lg: 6 }}>
        <ListPanel row={SAFETY} id="safety-row" />
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <ListPanel row={SCALE} id="scale-row" />
      </Grid>
    </Grid>
  );
}

/** A button with a short note under it; the note is also the button's description. */
function NotedButton({ note, noteId, children }: { note: string; noteId: string; children: ReactNode }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
      {children}
      <Typography id={noteId} variant="caption" color="text.secondary">
        {note}
      </Typography>
    </Box>
  );
}

/** The Phase 2 roadmap line, with the page's two buttons. */
function Roadmap({ onJump }: { onJump: JumpHandler }) {
  return (
    <Box component="section" aria-labelledby="roadmap-row" sx={{ mb: { xs: 5, md: 6 } }}>
      <Paper
        elevation={0}
        sx={{
          bgcolor: (t: Theme) => t.palette.brand.subtle,
          border: 1,
          borderColor: "divider",
          p: { xs: 2, md: 3 },
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { md: "center" },
          gap: { xs: 2.5, md: 4 },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="h2"
            variant="h5"
            id="roadmap-row"
            sx={{ fontWeight: 700, lineHeight: 1.25, overflowWrap: "anywhere", display: "flex", alignItems: "center", gap: 1, fontSize: { xs: "1.25rem", md: "1.375rem" } }}
          >
            <RouteOutlined aria-hidden="true" color="primary" />
            {ROADMAP.title}
          </Typography>
          <Typography variant="body1" sx={{ mt: 0.75 }}>
            {ROADMAP.subtitle}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 2, flexShrink: 0 }}>
          <NotedButton note={CTA.primaryNote} noteId="cta-primary-note">
            <Button component={RouterLink} to="/" variant="contained" disableElevation aria-describedby="cta-primary-note">
              {CTA.primary}
            </Button>
          </NotedButton>
          <NotedButton note={CTA.secondaryNote} noteId="cta-secondary-note">
            <Button
              variant="outlined"
              href={`#${TECHNICAL_ID}`}
              onClick={(e) => onJump(e, TECHNICAL_ID)}
              aria-describedby="cta-secondary-note"
              sx={{ color: onSubtle }}
            >
              {CTA.secondary}
            </Button>
          </NotedButton>
        </Box>
      </Paper>
    </Box>
  );
}

export default function Infographic({ onJump }: { onJump: JumpHandler }) {
  return (
    <>
      <Metrics />
      <Journey />
      <SafetyAndScale />
      <Roadmap onJump={onJump} />
    </>
  );
}
