import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import { useTheme } from "@mui/material/styles";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import type { MapPin } from "@/types";
import { haversineMiles } from "@/lib/geo";

const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431];
const DEFAULT_ZOOM = 11;

/* ── Category visual config ─────────────────────────────────────────── */

interface CategoryStyle {
  color: string;
  svg: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  food: {
    color: "#FF8F00",
    svg: `<path d="M4 2v5h2v7h2V7h2V2H8V6H7V2H6v4H5V2H4zm8 0v6h2v8h2V2h-4z" fill="white"/>`,
  },
  healthcare: {
    color: "#F83125",
    svg: `<path d="M6 2v4H2v4h4v4h4v-4h4V6h-4V2H6z" fill="white"/>`,
  },
  housing: {
    color: "#009F4D",
    svg: `<path d="M8 1L1 7h2v7h4v-4h2v4h4V7h2L8 1z" fill="white"/>`,
  },
  employment: {
    color: "#44499C",
    svg: `<path d="M6 2v2H2v10h12V4h-4V2H6zm2 0h0zm-4 4h8v6H4V6z" fill="white"/><rect x="5" y="3" width="6" height="1" fill="white"/>`,
  },
  education: {
    color: "#009CDE",
    svg: `<path d="M8 1L1 5l7 4 7-4-7-4zM3 7v4l5 3 5-3V7L8 10 3 7z" fill="white"/>`,
  },
  legal: {
    color: "#8F5201",
    svg: `<path d="M8 1L3 4v1h10V4L8 1zM3 6v2l1 4h1L4 8V6H3zm9 0v2l-1 4h-1l1-4V6h1zM3 13v1h10v-1H3z" fill="white"/>`,
  },
  transportation: {
    color: "#636262",
    svg: `<path d="M5 1C3.3 1 2 2.3 2 4v6l1 2v1.5c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5V13h6v.5c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5V12l1-2V4c0-1.7-1.3-3-3-3H5zm0 2h6c.6 0 1 .4 1 1v3H4V4c0-.6.4-1 1-1zM4.5 10a1 1 0 110 2 1 1 0 010-2zm7 0a1 1 0 110 2 1 1 0 010-2z" fill="white"/>`,
  },
  childcare: {
    color: "#FFC600",
    svg: `<path d="M8 2a3 3 0 100 6 3 3 0 000-6zM4 10c-1.1 0-2 .9-2 2v2h12v-2c0-1.1-.9-2-2-2H4z" fill="white"/>`,
  },
  utilities: {
    color: "#22254E",
    svg: `<path d="M7 1L4 8h3v7l5-9H9L11 1H7z" fill="white"/>`,
  },
  senior: {
    color: "#008743",
    svg: `<path d="M8 2a2 2 0 100 4 2 2 0 000-4zM7 7c-1.7 0-3 1.3-3 3v1h2l.5 4h3L10 11h2v-1c0-1.7-1.3-3-3-3H7z" fill="white"/>`,
  },
  disability: {
    color: "#9F3CC9",
    svg: `<path d="M8 1.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM7 5.5v3l-2 4h2l1.5-3L10 13h2l-3-5V5.5H7z" fill="white"/>`,
  },
  veterans: {
    color: "#22254E",
    svg: `<path d="M8 1l1.8 3.6L14 5.3l-3 2.9.7 4.1L8 10.5l-3.7 1.8.7-4.1-3-2.9 4.2-.7L8 1z" fill="white"/>`,
  },
  immigration: {
    color: "#005027",
    svg: `<path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2c.4 0 .8.4 1.1 1H6.9c.3-.6.7-1 1.1-1zM4.1 6h2.4C6.3 6.6 6.2 7.3 6.2 8H3.1c0-.7.4-1.4 1-2zm0 4h2.1c.1.7.2 1.4.3 2H4.1a5 5 0 01-1-2zm3.9 3c-.4 0-.8-.4-1.1-1h2.2c-.3.6-.7 1-1.1 1zm1.5-3H6.5c-.1-.6-.2-1.3-.2-2h3.4c0 .7-.1 1.4-.2 2zm.4-4H6.1c.2-.6.4-1.2.6-2h2.6c.2.8.4 1.4.6 2zm2 0h-1.4c.1-.6.2-1.3.3-2h2.1a5 5 0 011 2z" fill="white"/>`,
  },
  emergency: {
    color: "#F83125",
    svg: `<path d="M1 13h14L8 1 1 13zm7.5-2h-1v-1h1v1zm0-2h-1V7h1v2z" fill="white"/>`,
  },
  mental_health: {
    color: "#9F3CC9",
    svg: `<path d="M8 2C5.2 2 3 4.2 3 7c0 1.9 1 3.5 2.5 4.3V13h5v-1.7C12 10.5 13 8.9 13 7c0-2.8-2.2-5-5-5zm0 2c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm-2 3h4v1H6V7z" fill="white"/>`,
  },
  financial: {
    color: "#008743",
    svg: `<path d="M8 2a6 6 0 100 12A6 6 0 008 2zm.5 3v1c1 .2 1.5.7 1.5 1.5 0 .7-.5 1.2-1.5 1.4v1.5c.3 0 .6-.1.9-.3l.6.8c-.4.3-1 .5-1.5.6V12h-1v-1.5C6.5 10.3 6 9.8 6 9c0-.8.5-1.3 1.5-1.5V6c-.2 0-.4.1-.7.2L6.2 5.4c.4-.3.9-.4 1.3-.4V4h1zM7 7.7c-.3.1-.5.3-.5.6 0 .3.2.5.5.6V7.7zm1 2.7c.3-.1.5-.3.5-.6s-.2-.5-.5-.6v1.2z" fill="white"/>`,
  },
};

