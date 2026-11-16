// Service-worker precache limited to the resident shell. The build walks the
// chunk graph from the entry, following static imports and the lazy pages
// residents use (intake, results, directory, service detail). The admin
// console, the map and Leaflet, login, the demo and How it works stay out of
// the precache and are fetched when opened. vite.config.ts passes
// `manifestTransform` to workbox, which runs after the bundle is written.
import type { Plugin } from "vite";

/** Lazy pages (by module path) that are not part of the offline resident shell. */
const ON_DEMAND: RegExp[] = [
  /\/src\/pages\/admin\//,
  /\/src\/components\/layout\/AdminLayout\.tsx$/,
  /\/src\/components\/map\//,
  /\/src\/pages\/(?:MapView|Login|DemoIntake|HowItWorks)\.tsx$/,
];

export default function precacheShell() {
  // Output files (chunks and their CSS) that must not be precached.
  let onDemand: Set<string> | null = null;

  const plugin: Plugin = {
    name: "precache-shell",
    apply: "build",
    generateBundle(_options, bundle) {
      const chunks = new Map(
        Object.values(bundle).flatMap((item) => (item.type === "chunk" ? [[item.fileName, item] as const] : [])),
      );
      const shell = new Set<string>();
      const queue = [...chunks.values()].filter((c) => c.isEntry).map((c) => c.fileName);
      while (queue.length > 0) {
        const name = queue.pop()!;
        const chunk = chunks.get(name);
        if (!chunk || shell.has(name)) continue;
        shell.add(name);
        chunk.viteMetadata?.importedCss.forEach((css) => shell.add(css));
        queue.push(...chunk.imports);
        for (const target of chunk.dynamicImports) {
          const facade = chunks.get(target)?.facadeModuleId ?? "";
          if (!ON_DEMAND.some((re) => re.test(facade))) queue.push(target);
        }
      }
      onDemand = new Set();
      for (const chunk of chunks.values()) {
        if (!shell.has(chunk.fileName)) onDemand.add(chunk.fileName);
        chunk.viteMetadata?.importedCss.forEach((css) => {
          if (!shell.has(css)) onDemand!.add(css);
        });
      }
    },
  };

  function manifestTransform<T extends { url: string }>(entries: T[]) {
    if (!onDemand) throw new Error("precache-shell: the bundle was not analysed before the service worker build");
    const skip = onDemand;
    return { manifest: entries.filter((entry) => !skip.has(entry.url)), warnings: [] as string[] };
  }

  return { plugin, manifestTransform };
}
