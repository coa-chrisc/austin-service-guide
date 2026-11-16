import { describe, expect, it } from "vitest";

import type { ImportColumn } from "./importApi";
import { DROP, canBuild, emptyMapping, keptCount, mappingReducer, toMapping } from "./mappingReducer";

const col = (index: number, header: string, action: "keep" | "drop", field: string | null, sensitive = false): ImportColumn => ({
  index,
  letter: String.fromCharCode(65 + index),
  header,
  action,
  field,
  reason: "",
  sensitive,
});

const COLUMNS = [
  col(0, "Organization", "keep", "provider_name"),
  col(1, "Contact Name", "drop", null, true),
  col(2, "Region", "drop", null),
  col(3, "Main Phone", "keep", "phone"),
];

describe("mappingReducer", () => {
  it("starts from the proposal and drops every column the matcher did not keep", () => {
    const state = mappingReducer(emptyMapping, { type: "init", columns: COLUMNS });
    expect(toMapping(state)).toEqual({ "0": "provider_name", "1": DROP, "2": DROP, "3": "phone" });
    expect(keptCount(state)).toBe(2);
  });

  it("drops a column even when the server named a field but chose to drop it", () => {
    const state = mappingReducer(emptyMapping, { type: "init", columns: [col(0, "Odd", "drop", "phone")] });
    expect(state.columns[0].choice).toBe(DROP);
  });

  it("includes an unknown column only when the user picks a field, and reset restores the proposal", () => {
    let state = mappingReducer(emptyMapping, { type: "init", columns: COLUMNS });
    state = mappingReducer(state, { type: "set", index: 2, choice: "city" });
    expect(toMapping(state)["2"]).toBe("city");
    state = mappingReducer(state, { type: "set", index: 2, choice: "" });
    expect(toMapping(state)["2"]).toBe(DROP);
    state = mappingReducer(state, { type: "set", index: 0, choice: DROP });
    state = mappingReducer(state, { type: "reset" });
    expect(toMapping(state)["0"]).toBe("provider_name");
  });

  it("cannot build drafts without an organisation or service name column", () => {
    let state = mappingReducer(emptyMapping, { type: "init", columns: COLUMNS });
    expect(canBuild(state)).toBe(true);
    state = mappingReducer(state, { type: "set", index: 0, choice: DROP });
    expect(canBuild(state)).toBe(false);
    state = mappingReducer(state, { type: "set", index: 2, choice: "name" });
    expect(canBuild(state)).toBe(true);
  });

  it("cannot build from an empty mapping", () => {
    expect(canBuild(emptyMapping)).toBe(false);
  });
});
