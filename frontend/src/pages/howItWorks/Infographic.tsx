import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import RouteOutlined from "@mui/icons-material/RouteOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { alpha, type Theme } from "@mui/material/styles";
import cityImg from "./images/city-swap.webp";
import cloudImg from "./images/cloud-hosting.webp";
import askImg from "./images/journey-ask.webp";
import mapImg from "./images/journey-map.webp";
import matchImg from "./images/journey-match.webp";
import privateImg from "./images/journey-private.webp";
import crisisImg from "./images/safety-crisis.webp";
import privacyImg from "./images/safety-privacy.webp";
import staffImg from "./images/safety-staff.webp";
import {
  CITY_CARDS,
  CITY_TITLE,
  CTA,
  JOURNEY,
  JOURNEY_TITLE,
  METRICS,
  METRICS_NOTE,
  METRICS_TITLE,
  ROADMAP,
  SAFETY_CARDS,
  SAFETY_TITLE,
  type ImageKey,
  type InfoCard,
} from "./infographicCopy";
import SectionLink, { type JumpHandler } from "./SectionLink";

/* ------------------------------------------------------------------ */
/*  The infographic between the hero and the technical detail: the     */
/*  resident journey, the safeguards, the numbers, then "any city"     */
/*  with the roadmap. Images carry the picture; the copy is in         */
/*  infographicCopy.ts.                                                */
/* ------------------------------------------------------------------ */

/** Hashed asset URLs; the How it works chunk loads on demand, so none of these is in the first load. */
const IMAGES: Record<ImageKey, string> = {
  "journey-ask": askImg,
  "journey-private": privateImg,
  "journey-match": matchImg,
  "journey-map": mapImg,
  "safety-privacy": privacyImg,
  "safety-crisis": crisisImg,
  "safety-staff": staffImg,
  "city-swap": cityImg,
  "cloud-hosting": cloudImg,
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
const cardSx = { height: "100%", p: { xs: 2, md: 2.5 }, display: "flex", gap: 2, "&:hover": { boxShadow: restingShadow } } as const;

function RowHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Typography
      component="h2"
      variant="h4"
      id={id}
      sx={{ fontWeight: 700, textAlign: "center", mb: { xs: 2, md: 3 }, fontSize: { xs: "1.5rem", md: "1.875rem" } }}
    >
      {children}
    </Typography>
  );
}

function CardImage({ card, sx }: { card: InfoCard; sx?: object }) {
  return (
    <Box
      component="img"
      src={IMAGES[card.image]}
      alt={card.alt}
      width={800}
      height={600}
      loading="lazy"
      decoding="async"
      sx={{
        display: "block",
        width: "100%",
        height: "auto",
        aspectRatio: "4 / 3",
        objectFit: "cover",
        borderRadius: (t: Theme) => t.shape.radius.control,
        bgcolor: (t: Theme) => t.palette.brand.subtle,
        flexShrink: 0,
        ...sx,
      }}
    />
  );
}

function CardTitle({ children, step }: { children: ReactNode; step?: number }) {
  return (
    <Typography
      component="h3"
      variant="h6"
      sx={{ fontWeight: 700, lineHeight: 1.3, display: "flex", alignItems: "flex-start", gap: 1 }}
    >
      {step != null && (
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            mt: "-1px",
            display: "inline-grid",
            placeItems: "center",
            width: 28,
            height: 28,
            borderRadius: "50%",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            fontSize: "0.9375rem",
          }}
        >
          {step}
        </Box>
      )}
      <span>{children}</span>
    </Typography>
  );
}

function CardText({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
      {children}
    </Typography>
  );
}

