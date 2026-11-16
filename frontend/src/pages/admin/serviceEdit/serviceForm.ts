/**
 * Form model for the admin service editor: load a Service into editable
 * state, build the POST/PATCH body, and map 409/422 issues to fields.
 */

import type { FieldIssue } from "@/lib/api";
import type {
  CostType,
  ProviderType,
  Service,
  ServiceDocument,
  ServiceLocation,
  ServiceStatus,
} from "@/types";
import { hoursToRows, rowsToHours, type HoursRow } from "./hoursForm";

export interface LocationForm {
  /** Stable React key; never sent. */
  key: string;
  /** Empty for a new location: the server assigns loc-<slug>-<n>. */
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  /** Kept as text while typing; parsed on save. */
  latitude: string;
  longitude: string;
  phone: string;
  is_primary: boolean;
  hours_verified: boolean;
  hoursRows: HoursRow[];
}

export interface ServiceForm {
  name: string;
  slug: string;
  provider_name: string;
  provider_type: ProviderType | "";
  description: string;
  eligibility_summary: string;
  eligibility_requires: string[];
  how_to_apply: string;
  cost_type: CostType;
  cost: string;
  website_url: string;
  phone: string;
  email: string;
  categories: string[];
  languages_offered: string[];
  accessibility_features: string[];
  status: ServiceStatus;
  locations: LocationForm[];
  documents: ServiceDocument[];
  last_verified_date: string;
  verified_by: string;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `loc-form-${keySeq}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function emptyLocation(city: string, state: string): LocationForm {
  return {
    key: nextKey(),
    id: "",
    name: "",
    address: "",
    city,
    state,
    zip_code: "",
    latitude: "",
    longitude: "",
    phone: "",
    is_primary: false,
    hours_verified: false,
    hoursRows: hoursToRows({}),
  };
}

export function emptyForm(): ServiceForm {
  return {
    name: "",
    slug: "",
    provider_name: "",
    provider_type: "",
    description: "",
    eligibility_summary: "",
    eligibility_requires: [],
    how_to_apply: "",
    cost_type: "free",
    cost: "",
    website_url: "",
    phone: "",
    email: "",
    categories: [],
    languages_offered: ["en"],
    accessibility_features: [],
    status: "active",
    locations: [],
    documents: [],
    last_verified_date: "",
    verified_by: "",
  };
}

function locationForm(loc: ServiceLocation): LocationForm {
  return {
    key: nextKey(),
    id: loc.id,
    name: loc.name,
    address: loc.address,
    city: loc.city,
    state: loc.state,
    zip_code: loc.zip_code,
    latitude: loc.latitude ? String(loc.latitude) : "",
    longitude: loc.longitude ? String(loc.longitude) : "",
    phone: loc.phone,
    is_primary: loc.is_primary,
    hours_verified: !!loc.hours_verified,
    hoursRows: hoursToRows(loc.hours),
  };
}

export function formFromService(svc: Service): ServiceForm {
  return {
    name: svc.name,
    slug: svc.slug,
    provider_name: svc.provider_name,
    provider_type: svc.provider_type ?? "",
    description: svc.description,
    eligibility_summary: svc.eligibility_summary,
    eligibility_requires: [...(svc.eligibility_requires ?? [])],
    how_to_apply: svc.how_to_apply,
    cost_type: svc.cost_type,
    cost: svc.cost,
    website_url: svc.website_url,
    phone: svc.phone,
    email: svc.email,
    categories: [...svc.categories],
    languages_offered: [...svc.languages_offered],
    accessibility_features: [...svc.accessibility_features],
    status: svc.status,
    locations: svc.locations.map(locationForm),
    documents: svc.documents.map((d) => ({ ...d })),
    last_verified_date: svc.last_verified_date ?? "",
    verified_by: svc.verified_by ?? "",
  };
}

function coordinate(text: string): number {
  const n = Number(text.trim());
  // Blank or unparsable sends 0, which the pack contract rejects with a
  // field error, rather than silently dropping the location from the map.
  return text.trim() && Number.isFinite(n) ? n : 0;
}

/** The POST/PATCH body. `id` and `sources` are never sent (the id is fixed
 *  and sources are kept as loaded). */
export function payloadFromForm(form: ServiceForm): Record<string, unknown> {
  return {
    name: form.name.trim(),
    slug: form.slug.trim(),
    provider_name: form.provider_name.trim(),
    provider_type: form.provider_type || null,
    description: form.description,
    eligibility_summary: form.eligibility_summary,
    eligibility_requires: form.eligibility_requires,
    how_to_apply: form.how_to_apply,
    cost_type: form.cost_type,
    cost: form.cost,
    website_url: form.website_url.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    categories: form.categories,
    languages_offered: form.languages_offered,
    accessibility_features: form.accessibility_features,
    status: form.status,
    locations: form.locations.map((loc) => ({
      ...(loc.id ? { id: loc.id } : {}),
      name: loc.name,
      address: loc.address,
      city: loc.city,
      state: loc.state,
      zip_code: loc.zip_code.trim(),
      latitude: coordinate(loc.latitude),
      longitude: coordinate(loc.longitude),
      phone: loc.phone,
      is_primary: loc.is_primary,
      hours_verified: loc.hours_verified,
      hours: rowsToHours(loc.hoursRows),
    })),
    documents: form.documents,
    last_verified_date: form.last_verified_date || null,
    verified_by: form.verified_by.trim(),
  };
}

/** Issues keyed by dotted field path ("categories", "locations.0.latitude");
 *  issues not tied to a field go under "" (shown above the form). */
export function issuesByField(issues: FieldIssue[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.loc[0] === "body" ? issue.loc.slice(1) : issue.loc;
    const key = path.join(".");
    (out[key] ??= []).push(issue.msg);
  }
  return out;
}

/** The first message for a field or anything beneath it. */
export function fieldError(errors: Record<string, string[]>, key: string): string | undefined {
  if (errors[key]) return errors[key][0];
  const nested = Object.keys(errors).find((k) => k.startsWith(`${key}.`));
  return nested ? errors[nested][0] : undefined;
}
