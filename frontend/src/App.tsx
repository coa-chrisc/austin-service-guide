import type { ReactNode } from "react";
import { Navigate, Routes, Route } from "react-router-dom";
import Header from "@/components/layout/Header";
import RouteChunk from "@/components/common/RouteChunk";
import Landing from "@/pages/Landing";
import { lazyWithReload } from "@/lib/chunkReload";
import Box from "@mui/material/Box";

// Only the landing page, header and crisis lines are in the main bundle. Every
// other page is its own chunk, fetched when opened (the admin console, the map
// and Leaflet, the demo and the voice code never load for most residents).
const Intake = lazyWithReload(() => import("@/pages/Intake"));
const Results = lazyWithReload(() => import("@/pages/Results"));
const ServiceDirectory = lazyWithReload(() => import("@/pages/ServiceDirectory"));
const ServiceDetail = lazyWithReload(() => import("@/pages/ServiceDetail"));
const MapView = lazyWithReload(() => import("@/pages/MapView"));
const Login = lazyWithReload(() => import("@/pages/Login"));
const DemoIntake = lazyWithReload(() => import("@/pages/DemoIntake"));
const HowItWorks = lazyWithReload(() => import("@/pages/HowItWorks"));
const AdminLayout = lazyWithReload(() => import("@/components/layout/AdminLayout"));
const AdminDashboard = lazyWithReload(() => import("@/pages/admin/AdminDashboard"));
const AdminResidents = lazyWithReload(() => import("@/pages/admin/AdminResidents"));
const AdminResidentDetail = lazyWithReload(() => import("@/pages/admin/AdminResidentDetail"));
const AdminServices = lazyWithReload(() => import("@/pages/admin/AdminServices"));
const AdminServiceEdit = lazyWithReload(() => import("@/pages/admin/AdminServiceEdit"));
const AdminAnalytics = lazyWithReload(() => import("@/pages/admin/AdminAnalytics"));
const AdminEquity = lazyWithReload(() => import("@/pages/admin/AdminEquity"));
const AdminLanguages = lazyWithReload(() => import("@/pages/admin/AdminLanguages"));
const AdminAuditLog = lazyWithReload(() => import("@/pages/admin/AdminAuditLog"));
const AdminStaff = lazyWithReload(() => import("@/pages/admin/AdminStaff"));
const AdminEligibility = lazyWithReload(() => import("@/pages/admin/AdminEligibility"));
const AdminDemandMap = lazyWithReload(() => import("@/pages/admin/AdminDemandMap"));
const AdminReports = lazyWithReload(() => import("@/pages/admin/AdminReports"));
const AdminPartnerGaps = lazyWithReload(() => import("@/pages/admin/AdminPartnerGaps"));
const ReportView = lazyWithReload(() => import("@/pages/admin/reports/ReportView"));
const ResearchJobs = lazyWithReload(() => import("@/pages/admin/research/ResearchJobs"));
const JobDetail = lazyWithReload(() => import("@/pages/admin/research/JobDetail"));
const DraftReview = lazyWithReload(() => import("@/pages/admin/research/DraftReview"));
const AdminPartnerImport = lazyWithReload(() => import("@/pages/admin/import/AdminPartnerImport"));

const page = (node: ReactNode) => <RouteChunk>{node}</RouteChunk>;

export default function App() {
  return (
    <Routes>
      {/* Printable report: outside the admin shell so only the report prints. */}
      <Route path="/admin/reports/:id" element={page(<ReportView />)} />

      {/* Admin routes */}
      <Route path="/admin" element={page(<AdminLayout />)}>
        <Route index element={page(<AdminDashboard />)} />
        <Route path="residents" element={page(<AdminResidents />)} />
        <Route path="residents/:id" element={page(<AdminResidentDetail />)} />
        <Route path="services" element={page(<AdminServices />)} />
        <Route path="services/new" element={page(<AdminServiceEdit />)} />
        <Route path="services/:id/edit" element={page(<AdminServiceEdit />)} />
        <Route path="eligibility" element={page(<AdminEligibility />)} />
        <Route path="research" element={page(<ResearchJobs />)} />
        <Route path="research/:id" element={page(<JobDetail />)} />
        <Route path="research/drafts/:draftId" element={page(<DraftReview />)} />
        <Route path="import" element={page(<AdminPartnerImport />)} />
        <Route path="analytics" element={page(<AdminAnalytics />)} />
        <Route path="demand-map" element={page(<AdminDemandMap />)} />
        <Route path="equity" element={page(<AdminEquity />)} />
        <Route path="languages" element={page(<AdminLanguages />)} />
        <Route path="reports" element={page(<AdminReports />)} />
        <Route path="partner-gaps" element={page(<AdminPartnerGaps />)} />
        <Route path="audit" element={page(<AdminAuditLog />)} />
        <Route path="staff" element={page(<AdminStaff />)} />
        <Route path="how-it-works" element={page(<HowItWorks />)} />
      </Route>

      {/* Resident routes */}
      <Route
        path="*"
        element={
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100vh",
            }}
          >
            <Header />
            <Box component="main" sx={{ flex: 1 }}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/intake" element={page(<Intake />)} />
                <Route path="/results" element={page(<Results />)} />
                {/* Old share links: the plan now lives only in the tab that made it. */}
                <Route path="/results/*" element={page(<Results />)} />
                <Route path="/services" element={page(<ServiceDirectory />)} />
                <Route path="/services/:slug" element={page(<ServiceDetail />)} />
                <Route path="/map" element={page(<MapView />)} />
                <Route path="/login" element={page(<Login />)} />
                <Route path="/demo" element={page(<DemoIntake />)} />
                <Route path="/how-it-works" element={page(<HowItWorks />)} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Box>
          </Box>
        }
      />
    </Routes>
  );
}
