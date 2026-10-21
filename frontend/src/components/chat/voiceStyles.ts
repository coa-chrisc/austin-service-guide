import type { Theme } from "@mui/material/styles";

/** Visible keyboard focus for voice controls. */
export const focusRing = (theme: Theme) => ({
  "&.Mui-focusVisible, &:focus-visible": {
    outline: `3px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
});
