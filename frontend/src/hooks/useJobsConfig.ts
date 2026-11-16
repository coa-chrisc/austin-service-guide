import { useEffect, useState } from "react";
import { getJobsConfig, type JobsConfig } from "@/lib/researchApi";

/**
 * The research-agent config, fetched once per mount. Null while loading and
 * whenever the call fails (404 means the feature is off), so callers that
 * only show or hide UI can treat null as "hidden".
 */
export function useJobsConfig(): JobsConfig | null {
  const [config, setConfig] = useState<JobsConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    getJobsConfig()
      .then((res) => {
        if (!cancelled) setConfig(res);
      })
      .catch(() => {
        // feature off or backend unreachable: keep the entry hidden
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
}
