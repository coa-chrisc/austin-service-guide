// Column-mapping state for the partner-list import. Every column starts from
// the server's proposal, and anything the matcher could not place (or chose
// to drop) starts as "drop": the user must choose a field to include it.

import type { ImportColumn } from "./importApi";

export const DROP = "drop";
const NAME_FIELDS = ["name", "provider_name"];

export interface MappingColumn {
  index: number;
  header: string;
  /** A catalog field, or "drop". */
  choice: string;
  proposed: string;
  reason: string;
  sensitive: boolean;
}

export interface MappingState {
  columns: MappingColumn[];
}

export type MappingAction =
  | { type: "init"; columns: ImportColumn[] }
  | { type: "set"; index: number; choice: string }
  | { type: "reset" };

function proposal(col: ImportColumn): string {
  return col.action === "keep" && col.field ? col.field : DROP;
}

export function mappingReducer(state: MappingState, action: MappingAction): MappingState {
  switch (action.type) {
    case "init":
      return {
        columns: action.columns.map((col) => ({
          index: col.index,
          header: col.header,
          choice: proposal(col),
          proposed: proposal(col),
          reason: col.reason,
          sensitive: col.sensitive,
        })),
      };
    case "set":
      return {
        columns: state.columns.map((col) =>
          col.index === action.index ? { ...col, choice: action.choice || DROP } : col,
        ),
      };
    case "reset":
      return { columns: state.columns.map((col) => ({ ...col, choice: col.proposed })) };
  }
}

export const emptyMapping: MappingState = { columns: [] };

/** Drafts need an organisation or a service name column. */
export function canBuild(state: MappingState): boolean {
  return state.columns.some((col) => NAME_FIELDS.includes(col.choice));
}

/** The mapping the server expects: column index to field or "drop". */
export function toMapping(state: MappingState): Record<string, string> {
  return Object.fromEntries(state.columns.map((col) => [String(col.index), col.choice]));
}

export function keptCount(state: MappingState): number {
  return state.columns.filter((col) => col.choice !== DROP).length;
}
