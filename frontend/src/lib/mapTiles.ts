// Map tile source for the resident map and the admin demand map. Set at build
// time with VITE_MAP_TILE_URL / VITE_MAP_TILE_ATTRIBUTION (see
// docs/CUSTOMIZING.md); unset uses OpenStreetMap's public tile server. The
// build fails when a custom URL comes without an attribution (vite.config.ts).

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || OSM_TILE_URL;
export const TILE_ATTRIBUTION = import.meta.env.VITE_MAP_TILE_ATTRIBUTION || OSM_TILE_ATTRIBUTION;
