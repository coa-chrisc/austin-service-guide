import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Pagination from "@mui/material/Pagination";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import InputAdornment from "@mui/material/InputAdornment";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import SearchIcon from "@mui/icons-material/Search";
import PrivacyNotice from "@/components/common/PrivacyNotice";
import PrivacySnackbar from "@/components/common/PrivacySnackbar";
import {
  fetchAllServices,
  fetchCatalogZips,
  parseCategoryParam,
  serviceHasZip,
} from "@/components/common/catalogFilters";
import { useBrandConfig } from "@/hooks/useBrandConfig";
import { scrubPII } from "@/lib/piiGuard";
import ServiceCard from "@/components/services/ServiceCard";
import { getServices, getCategories } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks";
import type { Service, ServiceCategory } from "@/types";

export default function ServiceDirectory() {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategoriesList] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search, 250);
  // Filters come from the URL (?category=a,b&zip=78741) so the landing-page
  // chips can deep-link; a chip click replaces the list with one slug.
  const selectedCategories = parseCategoryParam(searchParams.get("category"));
  const selectedCategory =
    selectedCategories.length === 1 ? selectedCategories[0] : null;
  const zip = searchParams.get("zip") ?? "";
  const categoryKey = selectedCategories.join(",");
  const [zips, setZips] = useState<string[]>([]);
  const [privacyToast, setPrivacyToast] = useState(false);
  const brand = useBrandConfig();
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    setPage(1);
  };
  const [sort, setSort] = useState("name");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [popular, setPopular] = useState<Service[]>([]);
  const popularFetchedRef = useRef(false);
  const pageSize = 12;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryKey, zip]);

  // Mirror the search box into ?q= (replace, so typing doesn't spam history).
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (current === debouncedSearch) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base: Record<string, unknown> = { sort };
      if (debouncedSearch) base.search = debouncedSearch;
      if (openNowOnly) base.open_now = true;
      if (selectedCategories.length <= 1 && !zip) {
        // Single category, no ZIP: the API paginates for us.
        if (selectedCategory) base.category = selectedCategory;
        const res = await getServices({
          ...base,
          page,
          page_size: pageSize,
        } as Parameters<typeof getServices>[0]);
        setServices(res.items);
        setTotalPages(res.total_pages);
      } else {
        // Several categories and/or a ZIP: the API supports neither exactly
        // (zip_code is a radius filter), so filter the full list here.
        const all = await fetchAllServices(
          base as Parameters<typeof fetchAllServices>[0],
        );
        const filtered = all.filter(
          (svc) =>
            (selectedCategories.length === 0 ||
              svc.categories?.some((c) => selectedCategories.includes(c))) &&
            (!zip || serviceHasZip(svc, zip)),
        );
        setTotalPages(Math.max(1, Math.ceil(filtered.length / pageSize)));
        setServices(filtered.slice((page - 1) * pageSize, page * pageSize));
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load services";
      setError(msg);
    } finally {
      setLoading(false);
    }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, categoryKey, zip, sort, openNowOnly]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  useEffect(() => {
    getCategories()
      .then(setCategoriesList)
      .catch(() => {});
    fetchCatalogZips()
      .then(setZips)
      .catch(() => {});
  }, []);

  const showEmptyWithFilters =
    !loading &&
    services.length === 0 &&
    !error &&
    (Boolean(debouncedSearch) || selectedCategories.length > 0 || Boolean(zip));

  useEffect(() => {
    if (!showEmptyWithFilters || popularFetchedRef.current) return;
    popularFetchedRef.current = true;
    getServices({ page: 1, page_size: 3 })
      .then((res) => setPopular(res.items))
      .catch(() => {});
  }, [showEmptyWithFilters]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Service Directory
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Browse all available services across {brand.cityName}
      </Typography>

      {/* Search and filters */}
      <PrivacyNotice sx={{ mb: 2 }} />
      <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField
          placeholder="Search services..."
          value={search}
          onChange={(e) => {
            const { text, kinds } = scrubPII(e.target.value);
            if (kinds.length > 0) setPrivacyToast(true);
            setSearch(text);
          }}
          size="small"
          sx={{ flex: 1, minWidth: 200 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            },
          }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Sort</InputLabel>
          <Select
            value={sort}
            label="Sort"
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="name">Name</MenuItem>
            <MenuItem value="category">Category</MenuItem>
          </Select>
        </FormControl>
        {zips.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="dir-zip-label">ZIP code</InputLabel>
            <Select
              labelId="dir-zip-label"
              value={zip}
              label="ZIP code"
              onChange={(e) => setParam("zip", e.target.value || null)}
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
      </Box>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 3 }}>
          <Chip
            label={openNowOnly ? "Open now ✓" : "Open now"}
            onClick={() => {
              setOpenNowOnly((v) => !v);
              setPage(1);
            }}
            color={openNowOnly ? "success" : "default"}
            variant={openNowOnly ? "filled" : "outlined"}
            size="small"
            sx={{ fontWeight: 600 }}
          />
          <Chip
            label="All Categories"
            onClick={() => {
              setParam("category", null);
            }}
            color={selectedCategories.length === 0 ? "primary" : "default"}
            variant={selectedCategories.length === 0 ? "filled" : "outlined"}
            size="small"
          />
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={`${cat.name} (${cat.service_count})`}
              onClick={() => {
                setParam(
                  "category",
                  selectedCategory === cat.slug ? null : cat.slug,
                );
              }}
              color={selectedCategories.includes(cat.slug) ? "primary" : "default"}
              variant={selectedCategories.includes(cat.slug) ? "filled" : "outlined"}
              size="small"
            />
          ))}
        </Box>
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Service grid */}
      <Grid container spacing={2}>
        {loading
          ? Array.from({ length: pageSize }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton
                  variant="rounded"
                  height={220}
                  sx={{ borderRadius: 3 }}
                />
              </Grid>
            ))
          : services.map((svc) => (
              <Grid key={svc.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <ServiceCard service={svc} highlightQuery={debouncedSearch} />
              </Grid>
            ))}
      </Grid>

      {showEmptyWithFilters && (
        <Box sx={{ py: 6 }}>
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No exact matches
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Try a different keyword or clear your filters.
            </Typography>
          </Box>
          {popular.length > 0 && (
            <Box>
              <Typography
                variant="overline"
                sx={{
                  display: "block",
                  fontWeight: 700,
                  color: "text.secondary",
                  mb: 1.5,
                }}
              >
                Popular near you
              </Typography>
              <Grid container spacing={2}>
                {popular.map((svc) => (
                  <Grid key={svc.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <ServiceCard service={svc} highlightQuery="" />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </Box>
      )}

      {!loading &&
        services.length === 0 &&
        !error &&
        !debouncedSearch &&
        selectedCategories.length === 0 &&
        !zip && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              No services available.
            </Typography>
          </Box>
        )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, p) => setPage(p)}
            color="primary"
          />
        </Box>
      )}
      <PrivacySnackbar open={privacyToast} onClose={() => setPrivacyToast(false)} />
    </Container>
  );
}
