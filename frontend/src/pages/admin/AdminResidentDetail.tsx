import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Skeleton from "@mui/material/Skeleton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Avatar from "@mui/material/Avatar";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorIcon from "@mui/icons-material/Error";
import InfoIcon from "@mui/icons-material/Info";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonIcon from "@mui/icons-material/Person";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import HomeIcon from "@mui/icons-material/Home";
import WorkIcon from "@mui/icons-material/Work";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import TranslateIcon from "@mui/icons-material/Translate";
import GroupIcon from "@mui/icons-material/Group";

import { getAdminResident } from "../../lib/api";
import type { DemoResident } from "../../types";

/* -- mock activity events ----------------------------------------- */
const MOCK_ACTIVITY = [
  {
    id: 1,
    text: "Completed intake session",
    date: "2026-04-22 10:30 AM",
    color: "#4caf50",
  },
  {
    id: 2,
    text: "Matched with 4 services",
    date: "2026-04-22 10:32 AM",
    color: "#2196f3",
  },
  {
    id: 3,
    text: 'Saved "Emergency Food Pantry"',
    date: "2026-04-21 3:15 PM",
    color: "#ff9800",
  },
  {
    id: 4,
    text: "Updated profile — added phone",
    date: "2026-04-20 9:00 AM",
    color: "#9c27b0",
  },
  { id: 5, text: "First login", date: "2026-04-18 2:45 PM", color: "#607d8b" },
];

/* -- mock household members --------------------------------------- */
const MOCK_HOUSEHOLD = [
  { name: "Maria G.", relation: "Spouse", age: "30-39" },
  { name: "Ava G.", relation: "Child", age: "5-12" },
  { name: "Liam G.", relation: "Child", age: "0-4" },
];

/* -- severity icon helper ----------------------------------------- */
function severityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <ErrorIcon color="error" />;
    case "high":
      return <WarningAmberIcon sx={{ color: "#f44336" }} />;
    case "medium":
      return <WarningAmberIcon sx={{ color: "#ff9800" }} />;
    default:
      return <InfoIcon color="info" />;
  }
}

function severityColor(
  severity: string,
): "error" | "warning" | "info" | "success" {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    default:
      return "info";
  }
}

export default function AdminResidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [resident, setResident] = useState<DemoResident | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getAdminResident(id);
        if (!cancelled) setResident(data);
      } catch (err) {
        console.error("Failed to load resident", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Box>
        <Skeleton width={200} height={40} />
        <Skeleton variant="rectangular" height={300} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (!resident) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/admin/residents")}
        >
          Back to Residents
        </Button>
        <Typography sx={{ mt: 2 }}>Resident not found.</Typography>
      </Box>
    );
  }

  const profile = resident.profile ?? ({} as Record<string, unknown>);

  /* -- risk flags from profile or mock ----------------------------- */
  const riskFlags: Array<{ type: string; severity: string }> = (
    resident as unknown as {
      risk_flags?: Array<{ type: string; severity: string }>;
    }
  ).risk_flags ?? [
    { type: "Housing instability", severity: "high" },
    { type: "Food insecurity", severity: "medium" },
  ];

  return (
    <Box>
      {/* -- top bar -------------------------------------------------- */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/admin/residents")}
        sx={{ mb: 2 }}
      >
        Back to Residents
      </Button>

      <Grid container spacing={3}>
        {/* -- profile card ------------------------------------------- */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent sx={{ p: 3, textAlign: "center" }}>
              <Avatar
                sx={{
                  width: 72,
                  height: 72,
                  mx: "auto",
                  mb: 2,
                  bgcolor: "primary.main",
                  fontSize: 28,
                }}
              >
                {resident.name.charAt(0)}
              </Avatar>
              <Typography variant="h6" fontWeight={700}>
                {resident.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {resident.email}
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Box sx={{ textAlign: "left" }}>
                {[
                  {
                    icon: <HomeIcon fontSize="small" />,
                    label: "Zip Code",
                    value: resident.zip_code,
                  },
                  {
                    icon: <GroupIcon fontSize="small" />,
                    label: "Household Size",
                    value: resident.household_size,
                  },
                  {
                    icon: <TranslateIcon fontSize="small" />,
                    label: "Language",
                    value: resident.language,
                  },
                  {
                    icon: <PersonIcon fontSize="small" />,
                    label: "Age Range",
                    value:
                      (profile as { age_range?: string }).age_range ?? "N/A",
                  },
                  {
                    icon: <HomeIcon fontSize="small" />,
                    label: "Housing",
                    value:
                      (profile as { housing_situation?: string })
                        .housing_situation ?? "N/A",
                  },
                  {
                    icon: <WorkIcon fontSize="small" />,
                    label: "Employment",
                    value:
                      (profile as { employment_status?: string })
                        .employment_status ?? "N/A",
                  },
                  {
                    icon: <LocalHospitalIcon fontSize="small" />,
                    label: "Insurance",
                    value:
                      (profile as { insurance_status?: string })
                        .insurance_status ?? "N/A",
                  },
                ].map((item) => (
                  <Box
                    key={item.label}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      mb: 1.5,
                    }}
                  >
                    <Box sx={{ color: "text.secondary" }}>{item.icon}</Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        {item.label}
                      </Typography>
                      <Typography variant="body2" fontWeight={500}>
                        {item.value}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>

              <Divider sx={{ my: 2 }} />
              <Box sx={{ textAlign: "left" }}>
                <Typography variant="caption" color="text.secondary">
                  Signup Date
                </Typography>
                <Typography variant="body2">
                  {new Date(resident.signup_date).toLocaleDateString()}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: "block" }}
                >
                  Last Active
                </Typography>
                <Typography variant="body2">
                  {new Date(resident.last_active).toLocaleDateString()}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* -- right column ------------------------------------------- */}
        <Grid size={{ xs: 12, md: 8 }}>
          {/* Matched services */}
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Matched Services ({resident.matched_services_count})
              </Typography>
              {resident.saved_services.length > 0 ? (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {resident.saved_services.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      icon={<CheckCircleIcon />}
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No saved services yet.
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Risk flags */}
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Risk Flags
              </Typography>
              {riskFlags.length > 0 ? (
                <List dense disablePadding>
                  {riskFlags.map((flag, i) => (
                    <ListItem key={i} disableGutters sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {severityIcon(flag.severity)}
                      </ListItemIcon>
                      <ListItemText
                        primary={flag.type}
                        secondary={`Severity: ${flag.severity}`}
                      />
                      <Chip
                        label={flag.severity}
                        size="small"
                        color={severityColor(flag.severity)}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No risk flags identified.
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Activity timeline */}
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Activity Timeline
              </Typography>
              <List dense disablePadding>
                {MOCK_ACTIVITY.map((evt) => (
                  <ListItem key={evt.id} disableGutters sx={{ py: 0.75 }}>
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <FiberManualRecordIcon
                        sx={{ fontSize: 10, color: evt.color }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={evt.text}
                      secondary={evt.date}
                      primaryTypographyProps={{ variant: "body2" }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>

          {/* Household members */}
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Household Members
              </Typography>
              <List dense disablePadding>
                {MOCK_HOUSEHOLD.map((m) => (
                  <ListItem key={m.name} disableGutters sx={{ py: 0.75 }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          fontSize: 14,
                          bgcolor: "grey.300",
                          color: "grey.700",
                        }}
                      >
                        {m.name.charAt(0)}
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={m.name}
                      secondary={`${m.relation} | Age: ${m.age}`}
                      primaryTypographyProps={{
                        variant: "body2",
                        fontWeight: 500,
                      }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
