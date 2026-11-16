/**
 * One report as a printable page (/admin/reports/:id). It sits outside the
 * admin shell so "Print / Save as PDF" prints only the report. `?print=1`
 * opens the print dialog once the report has drawn; the PDF renderer
 * (frontend/scripts/render-reports.mjs) waits for data-report-ready="true".
 */
import { useEffect, useState } from "react";
import { Link as RouterLink, useParams, useSearchParams } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PrintIcon from "@mui/icons-material/Print";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

import brandTheme from "../../../theme/brandTheme";
import { useBrandConfig } from "../../../hooks/useBrandConfig";
import { getAdminReports } from "../../../lib/api";
import { longDay } from "./format";
import {
  hasCsv,
  hasPdf,
  loadReportData,
  reportingPeriod,
  type ReportData,
  type ReportDef,
} from "./reportData";
import { downloadPdf, downloadReportCsv } from "./reportActions";
import { MethodsBox } from "./ReportParts";
import { methodsFor, ReportBody } from "./ReportBodies";

/** Letter paper minus 0.5in margins: the report is laid out at print width on screen too. */
const PAGE_WIDTH = "7.5in";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "ready"; report: ReportDef; data: ReportData };

function PrintStyles() {
  return (
    <GlobalStyles
      styles={(theme) => ({
        "@page": { size: "letter", margin: "0.5in 0.5in 0.6in" },
        "@media print": {
          "html, body": {
            backgroundColor: theme.palette.background.paper,
            printColorAdjust: "exact",
            WebkitPrintColorAdjust: "exact",
          },
          ".no-print": { display: "none !important" },
          ".report-shell": { padding: "0 !important", backgroundColor: "transparent !important" },
          ".report-paper": {
            boxShadow: "none !important",
            border: "none !important",
            padding: "0 !important",
          },
          ".report-footer": {
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
          },
          ".report-section, tr, .MuiChartsSurface-root": { breakInside: "avoid" },
          "h2, h3": { breakAfter: "avoid" },
          // Room at the bottom of each page for the fixed footer.
          ".report-body": { paddingBottom: "0.3in" },
        },
      })}
    />
  );
}

function ReportHeader({ report, data }: { report: ReportDef; data: ReportData }) {
  const brand = useBrandConfig();
  const period = reportingPeriod(data.overview);
  const isCatalog = report.id === "catalog-export";
  return (
    <Box component="header" sx={{ mb: 3 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ pb: 1.5, mb: 2, borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Box
          component="img"
          src={brand.logoSrc}
          alt=""
          sx={{ height: 36, width: "auto", maxWidth: 120, objectFit: "contain" }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={700} lineHeight={1.2}>
            {brand.appName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {brand.agency.name}
          </Typography>
        </Box>
        <Chip
          size="small"
          variant="outlined"
          label={isCatalog ? "Live catalog" : "Synthetic demo data"}
          sx={{ fontWeight: 700, borderColor: "text.primary" }}
        />
      </Stack>
      <Typography variant="h4" component="h1" fontWeight={800} sx={{ fontSize: "1.75rem" }}>
        {report.title}
      </Typography>
      {report.audience && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          For: {report.audience}
        </Typography>
      )}
      <Stack direction="row" spacing={3} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
        {!isCatalog && period && (
          <Typography variant="body2">
            <strong>Reporting period:</strong> {longDay(period.start)} to {longDay(period.end)}
          </Typography>
        )}
        <Typography variant="body2">
          <strong>{isCatalog ? "As of:" : "Generated:"}</strong> {longDay(new Date())}
        </Typography>
      </Stack>
    </Box>
  );
}

function Toolbar({ report, data }: { report: ReportDef | null; data: ReportData | null }) {
  const [pdfMissing, setPdfMissing] = useState(false);
  return (
    <Stack
      className="no-print"
      direction="row"
      spacing={1}
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      sx={{ maxWidth: `calc(${PAGE_WIDTH} + 64px)`, mx: "auto", mb: 2 }}
    >
      <Button component={RouterLink} to="/admin/reports" startIcon={<ArrowBackIcon />}>
        Back to reports
      </Button>
      <Box sx={{ flex: 1 }} />
      {report && data && (
        <>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
          {hasPdf(report) && (
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfIcon />}
              onClick={async () => {
                if (!(await downloadPdf(report.id))) setPdfMissing(true);
              }}
            >
              Download PDF
            </Button>
          )}
          {hasCsv(report) && (
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => downloadReportCsv(report.id, data)}
            >
              Download CSV
            </Button>
          )}
        </>
      )}
      {pdfMissing && (
        <Alert severity="info" sx={{ width: "100%" }} onClose={() => setPdfMissing(false)}>
          No pre-rendered PDF for this deployment. Use Print / Save as PDF instead.
        </Alert>
      )}
    </Stack>
  );
}

export default function ReportView() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const autoPrint = params.get("print") === "1";
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const reports = (await getAdminReports()) as ReportDef[];
        const report = reports.find((r) => r.id === id);
        if (!report) {
          if (!cancelled) setState({ status: "not-found" });
          return;
        }
        const data = await loadReportData(id === "catalog-export");
        if (!cancelled) setState({ status: "ready", report, data });
      } catch (err) {
        console.error("Failed to load report", err);
        if (!cancelled) {
          setState({ status: "error", message: "The report data could not be loaded. Try again." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (state.status !== "ready") return;
    document.title = state.report.title;
    if (!autoPrint) return;
    // Let the charts measure and draw before the print dialog snapshots the page.
    const timer = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(timer);
  }, [state, autoPrint]);

  const ready = state.status === "ready";

  return (
    <ThemeProvider theme={brandTheme}>
      <CssBaseline />
      <PrintStyles />
      <Box
        className="report-shell"
        sx={{ bgcolor: "background.default", minHeight: "100vh", py: 3, px: 2 }}
      >
        <Toolbar
          report={ready ? state.report : null}
          data={ready ? state.data : null}
        />
        <Paper
          className="report-paper"
          variant="outlined"
          data-report-ready={ready ? "true" : "false"}
          sx={{
            boxSizing: "content-box",
            width: PAGE_WIDTH,
            maxWidth: "100%",
            mx: "auto",
            p: 4,
          }}
        >
          {state.status === "loading" && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress aria-label="Loading report" />
            </Box>
          )}
          {state.status === "error" && <Alert severity="error">{state.message}</Alert>}
          {state.status === "not-found" && (
            <Alert severity="warning">
              There is no report called "{id}". Go back to the reports list to pick one.
            </Alert>
          )}
          {state.status === "ready" && (
            <>
              <ReportHeader report={state.report} data={state.data} />
              <Box className="report-body">
                <ReportBody id={state.report.id} data={state.data} />
                <MethodsBox items={methodsFor(state.report.id)} />
              </Box>
              <Box
                component="footer"
                className="report-footer"
                sx={{
                  mt: 3,
                  pt: 1,
                  borderTop: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {state.report.id === "catalog-export"
                    ? "Live service catalog. Not verified by staff; confirm details with each provider."
                    : "Synthetic demonstration data. Not real residents."}
                </Typography>
              </Box>
            </>
          )}
        </Paper>
      </Box>
    </ThemeProvider>
  );
}
