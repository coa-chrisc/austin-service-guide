import { useEffect, useState, useCallback, useRef } from "react";
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
import ServiceCard from "@/components/services/ServiceCard";
import { getServices, getCategories } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks";
import type { Service, ServiceCategory } from "@/types";

export default function ServiceDirectory() {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategoriesList] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sort, setSort] = useState("name");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [popular, setPopular] = useState<Service[]>([]);
  const popularFetchedRef = useRef(false);
  const pageSize = 12;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {
        page,
        page_size: pageSize,
        sort,
      };
      if (debouncedSearch)
        (params as Record<string, string>).search = debouncedSearch;
      if (selectedCategory)
        (params as Record<string, string>).category = selectedCategory;
      if (openNowOnly) (params as Record<string, boolean>).open_now = true;
      const res = await getServices(
        params as Parameters<typeof getServices>[0],
      );
      setServices(res.items);
      setTotalPages(res.total_pages);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load services";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, selectedCategory, sort, openNowOnly]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  useEffect(() => {
    getCategories()
      .then(setCategoriesList)
      .catch(() => {});
  }, []);

  const showEmptyWithFilters =
    !loading &&
    services.length === 0 &&
    !error &&
    (Boolean(debouncedSearch) || Boolean(selectedCategory));

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
        Browse all available services across Austin
      </Typography>

      {/* Search and filters */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
              setSelectedCategory(null);
              setPage(1);
            }}
            color={!selectedCategory ? "primary" : "default"}
            variant={!selectedCategory ? "filled" : "outlined"}
            size="small"
          />
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={`${cat.name} (${cat.service_count})`}
              onClick={() => {
                setSelectedCategory(
                  selectedCategory === cat.slug ? null : cat.slug,
                );
                setPage(1);
              }}
              color={selectedCategory === cat.slug ? "primary" : "default"}
              variant={selectedCategory === cat.slug ? "filled" : "outlined"}
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
        !selectedCategory && (
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
    </Container>
  );
}
