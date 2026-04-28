import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";

import { getAdminPartnerGaps, type PartnerGapsResponse } from "../../lib/api";

export default function AdminPartnerGaps() {
  const navigate = useNavigate();
  const [data, setData] = useState<PartnerGapsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminPartnerGaps();
        if (cancelled) return;
        setData(res);
      } catch (err) {
        console.error("Failed to load partner gaps", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/admin/reports")}
        sx={{ mb: 2 }}
      >
        Back to reports
      </Button>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <LinkOffIcon color="error" />
        <Typography variant="h5" fontWeight={700}>
          Partner Coordination Gaps
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Residents we referred to a partner who never connected. Each partner
        shows the trailing-8-week trend and the top resident-side reasons
        coordinators logged on closeout.
      </Typography>

      {/* -- summary --------------------------------------------------- */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap">
        <Card sx={{ flex: 1, minWidth: 180 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Referrals
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {loading ? (
                <Skeleton width={60} />
              ) : (
                (data?.totals.referrals ?? 0)
              )}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 180 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Connections
            </Typography>
            <Typography variant="h4" fontWeight={700} color="success.main">
              {loading ? (
                <Skeleton width={60} />
              ) : (
                (data?.totals.connections ?? 0)
              )}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 180 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Gap
            </Typography>
            <Typography variant="h4" fontWeight={700} color="error.main">
              {loading ? <Skeleton width={60} /> : (data?.totals.gap ?? 0)}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 180 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Connection Rate
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {loading ? (
                <Skeleton width={60} />
              ) : (
                `${((data?.totals.connection_rate ?? 0) * 100).toFixed(0)}%`
              )}
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* -- partner cards -------------------------------------------- */}
      {loading ? (
        <Grid container spacing={2}>
          {[...Array(4)].map((_, i) => (
            <Grid key={i} size={{ xs: 12, md: 6 }}>
              <Skeleton variant="rectangular" height={220} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={2}>
          {(data?.partners ?? []).map((p) => {
            const rate = p.referrals > 0 ? p.connections / p.referrals : 0;
            const ratePct = Math.round(rate * 100);
            const sevColor =
              ratePct < 50
                ? "error.main"
                : ratePct < 70
                  ? "warning.main"
                  : "success.main";
            return (
              <Grid key={p.partner} size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: "100%" }}>
                  <CardContent>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 2,
                        mb: 1.5,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {p.partner}
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}
                        >
                          <Chip
                            label={p.category}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          {p.primary_languages.map((l) => (
                            <Chip
                              key={l}
                              label={l}
                              size="small"
                              variant="outlined"
                            />
                          ))}
                        </Stack>
                      </Box>
                      <Box sx={{ width: 110, flexShrink: 0 }}>
                        <SparkLineChart
                          data={p.trend}
                          height={48}
                          showHighlight
                          showTooltip
                          colors={["#D32F2F"]}
                        />
                      </Box>
                    </Box>

                    <Box sx={{ mb: 1.5 }}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          mb: 0.5,
                        }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          {p.connections} connected of {p.referrals} referred
                        </Typography>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          color={sevColor}
                        >
                          {ratePct}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={ratePct}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          bgcolor: "action.hover",
                          "& .MuiLinearProgress-bar": {
                            bgcolor: sevColor,
                          },
                        }}
                      />
                    </Box>

                    <Typography
                      variant="overline"
                      color="text.secondary"
                      sx={{ display: "block", mt: 1.5 }}
                    >
                      Top closeout reasons
                    </Typography>
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      {p.top_reasons.map((r) => (
                        <Typography key={r} variant="body2">
                          • {r}
                        </Typography>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
