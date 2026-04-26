import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import ListIcon from "@mui/icons-material/List";
import CloseIcon from "@mui/icons-material/Close";
import ServiceMap, {
  getCategoryDisplayName,
} from "@/components/map/ServiceMap";
import { getMapPins, getIntakeResults } from "@/lib/api";
import type { MapPin } from "@/types";

export default function MapView() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [planServiceIds, setPlanServiceIds] = useState<Set<string> | null>(
    null,
  );
  const [showOnlyPlan, setShowOnlyPlan] = useState<boolean>(!!sessionId);

  useEffect(() => {
    getMapPins()
      .then(setPins)
      .catch((err) => setError(err.message || "Failed to load map data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setPlanServiceIds(null);
      return;
    }
    let cancelled = false;
    getIntakeResults(sessionId)
      .then((res) => {
        if (cancelled) return;
        const ids = new Set(res.application_order.map((i) => i.service_id));
        if (ids.size === 0) {
          setPlanServiceIds(null);
          setShowOnlyPlan(false);
          return;
        }
        setPlanServiceIds(ids);
      })
      .catch(() => {
        if (cancelled) return;
        setPlanServiceIds(null);
        setShowOnlyPlan(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const categories = useMemo(() => {
    const cats = new Set(pins.map((p) => p.category));
    return Array.from(cats).sort();
  }, [pins]);

  const handleCategoryToggle = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const planActive = showOnlyPlan && planServiceIds !== null;

  const filteredPins = useMemo(() => {
    let result = pins;
    if (planActive && planServiceIds) {
      result = result.filter((p) => planServiceIds.has(p.service_id));
    }
    if (selectedCategories.length > 0) {
      result = result.filter((p) => selectedCategories.includes(p.category));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [pins, selectedCategories, search, planActive, planServiceIds]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "calc(100vh - 64px)",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const listContent = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {planServiceIds && (
        <Box
          sx={{
            p: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            bgcolor: planActive ? "primary.main" : "action.hover",
            color: planActive ? "primary.contrastText" : "text.primary",
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {planActive
              ? `Showing ${filteredPins.length} plan ${
                  filteredPins.length === 1 ? "pin" : "pins"
                }`
              : "Showing all"}
          </Typography>
          <Button
            size="small"
            variant={planActive ? "outlined" : "contained"}
            onClick={() => setShowOnlyPlan((v) => !v)}
            sx={{
              fontWeight: 600,
              bgcolor: planActive ? "transparent" : "primary.main",
              color: planActive
                ? "primary.contrastText"
                : "primary.contrastText",
              borderColor: planActive ? "primary.contrastText" : undefined,
              "&:hover": {
                bgcolor: planActive ? "rgba(255,255,255,0.12)" : "primary.dark",
              },
            }}
          >
            {planActive ? "Show all" : "Back to plan"}
          </Button>
        </Box>
      )}
      <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1,
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            Services ({filteredPins.length})
          </Typography>
          {isMobile && (
            <IconButton onClick={() => setListOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          )}
        </Box>
        <TextField
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
      <List sx={{ flex: 1, overflowY: "auto" }} dense>
        {filteredPins.map((pin) => (
          <ListItemButton key={pin.id}>
            <ListItemText
              primary={pin.name}
              secondary={
                <Chip
                  label={getCategoryDisplayName(pin.category)}
                  size="small"
                  sx={{ mt: 0.5, fontSize: 11, height: 20 }}
                />
              }
            />
          </ListItemButton>
        ))}
        {filteredPins.length === 0 && (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No services found
            </Typography>
          </Box>
        )}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
      {/* Desktop: side list */}
      {!isMobile && (
        <Box
          sx={{
            width: 360,
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          {listContent}
        </Box>
      )}

      {/* Map */}
      <Box sx={{ flex: 1, position: "relative" }}>
        <ServiceMap
          pins={filteredPins}
          categories={categories}
          selectedCategories={
            selectedCategories.length > 0 ? selectedCategories : undefined
          }
          onCategoryToggle={handleCategoryToggle}
          showControls
          fitBounds
        />

        {/* Mobile: list toggle button */}
        {isMobile && (
          <IconButton
            onClick={() => setListOpen(true)}
            sx={{
              position: "absolute",
              bottom: 80,
              right: 16,
              zIndex: 1000,
              bgcolor: "background.paper",
              boxShadow: 2,
              "&:hover": { bgcolor: "grey.100" },
            }}
          >
            <ListIcon color="primary" />
          </IconButton>
        )}
      </Box>

      {/* Mobile: list drawer */}
      {isMobile && (
        <Drawer
          anchor="bottom"
          open={listOpen}
          onClose={() => setListOpen(false)}
          slotProps={{
            paper: {
              sx: {
                height: "60vh",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
              },
            },
          }}
        >
          {listContent}
        </Drawer>
      )}
    </Box>
  );
}
