import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import Grid from "@mui/material/Grid";
import MapIcon from "@mui/icons-material/Map";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";

import { getAdminDemandMap, type DemandMapPoint } from "../../lib/api";

const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431];
const DEFAULT_ZOOM = 11;

const INTENSITY_COLOR: Record<DemandMapPoint["intensity"], string> = {
  high: "#D32F2F",
  medium: "#FB8C00",
  low: "#43A047",
};

const INTENSITY_ORDER: DemandMapPoint["intensity"][] = [
  "high",
  "medium",
  "low",
];

export default function AdminDemandMap() {
  const [points, setPoints] = useState<DemandMapPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminDemandMap();
        if (cancelled) return;
        setPoints(res);
      } catch (err) {
        console.error("Failed to load demand map", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    const sumSessions = points.reduce((s, p) => s + p.sessions, 0);
    const counts = INTENSITY_ORDER.reduce(
      (acc, k) => ({
        ...acc,
        [k]: points.filter((p) => p.intensity === k).length,
      }),
      {} as Record<DemandMapPoint["intensity"], number>,
    );
    return { sumSessions, counts };
  }, [points]);

  const ranked = useMemo(
    () => [...points].sort((a, b) => b.sessions - a.sessions),
    [points],
  );

  const radiusFor = (sessions: number) => {
    // 6 -> 28 px scaled by sessions across the visible range
    const max = points.reduce((m, p) => Math.max(m, p.sessions), 1);
    const min = points.reduce((m, p) => Math.min(m, p.sessions), max);
    if (max === min) return 14;
    const t = (sessions - min) / (max - min);
    return 8 + t * 22;
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <MapIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Demand Map
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Where residents are starting intake sessions, by ZIP. Marker size scales
        with session volume; color shows demand intensity.
      </Typography>

      {/* -- summary chips -------------------------------------------- */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap">
        <Card sx={{ flex: 1, minWidth: 180 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Total Sessions
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {loading ? (
                <Skeleton width={80} />
              ) : (
                totals.sumSessions.toLocaleString()
              )}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 180 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              ZIPs Reached
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {loading ? <Skeleton width={80} /> : points.length}
            </Typography>
          </CardContent>
        </Card>
        {INTENSITY_ORDER.map((key) => (
          <Card key={key} sx={{ flex: 1, minWidth: 180 }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                {key} demand
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    bgcolor: INTENSITY_COLOR[key],
                  }}
                />
                <Typography variant="h4" fontWeight={700}>
                  {loading ? <Skeleton width={40} /> : totals.counts[key]}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: 540, overflow: "hidden" }}>
            {loading ? (
              <Skeleton variant="rectangular" height="100%" />
            ) : (
              <MapContainer
                center={AUSTIN_CENTER}
                zoom={DEFAULT_ZOOM}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {points.map((p) => (
                  <CircleMarker
                    key={p.zip}
                    center={[p.lat, p.lng]}
                    radius={radiusFor(p.sessions)}
                    pathOptions={{
                      color: INTENSITY_COLOR[p.intensity],
                      fillColor: INTENSITY_COLOR[p.intensity],
                      fillOpacity: 0.55,
                      weight: 2,
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -4]}>
                      <Box sx={{ minWidth: 160 }}>
                        <Typography variant="body2" fontWeight={700}>
                          ZIP {p.zip}
                        </Typography>
                        <Typography variant="caption" display="block">
                          {p.sessions} sessions
                        </Typography>
                        <Typography
                          variant="caption"
                          display="block"
                          sx={{ textTransform: "capitalize", mt: 0.5 }}
                        >
                          Top: {p.top_categories.slice(0, 3).join(", ")}
                        </Typography>
                      </Box>
                    </Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            )}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: 540, overflow: "auto" }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Top ZIPs by demand
              </Typography>
              {loading ? (
                <Box sx={{ mt: 2 }}>
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} height={56} sx={{ mb: 1 }} />
                  ))}
                </Box>
              ) : (
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {ranked.map((p) => (
                    <Box
                      key={p.zip}
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          bgcolor: INTENSITY_COLOR[p.intensity],
                          mt: 0.75,
                          flexShrink: 0,
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                          }}
                        >
                          <Typography variant="body2" fontWeight={600}>
                            {p.zip}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {p.sessions}
                          </Typography>
                        </Box>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}
                        >
                          {p.top_categories.slice(0, 3).map((c) => (
                            <Chip
                              key={c}
                              label={c}
                              size="small"
                              variant="outlined"
                              sx={{
                                textTransform: "capitalize",
                                height: 20,
                                fontSize: "0.7rem",
                              }}
                            />
                          ))}
                        </Stack>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