function Journey() {
  return (
    <Box component="section" aria-labelledby="journey-row" sx={{ mb: { xs: 5, md: 7 } }}>
      <RowHeading id="journey-row">{JOURNEY_TITLE}</RowHeading>
      <Grid component="ol" container spacing={{ xs: 2, md: 3 }} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {JOURNEY.map((card, i) => (
          <Grid component="li" key={card.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card sx={{ ...cardSx, flexDirection: "column" }}>
              <CardImage card={card} />
              <Box>
                <CardTitle step={i + 1}>{card.title}</CardTitle>
                <CardText>{card.text}</CardText>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function Safety() {
  return (
    <Box component="section" aria-labelledby="safety-row" sx={{ mb: { xs: 5, md: 7 } }}>
      <RowHeading id="safety-row">{SAFETY_TITLE}</RowHeading>
      <Grid component="ul" container spacing={{ xs: 2, md: 3 }} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {SAFETY_CARDS.map((card) => (
          <Grid component="li" key={card.title} size={{ xs: 12, md: 4 }}>
            {/* Image beside the text only where one card fills the row (tablet); above it elsewhere. */}
            <Card
              sx={{
                ...cardSx,
                flexDirection: { xs: "column", sm: "row", md: "column" },
                alignItems: { sm: "center", md: "stretch" },
              }}
            >
              <CardImage card={card} sx={{ width: { xs: "100%", sm: "40%", md: "100%" } }} />
              <Box sx={{ minWidth: 0 }}>
                <CardTitle>{card.title}</CardTitle>
                <CardText>{card.text}</CardText>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function Metrics() {
  const rule = (t: Theme) => alpha(t.palette.primary.contrastText, 0.35);
  return (
    <Box component="section" aria-labelledby="metrics-row" sx={{ mb: { xs: 5, md: 7 } }}>
      <Paper
        elevation={0}
        sx={{
          bgcolor: "primary.main",
          color: "primary.contrastText",
          p: { xs: 2.5, md: 3 },
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          alignItems: { lg: "center" },
          gap: { xs: 2, lg: 0 },
        }}
      >
        <Typography
          component="h2"
          variant="h6"
          id="metrics-row"
          sx={{ fontWeight: 700, lineHeight: 1.25, flex: { lg: "0 0 11rem" }, pr: { lg: 3 } }}
        >
          {METRICS_TITLE}
        </Typography>
        <Box
          component="ul"
          sx={{
            listStyle: "none",
            m: 0,
            p: 0,
            flex: 1,
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" },
            rowGap: 2.5,
          }}
        >
          {METRICS.map((m) => (
            <Box
              component="li"
              key={m.label}
              sx={{ px: { xs: 0, md: 2.5 }, borderLeft: { md: 1 }, borderColor: { md: rule }, minWidth: 0 }}
            >
              <Typography
                component="p"
                sx={{ fontSize: { xs: "1.75rem", md: "2rem" }, fontWeight: 700, lineHeight: 1.15, whiteSpace: "nowrap" }}
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
              <Typography variant="body2" sx={{ mt: 0.25 }}>
                {m.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: { xs: "left", md: "right" } }}>
        {METRICS_NOTE}
      </Typography>
    </Box>
  );
}

function Roadmap({ onJump }: { onJump: JumpHandler }) {
  return (
    <Card sx={{ ...cardSx, flexDirection: "column" }}>
      <Box>
        <Chip
          size="small"
          color="primary"
          variant="outlined"
          icon={<RouteOutlined aria-hidden="true" />}
          label={ROADMAP.statusLabel}
          sx={{ fontWeight: 700, mb: 1 }}
        />
        <CardTitle>{ROADMAP.title}</CardTitle>
      </Box>
      <Box component="ul" sx={{ m: 0, pl: 3, "& > li": { mb: 0.5 } }}>
        {ROADMAP.items.map((item) => (
          <Typography component="li" variant="body1" key={item}>
            {item}
          </Typography>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary">
        {ROADMAP.note} <SectionLink id="status" onJump={onJump} label={ROADMAP.noteLink} />
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: "auto", pt: 1 }}>
        <Button component={RouterLink} to="/" variant="contained" disableElevation>
          {CTA.primary}
        </Button>
        <Button variant="outlined" href={`#${TECHNICAL_ID}`} onClick={(e) => onJump(e, TECHNICAL_ID)}>
          {CTA.secondary}
        </Button>
      </Box>
    </Card>
  );
}

function AnyCity({ onJump }: { onJump: JumpHandler }) {
  return (
    <Box component="section" aria-labelledby="city-row" sx={{ mb: { xs: 5, md: 7 } }}>
      <RowHeading id="city-row">{CITY_TITLE}</RowHeading>
      <Grid container spacing={{ xs: 2, md: 3 }}>
        {CITY_CARDS.map((card) => (
          <Grid key={card.title} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card sx={{ ...cardSx, flexDirection: "column" }}>
              <CardImage card={card} />
              <Box>
                <CardTitle>{card.title}</CardTitle>
                <CardText>{card.text}</CardText>
              </Box>
            </Card>
          </Grid>
        ))}
        <Grid size={{ xs: 12, md: 4 }}>
          <Roadmap onJump={onJump} />
        </Grid>
      </Grid>
    </Box>
  );
}

export default function Infographic({ onJump }: { onJump: JumpHandler }) {
  return (
    <>
      <Journey />
      <Safety />
      <Metrics />
      <AnyCity onJump={onJump} />
    </>
  );
}
