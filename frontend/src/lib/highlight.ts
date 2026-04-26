import { createElement, Fragment, type ReactNode } from "react";

const MARK_STYLE = {
  backgroundColor: "rgba(255, 235, 59, 0.45)",
  borderRadius: 2,
  padding: "0 1px",
} as const;

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightMatch(text: string, query: string): ReactNode {
  if (!query || !query.trim()) return text;
  const pattern = new RegExp(`(${escapeRegExp(query.trim())})`, "ig");
  const parts = text.split(pattern);
  if (parts.length <= 1) return text;
  const matcher = new RegExp(`^${escapeRegExp(query.trim())}$`, "i");
  const children: ReactNode[] = parts.map((segment, index) =>
    matcher.test(segment)
      ? createElement("mark", { key: index, style: MARK_STYLE }, segment)
      : segment,
  );
  return createElement(Fragment, null, ...children);
}
