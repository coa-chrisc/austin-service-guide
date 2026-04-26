"""Flag potential duplicate services in the seed catalog.

Heuristic: two services are flagged as suspected duplicates when they share
the same provider_name (case-insensitive) AND have at least two overlapping
tokens in their name (after removing stopwords).

Output: ``backend/dedupe_review.csv`` with columns
    cluster_id, service_id, slug, name, provider_name, categories

Usage::

    python backend/scripts/dedupe_catalog.py
"""

from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.services.seed_data import SERVICES  # noqa: E402

STOPWORDS = {
    "the", "and", "of", "for", "in", "at", "on", "a", "an", "to",
    "central", "texas", "austin", "services", "service", "program",
    "programs", "center", "centers", "clinic", "clinics", "office",
    "department", "&", "-", "co",
}

OUTPUT = ROOT / "dedupe_review.csv"


def tokens(name: str) -> set[str]:
    return {
        t for t in re.split(r"[^a-zA-Z0-9]+", name.lower())
        if t and t not in STOPWORDS and len(t) > 2
    }


def main() -> int:
    by_provider: dict[str, list] = defaultdict(list)
    for svc in SERVICES:
        key = (svc.provider_name or svc.name).strip().lower()
        if not key:
            continue
        by_provider[key].append(svc)

    flagged: list[tuple[int, list]] = []
    cluster_id = 0
    for provider, group in by_provider.items():
        if len(group) < 2:
            continue
        # Cluster within group by ≥2 token overlap on name
        remaining = list(group)
        while remaining:
            seed = remaining.pop(0)
            seed_tokens = tokens(seed.name)
            cluster = [seed]
            still = []
            for other in remaining:
                if len(seed_tokens & tokens(other.name)) >= 2:
                    cluster.append(other)
                else:
                    still.append(other)
            remaining = still
            if len(cluster) >= 2:
                cluster_id += 1
                flagged.append((cluster_id, cluster))

    if not flagged:
        print("No suspected duplicates.")
        OUTPUT.write_text(
            "cluster_id,service_id,slug,name,provider_name,categories\n",
            encoding="utf-8",
        )
        return 0

    with OUTPUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            ["cluster_id", "service_id", "slug", "name", "provider_name", "categories"]
        )
        for cid, cluster in flagged:
            for svc in cluster:
                writer.writerow([
                    cid, svc.id, svc.slug, svc.name,
                    svc.provider_name, "|".join(svc.categories),
                ])

    print(
        f"Wrote {OUTPUT.relative_to(ROOT.parent)} — "
        f"{len(flagged)} cluster(s), "
        f"{sum(len(c) for _, c in flagged)} service(s) flagged."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
