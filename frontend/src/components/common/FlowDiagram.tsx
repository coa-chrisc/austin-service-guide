import { Fragment, useId } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { Theme } from "@mui/material/styles";

/* ------------------------------------------------------------------ */
/*  A diagram built from ordered lists, so it needs no image and no    */
/*  alt text: each lane is an <ol>, each step an outlined card. Arrows */
/*  are decorative ::after borders (not in the accessibility tree):    */
/*  across at md and up, downward below. A boundary between lanes is a */
/*  dashed rule with a text label, so it is not shown by colour alone. */
/*  Printed, the lists stack as plain lists.                           */
/* ------------------------------------------------------------------ */

export type FlowTone = "primary" | "warning" | "success";

export interface FlowNode {
  title: string;
  detail: string;
  tone: FlowTone;
}

export interface FlowLane {
  label: string;
  /** Text for a dashed boundary drawn above this lane (e.g. "Leaves your device"). */
  boundaryBefore?: string;
  nodes: FlowNode[];
}

interface FlowDiagramProps {
  caption: string;
  lanes: FlowLane[];
  /** Draw arrows between the steps of a lane (off for side-by-side facts). */
  arrows?: boolean;
}

const GAP = 3; // theme spacing units between steps; the arrows sit in this gap

function arrowSx(theme: Theme) {
  const color = theme.palette.text.secondary;
  return {
    "&:not(:last-of-type)::after": {
      content: '""',
      position: "absolute",
      width: 0,
      height: 0,
      borderStyle: "solid",
      // Below md: a downward triangle under the card.
      left: "50%",
      bottom: theme.spacing(-GAP + 0.5),
      transform: "translateX(-50%)",
      borderWidth: "10px 7px 0 7px",
      borderColor: `${color} transparent transparent transparent`,
      [theme.breakpoints.up("md")]: {
        left: "auto",
        bottom: "auto",
        top: "50%",
        right: theme.spacing(-GAP + 0.5),
        transform: "translateY(-50%)",
        borderWidth: "7px 0 7px 10px",
        borderColor: `transparent transparent transparent ${color}`,
      },
    },
  };
}

export default function FlowDiagram({ caption, lanes, arrows = true }: FlowDiagramProps) {
  const baseId = useId();
  return (
    <Box component="figure" sx={{ m: 0, my: 3 }}>
      <Typography component="figcaption" variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
        {caption}
      </Typography>
      {lanes.map((lane, laneIndex) => {
        const labelId = `${baseId}-lane-${laneIndex}`;
        return (
          <Fragment key={lane.label}>
            {lane.boundaryBefore && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  my: 2,
                  color: "text.secondary",
                  "&::before, &::after": {
                    content: '""',
                    flex: 1,
                    borderTop: "2px dashed",
                    borderColor: "divider",
                  },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, textAlign: "center" }}>
                  {lane.boundaryBefore}
                </Typography>
              </Box>
            )}
            <Typography id={labelId} variant="body2" sx={{ fontWeight: 600, mb: 1, mt: laneIndex ? 2 : 0 }}>
              {lane.label}
            </Typography>
            <Box
              component="ol"
              aria-labelledby={labelId}
              sx={{
                listStyle: "none",
                p: 0,
                m: 0,
                display: "grid",
                gap: GAP,
                gridTemplateColumns: {
                  xs: "minmax(0, 1fr)",
                  md: `repeat(${lane.nodes.length}, minmax(0, 1fr))`,
                },
                "@media print": { display: "block" },
              }}
            >
              {lane.nodes.map((node) => (
                <Box
                  component="li"
                  key={node.title}
                  sx={[
                    { position: "relative", display: "flex", "@media print": { mb: 1 } },
                    arrows ? arrowSx : {},
                    { "@media print": { "&::after": { display: "none" } } },
                  ]}
                >
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      flex: 1,
                      borderTopWidth: 4,
                      borderTopColor: `${node.tone}.main`,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {node.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {node.detail}
                    </Typography>
                  </Paper>
                </Box>
              ))}
            </Box>
          </Fragment>
        );
      })}
    </Box>
  );
}
