"""Catalog grounding gate for service ids.

Every service id or slug that reaches the server from the model (tool
arguments, plan output) or from the browser (intake state, share, results
hydration) passes through ``ground_service_ids``. Anything that doesn't name
a service in the loaded catalog is dropped, so later code only ever renders
or sends catalog data. Only the number of dropped values is logged, never
the values themselves.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from app.services import catalog

log = logging.getLogger(__name__)


def ground_service_ids(ids: Iterable[Any]) -> list[str]:
    """Return the canonical catalog ids for ``ids``, dropping unknown values.

    Accepts ids or slugs. Order is preserved and duplicates are removed.
    """
    grounded: list[str] = []
    seen: set[str] = set()
    dropped = 0
    for value in ids:
        service = None
        if isinstance(value, str) and value:
            service = catalog.get_service_by_id(value) or catalog.get_service_by_slug(value)
        if service is None:
            dropped += 1
            continue
        if service.id not in seen:
            seen.add(service.id)
            grounded.append(service.id)
    if dropped:
        log.info("grounding: dropped %d service id(s) not in the catalog", dropped)
    return grounded
