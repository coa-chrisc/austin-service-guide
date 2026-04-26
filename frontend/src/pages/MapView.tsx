import { useEffect, useState, useMemo } from "react";
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
import { getMapPins } from "@/lib/api";
import type { MapPin } from "@/types";

export default function MapView() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    getMapPins()
      .then(setPins)
      .catch((err) => setError(err.message || "Failed to load map data"))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(pins.map((p) => p.category));
    return Array.from(cats).sort();
  }, [pins]);

  const handleCategoryToggle = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const filteredPins = useMemo(() => {
    let result = pins;
    if (selectedCategories.length > 0) {
      result = result.filter((p) => selectedCategories.includes(p.category));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [pins, selectedCategories, search]);

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
