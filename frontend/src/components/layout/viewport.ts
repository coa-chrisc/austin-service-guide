/**
 * Height of the viewport below the sticky header (the MUI Toolbar is 56px on
 * phones, 64px from `sm` up). `dvh` tracks mobile browser chrome, so
 * full-height screens (chat, map) neither leave a gap nor hide under it.
 */
export const BELOW_HEADER = {
  xs: "calc(100dvh - 56px)",
  sm: "calc(100dvh - 64px)",
} as const;
