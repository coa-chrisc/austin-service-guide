import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const navigate = useNavigate();
  const { login, loginAsStaff } = useAuth();
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

  const handleStaffLogin = () => {
    loginAsStaff("staff@austintexas.gov", "admin");
    navigate("/admin");
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 } }}>
      <Box sx={{ textAlign: "center", mb: 4 }}>
        <HealthAndSafetyIcon
          sx={{ fontSize: 56, color: "primary.main", mb: 1 }}
        />
        <Typography variant="h4" fontWeight={700}>
          Sign In
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          Sign in to save your results and track applications
        </Typography>
      </Box>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <form onSubmit={handleResidentLogin}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Resident Sign In
            </Typography>

            <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
              This is a demo &mdash; enter any email address to continue.
            </Alert>

            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
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
              fullWidth
              size="large"
              sx={{ mb: 2, borderRadius: "24px", py: 1.5 }}
            >
              Sign In
            </Button>
          </form>

          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.secondary">
              OR
            </Typography>
          </Divider>

          <Button
            variant="outlined"
            fullWidth
            size="large"
            startIcon={<AdminPanelSettingsIcon />}
            onClick={handleStaffLogin}
            sx={{ borderRadius: "24px", py: 1.5 }}
          >
            Staff Login (Demo)
          </Button>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 1.5 }}
          >
            Staff login uses staff@austintexas.gov with admin role
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}