const CATEGORY_SLUG_MAP: Record<string, string> = {
  "Food Assistance": "food",
  Healthcare: "healthcare",
  "Mental Health": "mental_health",
  Housing: "housing",
  Employment: "employment",
  Education: "education",
  "Legal Aid": "legal",
  Transportation: "transportation",
  "Child Care": "childcare",
  "Childcare & Family": "childcare",
  "Utility Assistance": "utilities",
  Utilities: "utilities",
  "Senior Services": "senior",
  "Disability Services": "disability",
  "Veterans Services": "veterans",
  "Immigration Services": "immigration",
  Emergency: "emergency",
  "Financial Assistance": "financial",
};

const SLUG_DISPLAY_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_SLUG_MAP).map(([display, slug]) => [slug, display]),
);

function getCategorySlug(category: string): string {
  return (
    CATEGORY_SLUG_MAP[category] || category.toLowerCase().replace(/\s+/g, "_")
  );
}

export function getCategoryDisplayName(category: string): string {
  return (
    SLUG_DISPLAY_MAP[category] ??
    category.charAt(0).toUpperCase() + category.slice(1)
  );
}

function getCategoryColor(category: string): string {
  const slug = getCategorySlug(category);
  return CATEGORY_STYLES[slug]?.color ?? "#757575";
}

const iconCache = new Map<string, L.DivIcon>();

function createCategoryIcon(category: string): L.DivIcon {
  const slug = getCategorySlug(category);
  if (iconCache.has(slug)) return iconCache.get(slug)!;

  const style = CATEGORY_STYLES[slug];
  const color = style?.color ?? "#757575";
  const svgInner = style?.svg ?? `<circle cx="8" cy="8" r="4" fill="white"/>`;

  const icon = L.divIcon({
    html: `<svg viewBox="0 0 40 52" width="40" height="52" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))">
      <path d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="20" cy="18" r="12" fill="${color}"/>
      <svg x="10" y="8" width="20" height="20" viewBox="0 0 16 16">${svgInner}</svg>
    </svg>`,
    className: "",
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    popupAnchor: [0, -48],
  });

  iconCache.set(slug, icon);
  return icon;
}

/* ── Map helper components ──────────────────────────────────────────── */

function InvalidateSize() {
  const map = useMap();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    [0, 100, 300, 600, 1200].forEach((delay) => {
      timers.push(
        setTimeout(() => map.invalidateSize({ animate: false }), delay),
      );
    });

    const observer = new ResizeObserver(() => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => map.invalidateSize({ animate: false }),
        50,
      );
    });
    const container = map.getContainer();
    observer.observe(container);

    const onMove = () => map.invalidateSize({ animate: false });
    window.addEventListener("resize", onMove);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(debounceRef.current);
      observer.disconnect();
      window.removeEventListener("resize", onMove);
    };
  }, [map]);

  return null;
}

