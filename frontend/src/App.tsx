import { Routes, Route } from "react-router-dom";
import Header from "@/components/layout/Header";
import AdminLayout from "@/components/layout/AdminLayout";
import Landing from "@/pages/Landing";
import Intake from "@/pages/Intake";
import Results from "@/pages/Results";
import ServiceDirectory from "@/pages/ServiceDirectory";
import ServiceDetail from "@/pages/ServiceDetail";
import MapView from "@/pages/MapView";
import Login from "@/pages/Login";
import DemoIntake from "@/pages/DemoIntake";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminResidents from "@/pages/admin/AdminResidents";
import AdminResidentDetail from "@/pages/admin/AdminResidentDetail";
import AdminServices from "@/pages/admin/AdminServices";
import AdminServiceEdit from "@/pages/admin/AdminServiceEdit";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";
import AdminEquity from "@/pages/admin/AdminEquity";
import AdminLanguages from "@/pages/admin/AdminLanguages";
import AdminAuditLog from "@/pages/admin/AdminAuditLog";
import AdminStaff from "@/pages/admin/AdminStaff";
import AdminEligibility from "@/pages/admin/AdminEligibility";
import AdminDemandMap from "@/pages/admin/AdminDemandMap";
import AdminReports from "@/pages/admin/AdminReports";
import AdminPartnerGaps from "@/pages/admin/AdminPartnerGaps";
import Box from "@mui/material/Box";

export default function App() {
  return (
    <Routes>
      {/* Admin routes */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="residents" element={<AdminResidents />} />
        <Route path="residents/:id" element={<AdminResidentDetail />} />
        <Route path="services" element={<AdminServices />} />
        <Route path="services/new" element={<AdminServiceEdit />} />
        <Route path="services/:id/edit" element={<AdminServiceEdit />} />
        <Route path="eligibility" element={<AdminEligibility />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="demand-map" element={<AdminDemandMap />} />
        <Route path="equity" element={<AdminEquity />} />
        <Route path="languages" element={<AdminLanguages />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="partner-gaps" element={<AdminPartnerGaps />} />
        <Route path="audit" element={<AdminAuditLog />} />
        <Route path="staff" element={<AdminStaff />} />
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
                <Route path="/intake" element={<Intake />} />
                <Route path="/results/:sessionId" element={<Results />} />
                <Route path="/services" element={<ServiceDirectory />} />
                <Route path="/services/:slug" element={<ServiceDetail />} />
                <Route path="/map" element={<MapView />} />
                <Route path="/login" element={<Login />} />
                <Route path="/demo/:sessionId" element={<DemoIntake />} />
              </Routes>
            </Box>
          </Box>
        }
      />
    </Routes>
  );
}
