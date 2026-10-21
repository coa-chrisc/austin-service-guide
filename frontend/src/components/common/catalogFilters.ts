import { getServices } from "@/lib/api";
import type { Service } from "@/types";

/** A need-category shortcut: label -> real catalog category slugs and/or a keyword. */
export interface NeedShortcut {
  label: string;
  /** Slugs from backend/app/data/categories.yaml. */
  categories: string[];
  /** Fallback keyword search for needs with no dedicated category. */
  search?: string;
}

export const NEED_SHORTCUTS: NeedShortcut[] = [
  { label: "Food & Nutrition", categories: ["food", "nutrition"] },
  { label: "Healthcare & Clinics", categories: ["healthcare"] },
  { label: "Housing & Utilities", categories: ["housing", "utilities"] },
  // No maternal-health category exists; childcare ("Childcare & Family") is the closest.
  { label: "Maternal & Child Health", categories: ["childcare"] },
  // No financial-assistance category exists; keyword search instead.
  {
    label: "Financial & Benefits Assistance",
    categories: [],
    search: "financial assistance",
  },
  { label: "Mental Health & Support", categories: ["mental_health"] },
];

/** Build a /services URL carrying the directory's filter params. */
export function directoryPath(opts: {
  categories?: string[];
  search?: string;
  zip?: string;
}): string {
  const sp = new URLSearchParams();
  if (opts.categories?.length) sp.set("category", opts.categories.join(","));
  if (opts.search) sp.set("q", opts.search);
  if (opts.zip) sp.set("zip", opts.zip);
  const qs = sp.toString();
  return `/services${qs ? `?${qs}` : ""}`;
}

export function parseCategoryParam(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serviceHasZip(svc: Service, zip: string): boolean {
  return svc.locations?.some((l) => l.zip_code === zip) ?? false;
}

/** Fetch every catalog page (pageSize 100 is the API maximum). */
export async function fetchAllServices(
  params: { search?: string; sort?: string; open_now?: boolean; category?: string } = {},
): Promise<Service[]> {
  const out: Service[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await getServices({ ...params, page, page_size: 100 });
    out.push(...res.items);
    totalPages = res.total_pages;
    page += 1;
  } while (page <= totalPages);
  return out;
}

let zipPromise: Promise<string[]> | null = null;

/** Sorted ZIP codes present in catalog locations (cached per page load). */
export function fetchCatalogZips(): Promise<string[]> {
  if (!zipPromise) {
    zipPromise = fetchAllServices()
      .then((svcs) => {
        const zips = new Set<string>();
        for (const s of svcs)
          for (const l of s.locations ?? []) if (l.zip_code) zips.add(l.zip_code);
        return [...zips].sort();
      })
      .catch((err) => {
        zipPromise = null;
        throw err;
      });
  }
  return zipPromise;
}
