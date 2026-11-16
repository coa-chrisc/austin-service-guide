import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
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
import PersonIcon from "@mui/icons-material/Person";
import HomeIcon from "@mui/icons-material/Home";
import PlaceIcon from "@mui/icons-material/Place";
import WorkIcon from "@mui/icons-material/Work";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import TranslateIcon from "@mui/icons-material/Translate";
import GroupIcon from "@mui/icons-material/Group";

import { getAdminResident } from "../../lib/api";
import { categoryLabel } from "../../lib/categoryLabel";
import type { DemoResident, RiskFlag, ServiceMatch } from "../../types";

/** The detail endpoint adds the rules-engine output to the resident. */
type ResidentDetail = DemoResident & {
  _matches?: ServiceMatch[];
  _risk_flags?: RiskFlag[];
};

function severityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <ErrorIcon color="error" />;
    case "high":
      return <WarningAmberIcon sx={{ color: "error.main" }} />;
    case "medium":
      return <WarningAmberIcon sx={{ color: "warning.main" }} />;
    default:
      return <InfoIcon color="info" />;
  }
}

function severityColor(severity: string): "error" | "warning" | "info" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "info";
}

function confidenceColor(confidence: string): "success" | "info" | "default" {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "info";
  return "default";
}

/** "renting_at_risk" -> "Renting At Risk"; "" -> "Not shared". */
function shown(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not shared";
  if (typeof value === "number") return String(value);
  // Age bands ("30-39", "80+") stay as written; categoryLabel would turn "30-39" into "30 39".
  const band = value.match(/^(\d+)[_-](\d+)$/);
  return band ? `${band[1]}-${band[2]}` : categoryLabel(value);
}

const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

function languageLabel(code: string): string {
  try {
    const name = LANGUAGE_NAMES.of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

export default function AdminResidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [resident, setResident] = useState<ResidentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getAdminResident(id);
        if (!cancelled) setResident(data as ResidentDetail);
      } catch (err) {
        console.error("Failed to load sample case", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const backButton = (
    <Button
      startIcon={<ArrowBackIcon />}
      onClick={() => navigate("/admin/residents")}
      sx={{ mb: 2 }}
    >
      Back to sample cases
    </Button>
  );

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
        {backButton}
        <Typography>Sample case not found.</Typography>
      </Box>
    );
  }

  const profile = resident.profile;
  const matches = resident._matches ?? [];
  const riskFlags = resident._risk_flags ?? [];
  const needs = profile?.immediate_needs ?? [];

  return (
    <Box>
      {backButton}

      <Alert severity="info" sx={{ mb: 3 }}>
        A synthetic persona for the demo. Matches and risk indicators below are
        computed live by the rules engine from this profile; nothing is stored
        about real residents.
      </Alert>

      <Grid container spacing={3}>
        {/* -- profile card ------------------------------------------- */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ textAlign: "center" }}>
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
                <Chip label="Synthetic persona" size="small" variant="outlined" sx={{ mt: 1 }} />
              </Box>
              <Divider sx={{ my: 2 }} />

              {[
                { icon: <PlaceIcon fontSize="small" />, label: "ZIP code", value: resident.zip_code },
                {
                  icon: <GroupIcon fontSize="small" />,
                  label: "Household size",
                  value: shown(resident.household_size),
                },
                { icon: <TranslateIcon fontSize="small" />, label: "Language", value: languageLabel(resident.language) },
                { icon: <PersonIcon fontSize="small" />, label: "Age range", value: shown(profile?.age_range) },
                {
                  icon: <HomeIcon fontSize="small" />,
                  label: "Housing",
                  value: shown(profile?.housing_situation),
                },
                {
                  icon: <WorkIcon fontSize="small" />,
                  label: "Employment",
                  value: shown(profile?.employment_status),
                },
                {
                  icon: <LocalHospitalIcon fontSize="small" />,
                  label: "Health insurance",
                  value: shown(profile?.insurance_status),
                },
              ].map((item) => (
                <Box key={item.label} sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
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

              {needs.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="caption" color="text.secondary">
                    Needs described
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75 }}>
                    {needs.map((n) => (
                      <Chip key={n} label={categoryLabel(n)} size="small" />
                    ))}
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* -- right column ------------------------------------------- */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600}>
                Matched services ({matches.length})
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Rules-engine matches from the catalog. A match is not a
                referral or an eligibility decision.
              </Typography>
              {matches.length > 0 ? (
                <List dense disablePadding>
                  {matches.map((m) => (
                    <ListItem
                      key={m.service.id}
                      disableGutters
                      divider
                      sx={{ py: 1, alignItems: "flex-start", gap: 2 }}
                    >
                      <ListItemText
                        primary={m.service.name}
                        secondary={
                          <>
                            {m.service.provider_name}
                            {m.match_reasoning ? ` · ${m.match_reasoning}` : ""}
                          </>
                        }
                        primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                        secondaryTypographyProps={{ variant: "caption" }}
                      />
                      <Chip
                        label={`${m.match_confidence} match`}
                        size="small"
                        color={confidenceColor(m.match_confidence)}
                        variant="outlined"
                        sx={{ flexShrink: 0, mt: 0.5 }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No catalog services match this profile.
                </Typography>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>
                Risk indicators
              </Typography>
              {riskFlags.length > 0 ? (
                <List dense disablePadding>
                  {riskFlags.map((flag) => (
                    <ListItem
                      key={flag.risk_type}
                      disableGutters
                      sx={{ py: 0.75, alignItems: "flex-start", gap: 1 }}
                    >
                      <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                        {severityIcon(flag.severity)}
                      </ListItemIcon>
                      <ListItemText
                        primary={categoryLabel(flag.risk_type)}
                        secondary={flag.description}
                        primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                      />
                      <Chip
                        label={flag.severity}
                        size="small"
                        color={severityColor(flag.severity)}
                        sx={{ flexShrink: 0, mt: 0.5 }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No risk indicators for this profile.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
