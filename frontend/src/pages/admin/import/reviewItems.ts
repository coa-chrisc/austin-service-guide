// Review decisions to the items the validate and export routes take.

import type { Draft, DraftService, ExportItem, Problem } from "./importApi";

export type Decision =
  | { action: "pending" }
  | { action: "accept" }
  | { action: "reject" }
  | { action: "merge"; target: string };

export function exportPlan(
  drafts: Draft[],
  decisions: Record<string, Decision>,
  edits: Record<string, DraftService>,
): { items: ExportItem[]; keys: string[] } {
  const items: ExportItem[] = [];
  const keys: string[] = [];
  for (const draft of drafts) {
    const decision = decisions[draft.key] ?? { action: "pending" };
    if (decision.action !== "accept" && decision.action !== "merge") continue;
    if (decision.action === "merge" && !decision.target) continue;
    items.push({
      service: edits[draft.key] ?? draft.service,
      merge_into: decision.action === "merge" ? decision.target : null,
      provenance: draft.provenance,
      flags: draft.flags,
      suggestions: draft.suggestions,
    });
    keys.push(draft.key);
  }
  return { items, keys };
}

/** Problems from the server, keyed by draft key; index-less ones under "". */
export function problemsByKey(problems: Problem[], keys: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const problem of problems) {
    const key = problem.index !== null && problem.index < keys.length ? keys[problem.index] : "";
    out[key] = [...(out[key] ?? []), ...problem.errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))];
  }
  return out;
}
