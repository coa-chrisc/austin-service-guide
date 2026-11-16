import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import PersonIcon from "@mui/icons-material/Person";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { useAuth } from "@/hooks/useAuth";
import { useOpenStaffDemo } from "@/hooks/useOpenStaffDemo";

const buttonSx = { py: 1.5, textTransform: "none", fontWeight: 600 } as const;

function CardHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
      <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box>
      <Typography variant="h6" component="h2" fontWeight={700}>
        {title}
      </Typography>
    </Box>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const openStaffDemo = useOpenStaffDemo();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleResidentLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter an email address");
      return;
    }
    login(email.trim());
    navigate(-1);
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
      <Box sx={{ textAlign: "center", mb: 4 }}>
        <HealthAndSafetyIcon sx={{ fontSize: 56, color: "primary.main", mb: 1 }} />
        <Typography variant="h4" component="h1" fontWeight={700}>
          Sign In
        </Typography>
      </Box>

      <Grid container spacing={3} alignItems="stretch">
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent
              component="form"
              onSubmit={handleResidentLogin}
              sx={{ p: { xs: 3, md: 4 }, height: "100%", display: "flex", flexDirection: "column" }}
            >
              <CardHeading icon={<PersonIcon />} title="Residents" />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Sign in to save your results and track applications. This is a
                demo: enter any email address to continue.
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <TextField
                label="Email Address"
                type="email"
                fullWidth
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="you@example.com"
                sx={{ mb: 3 }}
              />

              <Button
                type="submit"
                variant="contained"
                disableElevation
                fullWidth
                size="large"
                sx={{ ...buttonSx, mt: "auto" }}
              >
                Sign in
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent
              sx={{ p: { xs: 3, md: 4 }, height: "100%", display: "flex", flexDirection: "column" }}
            >
              <CardHeading icon={<AdminPanelSettingsIcon />} title="Agency staff (demo)" />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Opens the staff console with sample data. No password. A real
                deployment signs staff in with Microsoft Entra ID and role-based
                access.
              </Typography>
              <Button
                variant="contained"
                disableElevation
                fullWidth
                size="large"
                startIcon={<AdminPanelSettingsIcon />}
                onClick={openStaffDemo}
                sx={{ ...buttonSx, mt: "auto" }}
              >
                Open staff console demo
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
