import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FlowDiagram, { type FlowLane } from "./FlowDiagram";

const LANES: FlowLane[] = [
  {
    label: "First lane",
    nodes: [
      { title: "One", detail: "d1", tone: "success" },
      { title: "Two", detail: "d2", tone: "primary" },
    ],
  },
  {
    label: "Second lane",
    boundaryBefore: "Leaves your device",
    nodes: [{ title: "Three", detail: "d3", tone: "warning" }],
  },
];

const render = (lanes: FlowLane[]) =>
  renderToStaticMarkup(createElement(FlowDiagram, { caption: "Caption text", lanes }));

describe("FlowDiagram", () => {
  it("renders one ordered list per lane and one item per node", () => {
    const html = render(LANES);
    expect(html.match(/<ol\b/g)).toHaveLength(2);
    expect(html.match(/<li\b/g)).toHaveLength(3);
    expect(html).toContain("<figure");
    expect(html).toMatch(/<figcaption[^>]*>Caption text<\/figcaption>/);
  });

  it("labels each list with its lane and shows a boundary as text", () => {
    const html = render(LANES);
    const ids = [...html.matchAll(/<ol[^>]*aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("Leaves your device");
  });
});
