import { Component, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import CrisisLinesBlock from "@/components/common/CrisisLinesBlock";
import { ChunkLoadError, reloadFresh } from "@/lib/chunkReload";

/** Light placeholder while a lazy page downloads. */
function RouteLoading() {
  return (
    <Box
      role="status"
      aria-busy="true"
      aria-live="polite"
      sx={{ display: "flex", justifyContent: "center", py: 8 }}
    >
      <CircularProgress size={32} aria-label="Loading page" />
    </Box>
  );
}

/**
 * Shown when a page chunk still fails after the one automatic reload.
 * The crisis lines live in the main bundle, so they show even then.
 */
function ChunkLoadFailed() {
  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Alert
        severity="warning"
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => void reloadFresh()}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            Try again
          </Button>
        }
        sx={{ mb: 3 }}
      >
        This page did not load. Check your connection and try again.
      </Alert>
      <CrisisLinesBlock />
    </Container>
  );
}

interface BoundaryProps {
  /** Shown when a chunk fails to load (after the one automatic reload). */
  fallback: ReactNode;
  /** A new value clears the failure (RouteChunk passes the pathname). */
  resetKey?: string;
  children: ReactNode;
}

interface BoundaryState {
  resetKey?: string;
  failed: boolean;
  error: unknown;
}

/** Catches ChunkLoadError only; other errors propagate as before. */
export class ChunkErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { resetKey: this.props.resetKey, failed: false, error: null };

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) {
    // Navigating away clears the failure so the next page can load.
    return props.resetKey === state.resetKey
      ? null
      : { resetKey: props.resetKey, failed: false, error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }

  render() {
    const { failed, error } = this.state;
    if (!failed) return this.props.children;
    if (error instanceof ChunkLoadError) return this.props.fallback;
    throw error;
  }
}

/** Wraps a lazy page: loading placeholder plus chunk-failure handling. */
export default function RouteChunk({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ChunkErrorBoundary fallback={<ChunkLoadFailed />} resetKey={pathname}>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}