function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    const timer = setTimeout(() => {
      if (pins.length === 1) {
        map.setView([pins[0].latitude, pins[0].longitude], 14);
        return;
      }
      const bounds = L.latLngBounds(
        pins.map((p) => [p.latitude, p.longitude] as [number, number]),
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }, 200);
    return () => clearTimeout(timer);
  }, [map, pins]);
  return null;
}

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, 13);
  }, [map, position]);
  return null;
}

function NearestFitter({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    const bounds = L.latLngBounds(
      pins.map((p) => [p.latitude, p.longitude] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }, [map, pins]);
  return null;
}

/* ── Main component ─────────────────────────────────────────────────── */

interface ServiceMapProps {
  pins: MapPin[];
  height?: string | number;
  categories?: string[];
  selectedCategories?: string[];
  onCategoryToggle?: (category: string) => void;
  showControls?: boolean;
  fitBounds?: boolean;
}

export default function ServiceMap({
  pins,
  height = "100%",
  categories = [],
  selectedCategories,
  onCategoryToggle,
  showControls = true,
  fitBounds = false,
}: ServiceMapProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [userPosition, setUserPosition] = useState<[number, number] | null>(
    null,
  );
  const [mapReady, setMapReady] = useState(false);
  const [nearestActive, setNearestActive] = useState(false);

  const filteredPins = useMemo(() => {
    if (!selectedCategories || selectedCategories.length === 0) return pins;
    return pins.filter((p) => selectedCategories.includes(p.category));
  }, [pins, selectedCategories]);

  const distancesById = useMemo(() => {
    const map = new Map<string, number>();
    if (!userPosition) return map;
    const origin = { lat: userPosition[0], lng: userPosition[1] };
    for (const p of filteredPins) {
      map.set(
        p.id,
        haversineMiles(origin, { lat: p.latitude, lng: p.longitude }),
      );
    }
    return map;
  }, [filteredPins, userPosition]);

  const nearestPins = useMemo(() => {
    if (!userPosition || filteredPins.length === 0) return [];
    return [...filteredPins]
      .sort(
        (a, b) =>
          (distancesById.get(a.id) ?? 0) - (distancesById.get(b.id) ?? 0),
      )
      .slice(0, 5);
  }, [filteredPins, userPosition, distancesById]);

  const nearestIds = useMemo(
    () => new Set(nearestActive ? nearestPins.map((p) => p.id) : []),
    [nearestActive, nearestPins],
  );

  useEffect(() => {
    if (nearestActive && (!userPosition || nearestPins.length === 0)) {
      setNearestActive(false);
    }
  }, [nearestActive, userPosition, nearestPins.length]);

  const clusterIconCreate = useCallback(
    (cluster: { getChildCount: () => number }) => {
      const count = cluster.getChildCount();
      const size = count < 10 ? 36 : count < 50 ? 44 : 52;
      const color = theme.palette.primary.main;
      return L.divIcon({
        html: `<div style="
          background:${color};
          color:white;
          width:${size}px;height:${size}px;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:13px;font-family:inherit;
          border:3px solid rgba(255,255,255,0.9);
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
        ">${count}</div>`,
        className: "",
        iconSize: [size, size],
      });
    },
    [theme.palette.primary.main],
  );

  const allCategories = useMemo(() => {
    if (categories.length > 0) return categories;
    const cats = new Set(pins.map((p) => p.category));
    return Array.from(cats).sort();
  }, [pins, categories]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPosition([pos.coords.latitude, pos.coords.longitude]),
      () => {},
    );
  };

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  return (
    <Box
      sx={{
        position: "relative",
        height,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Category filter chips */}
      {showControls && allCategories.length > 0 && (
        <Box
          sx={{
            display: "flex",
            gap: 0.75,
            flexWrap: "wrap",
            p: 1.5,
            bgcolor: "background.paper",
            borderBottom: "1px solid",
            borderColor: "divider",
            zIndex: 1000,
          }}
        >
          {allCategories.map((cat) => {
            const isSelected =
              !selectedCategories || selectedCategories.includes(cat);
            return (
              <Chip
                key={cat}
                label={getCategoryDisplayName(cat)}
                size="small"
                onClick={() => onCategoryToggle?.(cat)}
                sx={{
                  fontWeight: 600,
                  fontSize: 12,
                  bgcolor: isSelected ? getCategoryColor(cat) : "transparent",
                  color: isSelected ? "white" : "text.secondary",
                  borderColor: getCategoryColor(cat),
                  border: "1px solid",
                  "&:hover": {
                    bgcolor: isSelected
                      ? getCategoryColor(cat)
                      : "action.hover",
                  },
                }}
              />
            );
          })}
        </Box>
      )}

      {/* Map */}
      <Box sx={{ flex: 1, position: "relative", minHeight: 200 }}>
        <MapContainer
          center={AUSTIN_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%", zIndex: 1 }}
          scrollWheelZoom
          whenReady={handleMapReady}
        >
          <InvalidateSize />
          {fitBounds && mapReady && <FitBounds pins={filteredPins} />}

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            keepBuffer={4}
            updateWhenZooming={false}
            updateWhenIdle={true}
          />

          {userPosition && <Recenter position={userPosition} />}
          {nearestActive && nearestPins.length > 0 && (
            <NearestFitter pins={nearestPins} />
          )}

          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={clusterIconCreate}
            showCoverageOnHover={false}
          >
            {filteredPins.map((pin) => {
              const distanceMi = distancesById.get(pin.id);
              const isHighlighted = nearestIds.has(pin.id);
              return (
                <Marker
                  key={pin.id}
                  position={[pin.latitude, pin.longitude]}
                  icon={createCategoryIcon(pin.category)}
                  opacity={isHighlighted ? 1 : nearestActive ? 0.55 : 1}
                >
                  <Popup>
                    <Box sx={{ minWidth: 220, p: 0.5 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 700,
                          fontSize: 14,
                          mb: 0.5,
                          lineHeight: 1.3,
                        }}
                      >
                        {pin.name}
                      </Typography>
                      <Chip
                        label={getCategoryDisplayName(pin.category)}
                        size="small"
                        sx={{
                          bgcolor: getCategoryColor(pin.category),
                          color: "white",
                          fontSize: 12,
                          height: 24,
                          fontWeight: 600,
                          mb: distanceMi != null ? 0.5 : 1.5,
                        }}
                      />
                      {distanceMi != null && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mb: 1.5 }}
                        >
                          {distanceMi.toFixed(1)} mi away
                        </Typography>
                      )}
                      <Box>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() =>
                            navigate(`/services/${pin.service_id}`)
                          }
                          sx={{
                            fontWeight: 600,
                            fontSize: 13,
                            borderRadius: "16px",
                            py: 0.75,
                          }}
                        >
                          View Details
                        </Button>
                      </Box>
                    </Box>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>

          {userPosition && (
            <Marker
              position={userPosition}
              icon={L.divIcon({
                html: `<div style="
                  background: #009CDE;
                  width: 18px; height: 18px;
                  border-radius: 50%;
                  border: 3px solid white;
                  box-shadow: 0 0 0 3px rgba(0,156,222,0.3), 0 2px 8px rgba(0,0,0,0.3);
                "></div>`,
                className: "",
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            >
              <Popup>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, fontSize: 14 }}
                >
                  Your Location
                </Typography>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {userPosition && filteredPins.length > 0 && (
          <Chip
            label="Nearest 5"
            clickable
            color={nearestActive ? "primary" : "default"}
            variant={nearestActive ? "filled" : "outlined"}
            onClick={() => setNearestActive((v) => !v)}
            sx={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 1000,
              fontWeight: 600,
              bgcolor: nearestActive ? "primary.main" : "background.paper",
              color: nearestActive ? "primary.contrastText" : "text.primary",
              boxShadow: "0 2px 6px rgba(34, 37, 78, 0.2)",
              borderColor: "primary.main",
            }}
          />
        )}

        {showControls && (
          <IconButton
            onClick={handleLocateMe}
            sx={{
              position: "absolute",
              bottom: 24,
              right: 16,
              zIndex: 1000,
              bgcolor: "background.paper",
              boxShadow: "0 2px 6px rgba(34, 37, 78, 0.2)",
              "&:hover": { bgcolor: "grey.100" },
              width: 44,
              height: 44,
            }}
            aria-label="Find my location"
          >
            <MyLocationIcon color="primary" />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
