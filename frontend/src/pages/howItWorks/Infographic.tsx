import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import RouteOutlined from "@mui/icons-material/RouteOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
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
import type { JumpHandler } from "./SectionLink";

/* ------------------------------------------------------------------ */
/*  The infographic between the hero and the technical detail: the     */
/*  numbers (a band that overlaps the hero), the resident journey, why */
/*  it is safe, why it scales, then the roadmap with the two buttons.  */
/*  Sized so the hero, the numbers and the journey fit one desktop     */
/*  screen. The copy is in infographicCopy.ts.                         */
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
const cardSx = { height: "100%", p: { xs: 1.5, sm: 2 }, display: "flex", gap: 2, "&:hover": { boxShadow: restingShadow } } as const;
const rowGap = { mb: { xs: 4, md: 5 } } as const;

type Responsive = string | Partial<Record<"xs" | "sm" | "md" | "lg", string>>;

function RowHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Typography
      component="h2"
      variant="h4"
      id={id}
      sx={{ fontWeight: 700, textAlign: "center", mb: { xs: 2, md: 2.5 }, fontSize: { xs: "1.5rem", md: "1.75rem" } }}
    >
      {children}
    </Typography>
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

/**
 * One picture with a title and a line. `direction` puts the picture beside the
 * text ("row") or above it ("column"); `imageWidth` is the picture's share.
 */
function InfoCardView({
  card,
  step,
  direction,
  imageWidth,
}: {
  card: InfoCard;
  step?: number;
  direction: Responsive;
  imageWidth: Responsive;
}) {
  return (
    <Card sx={{ ...cardSx, flexDirection: direction, alignItems: "center" }}>
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
          width: imageWidth,
          height: "auto",
          aspectRatio: "4 / 3",
          objectFit: "cover",
          borderRadius: (t: Theme) => t.shape.radius.control,
          bgcolor: (t: Theme) => t.palette.brand.subtle,
          flexShrink: 0,
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1, alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <CardTitle step={step}>{card.title}</CardTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.9375rem", lineHeight: 1.45 }}>
          {card.text}
        </Typography>
      </Box>
    </Card>
  );
}

/** The numbers, in a card that sits half on the hero band above it. */
function Metrics() {
  return (
    <Box
      component="section"
      aria-labelledby="metrics-row"
      // Pulls the card over the hero: past the container's top padding and a little more.
      sx={{ mt: { xs: -8, md: -11 }, mb: { xs: 3, md: 4 }, position: "relative" }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          border: 1,
          borderColor: "divider",
          boxShadow: (t: Theme) => `0 8px 24px ${alpha(t.palette.brand.ink, 0.16)}`,
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          alignItems: { lg: "center" },
          gap: { xs: 1.5, lg: 0 },
        }}
      >
        <Typography
          component="h2"
          variant="subtitle1"
          id="metrics-row"
          sx={{ fontWeight: 700, lineHeight: 1.25, flex: { lg: "0 0 8rem" }, pr: { lg: 2 } }}
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
            columnGap: { xs: 2, md: 0 },
            rowGap: 2,
          }}
        >
          {METRICS.map((m) => (
            <Box component="li" key={m.label} sx={{ px: { xs: 0, md: 2.5 }, borderLeft: { md: 1 }, borderColor: { md: "divider" }, minWidth: 0 }}>
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
              <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 600 }}>
                {m.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75, textAlign: { xs: "left", md: "right" } }}>
        {METRICS_NOTE}
      </Typography>
    </Box>
  );
}

function Journey() {
  return (
    <Box component="section" aria-labelledby="journey-row" sx={rowGap}>
      <RowHeading id="journey-row">{JOURNEY_TITLE}</RowHeading>
      <Grid component="ol" container spacing={{ xs: 1.5, md: 2.5 }} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {JOURNEY.map((card, i) => (
          <Grid component="li" key={card.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            {/* Picture beside the text on a phone, so four steps fit about one screen; above it from tablet up. */}
            <InfoCardView
              card={card}
              step={i + 1}
              direction={{ xs: "row", sm: "column" }}
              imageWidth={{ xs: "34%", sm: "100%" }}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function Safety() {
  return (
    <Box component="section" aria-labelledby="safety-row" sx={rowGap}>
      <RowHeading id="safety-row">{SAFETY_TITLE}</RowHeading>
      <Grid component="ul" container spacing={{ xs: 1.5, md: 2.5 }} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {SAFETY_CARDS.map((card) => (
          <Grid component="li" key={card.title} size={{ xs: 12, md: 4 }}>
            {/* Three narrow columns at md stack the picture above the text; every other width has room beside it. */}
            <InfoCardView
              card={card}
              direction={{ xs: "row", md: "column", lg: "row" }}
              imageWidth={{ xs: "34%", sm: "28%", md: "100%", lg: "38%" }}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function AnyCity() {
  return (
    <Box component="section" aria-labelledby="city-row" sx={rowGap}>
      <RowHeading id="city-row">{CITY_TITLE}</RowHeading>
      <Grid component="ul" container spacing={{ xs: 1.5, md: 2.5 }} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {CITY_CARDS.map((card) => (
          <Grid component="li" key={card.title} size={{ xs: 12, md: 6 }}>
            <InfoCardView card={card} direction="row" imageWidth={{ xs: "34%", sm: "28%", md: "38%" }} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

/** What the grant builds next, with the page's two buttons. */
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
          gap: { xs: 2, md: 4 },
        }}
      >
        <Typography
          component="h2"
          variant="h5"
          id="roadmap-row"
          sx={{ fontWeight: 700, lineHeight: 1.25, display: "flex", alignItems: "center", gap: 1, flexShrink: 0, fontSize: { xs: "1.25rem", md: "1.375rem" } }}
        >
          <RouteOutlined aria-hidden="true" color="primary" />
          {ROADMAP.title}
        </Typography>
        <Box
          component="ul"
          sx={{
            listStyle: "none",
            m: 0,
            p: 0,
            flex: 1,
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
            columnGap: 3,
            rowGap: 1,
          }}
        >
          {ROADMAP.items.map((item) => (
            <Typography component="li" variant="body1" key={item} sx={{ display: "flex", alignItems: "flex-start", gap: 1, fontWeight: 600 }}>
              <CheckCircleOutlined aria-hidden="true" color="primary" fontSize="small" sx={{ mt: "2px", flexShrink: 0 }} />
              {item}
            </Typography>
          ))}
        </Box>
        <Box sx={{ display: "flex", flexDirection: { xs: "row", md: "column" }, flexWrap: "wrap", gap: 1.25, flexShrink: 0 }}>
          <Button component={RouterLink} to="/" variant="contained" disableElevation>
            {CTA.primary}
          </Button>
          <Button variant="outlined" href={`#${TECHNICAL_ID}`} onClick={(e) => onJump(e, TECHNICAL_ID)}>
            {CTA.secondary}
          </Button>
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
      <Safety />
      <AnyCity />
      <Roadmap onJump={onJump} />
    </>
  );
}
