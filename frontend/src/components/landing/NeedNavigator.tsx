import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import ChatIcon from "@mui/icons-material/Chat";
import LanguageSelector from "@/components/common/LanguageSelector";
import {
  NEED_SHORTCUTS,
  directoryPath,
  fetchCatalogZips,
} from "@/components/common/catalogFilters";

/** Structured, no-typing entry point: need chips + optional ZIP and language. */
export default function NeedNavigator() {
  const navigate = useNavigate();
  const [zips, setZips] = useState<string[]>([]);
  const [zip, setZip] = useState("");

  useEffect(() => {
    fetchCatalogZips()
      .then(setZips)
      .catch(() => setZips([]));
  }, []);

  return (
    <Box
      component="section"
      aria-labelledby="need-nav-heading"
      sx={{ bgcolor: "background.paper", py: { xs: 4, md: 5 }, px: 2 }}
    >
      <Box sx={{ maxWidth: 900, mx: "auto", textAlign: "center" }}>
        <Typography
          id="need-nav-heading"
          variant="h5"
          component="h2"
          fontWeight={700}
          gutterBottom
        >
          What do you need help with?
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1.25,
            justifyContent: "center",
            my: 2.5,
          }}
        >
          {NEED_SHORTCUTS.map((need) => (
            <Chip
              key={need.label}
              label={need.label}
              color="primary"
              variant="outlined"
              clickable
              onClick={() =>
                navigate(
                  directoryPath({
                    categories: need.categories,
                    search: need.search,
                    zip,
                  }),
                )
              }
              sx={{ fontWeight: 600, fontSize: "0.95rem", height: 40 }}
            />
          ))}
        </Box>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {zips.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="need-nav-zip-label">ZIP code (optional)</InputLabel>
              <Select
                labelId="need-nav-zip-label"
                label="ZIP code (optional)"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              >
                <MenuItem value="">Any ZIP code</MenuItem>
                {zips.map((z) => (
                  <MenuItem key={z} value={z}>
                    {z}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <LanguageSelector />
          <Button
            onClick={() => navigate("/intake")}
            startIcon={<ChatIcon />}
            disableElevation
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            Prefer to talk it through?
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
