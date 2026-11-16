import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { useOpenStaffDemo } from "@/hooks/useOpenStaffDemo";

/** Landing-page entry to the staff console demo. */
export default function StaffConsoleBand() {
  const openStaffDemo = useOpenStaffDemo();

  return (
    <Box
      component="section"
      aria-labelledby="staff-band-title"
      sx={{ bgcolor: "background.paper", borderTop: "1px solid", borderColor: "divider" }}
    >
      <Container
        maxWidth="lg"
        sx={{
          py: { xs: 4, md: 5 },
          display: "flex",
          gap: 3,
          alignItems: { xs: "flex-start", md: "center" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        <Box sx={{ maxWidth: 680 }}>
          <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
            For agency staff
          </Typography>
          <Typography id="staff-band-title" variant="h5" component="h2" fontWeight={700} gutterBottom>
            See what staff see
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Open the staff console demo: service catalog, demand and equity
            views, and downloadable reports. Sample data only.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          disableElevation
          startIcon={<AdminPanelSettingsIcon />}
          onClick={openStaffDemo}
          sx={{ textTransform: "none", fontWeight: 600, flexShrink: 0 }}
        >
          Open staff console demo
        </Button>
      </Container>
    </Box>
  );
}
