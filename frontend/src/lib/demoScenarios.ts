import type { PersonaSummary } from "@/lib/api";

export interface Scenario {
  base: PersonaSummary;
  variants: PersonaSummary[];
}

/**
 * One scenario per base persona. A translated variant's id is the base id
 * plus "-<language>" (see personas.yaml); it becomes a language chip on its
 * base card. A variant whose base is missing gets a card of its own.
 */
export function groupScenarios(personas: PersonaSummary[]): Scenario[] {
  const ids = new Set(personas.map((p) => p.id));
  const baseIdOf = (p: PersonaSummary) => {
    const suffix = `-${p.language}`;
    if (!p.id.endsWith(suffix)) return null;
    const baseId = p.id.slice(0, -suffix.length);
    return ids.has(baseId) ? baseId : null;
  };
  const scenarios = new Map<string, Scenario>();
  for (const p of personas) {
    if (!baseIdOf(p)) scenarios.set(p.id, { base: p, variants: [] });
  }
  for (const p of personas) {
    const baseId = baseIdOf(p);
    if (baseId) scenarios.get(baseId)?.variants.push(p);
  }
  return [...scenarios.values()];
}
