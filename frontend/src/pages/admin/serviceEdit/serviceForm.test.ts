import { describe, expect, it } from "vitest";
import type { Service } from "@/types";
import {
  emptyLocation,
  fieldError,
  formFromService,
  issuesByField,
  payloadFromForm,
} from "./serviceForm";

const SERVICE: Service = {
  id: "svc-wic",
  name: "WIC",
  slug: "austin-public-health-wic",
  provider_name: "Austin Public Health",
  description: "Food for families.",
  eligibility_summary: "Pregnant people and children under 5.",
  eligibility_requires: ["has_children"],
  how_to_apply: "Call.",
  cost: "Free",
  cost_type: "free",
  website_url: "https://example.org",
  phone: "512-555-0100",
  email: "",
  languages_offered: ["en", "es"],
  accessibility_features: [],
  status: "active",
  categories: ["food"],
  locations: [
    {
      id: "loc-wic-1",
      service_id: "svc-wic",
      name: "North",
      address: "1 Main St",
      city: "Austin",
      state: "TX",
      zip_code: "78753",
      latitude: 30.35,
      longitude: -97.69,
      phone: "",
      is_primary: true,
      hours: { monday: "8:00 AM – 5:00 PM", saturday: "Closed" },
      hours_verified: true,
    },
  ],
  documents: [],
  last_verified_date: null,
  verified_by: "",
  sources: [{ url: "https://example.org/wic" }],
};

describe("service form", () => {
  it("round-trips a loaded service without changing it", () => {
    const body = payloadFromForm(formFromService(SERVICE));
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("sources");
    expect(body.categories).toEqual(["food"]);
    expect(body.eligibility_requires).toEqual(["has_children"]);
    const [loc] = body.locations as Record<string, unknown>[];
    expect(loc).toMatchObject({
      id: "loc-wic-1",
      latitude: 30.35,
      longitude: -97.69,
      is_primary: true,
      hours_verified: true,
      hours: { monday: "8:00 AM – 5:00 PM", saturday: "Closed" },
    });
    expect(loc).not.toHaveProperty("service_id");
    expect(body.last_verified_date).toBeNull();
  });

  it("sends a new location without an id so the server names it", () => {
    const form = formFromService(SERVICE);
    form.locations.push(emptyLocation("Austin", "TX"));
    const locs = payloadFromForm(form).locations as Record<string, unknown>[];
    expect(locs[1]).not.toHaveProperty("id");
    expect(locs[1].hours).toEqual({});
    expect(locs[1].latitude).toBe(0);
  });

  it("maps server issues to dotted field paths", () => {
    const errors = issuesByField([
      { type: "unknown_category", loc: ["body", "categories", 0], msg: "unknown category 'Food Assistance'" },
      { type: "zero_coordinates", loc: ["body", "locations", 1, "latitude"], msg: "latitude is 0" },
      { type: "conflict", loc: ["body"], msg: "slug in use" },
    ]);
    expect(fieldError(errors, "categories")).toMatch(/unknown category/);
    expect(fieldError(errors, "locations.1")).toBe("latitude is 0");
    expect(fieldError(errors, "locations.1.latitude")).toBe("latitude is 0");
    expect(fieldError(errors, "locations.0")).toBeUndefined();
    expect(errors[""]).toEqual(["slug in use"]);
  });
});
