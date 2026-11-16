import { useEffect, useState } from "react";

import { getImportConfig, type ImportConfig } from "./importApi";

// One request per page load: the flag only changes when the server restarts.
let pending: Promise<ImportConfig | null> | null = null;

/** The import feature's config, or null while loading or when it is off. */
export function useImportConfig(): { config: ImportConfig | null; loading: boolean } {
  const [config, setConfig] = useState<ImportConfig | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    pending ??= getImportConfig();
    pending.then((value) => {
      if (cancelled) return;
      setConfig(value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { config, loading };
}
