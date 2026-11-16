"""One research run: plan -> (approval) -> search -> select -> fetch ->
extract -> evidence -> post-process -> drafts -> coverage report.

Every step result is committed under a step key before the next step
starts, so a worker restart resumes without repeating committed steps. Caps
are checked before each step; reaching one ends the run in ``needs_review``
with what it has and ``stop_reason`` naming the cap.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

import yaml

from app.research.evidence import check_candidate
from app.research.extract import extract_page
from app.research.fetch import FetchError
from app.research.llm import Usage, cost_usd
from app.research.plan import make_plan
from app.research.postprocess import (
    build_service,
    confidence,
    distinctive_name,
    slugify,
    unique_slug,
    validate_service,
)
from app.research.search import SearchHit, host_of, select_urls, split_site
from app.services.dedupe import find_duplicates

logger = logging.getLogger(__name__)
LEASE_SECONDS = 600  # longer than one model call; the heartbeat runs between steps


class CapReached(Exception):
    def __init__(self, name: str) -> None:
        super().__init__(name)
        self.name = name


class LeaseLost(Exception):
    """The job was cancelled or another worker took it over."""


@dataclass
class PackContext:
    categories_yaml: list[dict]
    services: list[dict]

    @property
    def category_names(self) -> dict[str, str]:
        return {c["slug"]: c.get("name", c["slug"]) for c in self.categories_yaml if isinstance(c, dict) and c.get("slug")}


def load_pack_context() -> PackContext:
    from app.services.data_pack import data_dir, read_yaml

    services = []
    for path in sorted((data_dir() / "services").glob("*.yaml")):
        with path.open(encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        if isinstance(data, dict):
            services.append(data)
    return PackContext(categories_yaml=read_yaml("categories.yaml") or [], services=services)


@dataclass
class Deps:
    store: Any
    settings: Any
    client: Any  # OpenAI AsyncOpenAI (or a fake) for plan and extract
    provider: Any  # SearchProvider
    fetcher: Any  # SafeFetcher
    geocode: Any  # Geocoder or None
    pack: PackContext
    owner: str
    now: Callable[[], datetime] = field(default=lambda: datetime.now(timezone.utc))


def _key(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:20]


class Run:
    def __init__(self, job: dict, deps: Deps) -> None:
        self.job = job
        self.d = deps
        self.store = deps.store
        self.caps = job["caps"]
        self.counters = dict(job["counters"])
        self.id = job["id"]

    # ── Bookkeeping ────────────────────────────────────────────────

    def event(self, type_: str, message: str) -> None:
        self.store.add_event(self.id, type_, message)

    def save_counters(self) -> None:
        self.store.update_job(self.id, counters=dict(self.counters))

    def charge(self, usage: Usage) -> None:
        c = self.counters
        for key, value in (("input_tokens", usage.input_tokens), ("cached_tokens", usage.cached_tokens),
                           ("output_tokens", usage.output_tokens), ("search_calls", usage.search_calls)):
            c[key] = c.get(key, 0) + value
        total = Usage(c["input_tokens"], c["cached_tokens"], c["output_tokens"], c["search_calls"])
        c["estimated_cost_usd"] = cost_usd(total, self.d.settings)
        self.save_counters()

    def check_caps(self) -> None:
        c, caps = self.counters, self.caps
        if c["estimated_cost_usd"] >= caps["max_cost_usd"]:
            raise CapReached("max_cost_usd")
        if c["steps"] >= caps["max_steps"]:
            raise CapReached("max_steps")
        started = self.job.get("started_at")
        if started:
            begun = datetime.fromisoformat(started)
            if (self.d.now() - begun).total_seconds() > caps["max_runtime_minutes"] * 60:
                raise CapReached("max_runtime_minutes")

    def step(self) -> None:
        """Before each billable or network step: caps, then lease heartbeat."""
        self.check_caps()
        if not self.store.heartbeat(self.id, self.d.owner, LEASE_SECONDS):
            raise LeaseLost()
        self.counters["steps"] += 1
        self.save_counters()

    # ── Run ────────────────────────────────────────────────────────

    async def run(self) -> None:
        try:
            if not await self.plan_phase():
                return
            hits = await self.search_phase()
            urls = self.select_phase(hits)
            source_ids = await self.fetch_phase(urls)
            await self.extract_phase(source_ids)
            self.finish(None)
        except CapReached as cap:
            self.event("warning", f"Stopped by cap {cap.name}; drafts so far are kept for review")
            self.finish(cap.name)
        except LeaseLost:
            logger.info("job %s: lease lost (cancelled or taken over)", self.id)

    async def plan_phase(self) -> bool:
        if self.job.get("plan") is None:
            self.step()
            max_queries = max(1, min(self.caps["max_searches"], 40))
            plan, usage = await make_plan(self.d.client, self.d.settings, self.job["params"],
                                          self.d.pack.category_names, max_queries)
            self.charge(usage)
            self.store.update_job(self.id, plan=plan)
            self.job["plan"] = plan
            self.event("planned", f"Plan: {len(plan['queries'])} queries; official domains: "
                                  f"{', '.join(plan['official_domains'][:5]) or 'none suggested'}")
        if not self.job.get("plan_approved"):
            self.store.release(self.id, self.d.owner, state="awaiting_plan")
            self.event("state", "Waiting for a reviewer to approve the plan")
            return False
        return True

    async def search_phase(self) -> list[SearchHit]:
        hits: list[SearchHit] = []
        for i, q in enumerate(self.job["plan"]["queries"]):
            key = f"search:{i}"
            done, result = self.store.get_step(self.id, key)
            if not done:
                if self.counters["searches"] >= self.caps["max_searches"]:
                    raise CapReached("max_searches")
                self.step()
                try:
                    # site:<domain> goes to the provider as a filter (older plans may say site.<domain>).
                    text, site = split_site(q["query"])
                    res = await self.d.provider.search(text, site=site, limit=10)
                    self.charge(Usage(res.usage.input_tokens, res.usage.cached_tokens, res.usage.output_tokens,
                                      res.usage.search_calls))
                    result = {"hits": [h.__dict__ for h in res.hits]}
                    self.event("search", f"{self.d.provider.name}: \"{q['query'][:120]}\" -> {len(res.hits)} results")
                except CapReached:
                    raise
                except Exception as exc:  # noqa: BLE001 — a failed search is reported, not fatal
                    result = {"hits": [], "error": type(exc).__name__}
                    self.event("warning", f"Search failed ({type(exc).__name__}): \"{q['query'][:120]}\"")
                self.counters["searches"] += 1
                self.save_counters()
                self.store.put_step(self.id, key, result)
            hits.extend(SearchHit(**h) for h in result.get("hits", []))
        return hits

    def select_phase(self, hits: list[SearchHit]) -> list[str]:
        done, result = self.store.get_step(self.id, "select")
        if done:
            return result["urls"]
        params = self.job["params"]
        urls, skipped = select_urls(
            hits,
            allowed_domains=params.get("allowed_domains") or [],
            place_domains=self.job["plan"].get("official_domains") or [],
            seed_urls=params.get("seed_urls") or [],
            limit=self.caps["max_pages"],
            per_host=self.caps["max_pages_per_host"],
        )
        for s in skipped[:30]:
            self.event("skipped", f"{s['reason']}: {s['url'][:200]}")
        self.store.put_step(self.id, "select", {"urls": urls, "skipped": len(skipped)})
        self.event("planned", f"Selected {len(urls)} pages to read from {len(hits)} search results")
        return urls

    async def fetch_phase(self, urls: list[str]) -> list[str]:
        source_ids: list[str] = []
        for url in urls:
            key = f"fetch:{_key(url)}"
            done, result = self.store.get_step(self.id, key)
            if not done:
                if self.counters["pages"] >= self.caps["max_pages"]:
                    raise CapReached("max_pages")
                self.step()
                result = await self._fetch_one(url)
                self.store.put_step(self.id, key, result)
            if result.get("source_id"):
                source_ids.append(result["source_id"])
        return source_ids

    async def _fetch_one(self, url: str) -> dict:
        try:
            if not await self.d.fetcher.allowed_by_robots(url):
                self.event("skipped", f"robots.txt disallows: {url[:200]}")
                return {"error": "robots"}
            page = await self.d.fetcher.fetch(url)
        except FetchError as exc:
            self.event("skipped", f"Not fetched ({exc.reason}): {url[:200]}")
            return {"error": exc.reason, "url": url}
        self.counters["pages"] += 1
        self.save_counters()
        source = self.store.add_source(
            self.id, url=url, final_url=page.final_url, host=host_of(page.final_url)[:255],
            title=page.title[:500], sha256=hashlib.sha256(page.text.encode()).hexdigest(),
            text=page.text, links=page.links,
        )
        self.event("fetch", f"Read {page.final_url[:200]} ({len(page.text)} characters)")
        return {"source_id": source["id"]}

    async def extract_phase(self, source_ids: list[str]) -> None:
        params = self.job["params"]
        categories = set(self.d.pack.category_names)
        for sid in source_ids:
            key = f"extract:{sid}"
            done, _ = self.store.get_step(self.id, key)
            if done:
                continue
            if self.counters["drafts"] >= self.caps["max_drafts"]:
                raise CapReached("max_drafts")
            self.step()
            source = self.store.get_source(sid)
            candidates, off_topic, usage = await extract_page(
                self.d.client, self.d.settings, params=params, categories=self.d.pack.category_names,
                url=source["final_url"], title=source["title"] or "", text=source["text"],
            )
            self.charge(usage)
            if off_topic:  # never drafted, so never counted toward max_drafts
                n = len(off_topic)
                self.event("skipped", f"Skipped {n} listing{'s' if n != 1 else ''} outside the topic on "
                                      f"{source['final_url'][:160]}: {', '.join(off_topic)[:300]}")
            # A crash after drafts were written but before the step commit would
            # repeat this page: drop that page's earlier drafts first.
            for old in self.store.list_drafts(self.id):
                if (old["provenance"] or {}).get("source_id") == sid:
                    self.store.delete_draft(old["id"])
            created = []
            for cand in candidates:
                if self.counters["drafts"] >= self.caps["max_drafts"]:
                    self.store.put_step(self.id, key, {"drafts": created, "partial": True})
                    raise CapReached("max_drafts")
                draft_id = await self._draft(cand, source, categories)
                if draft_id:
                    created.append(draft_id)
            self.event("extract", f"{len(candidates)} listing(s) found on {source['final_url'][:160]}")
            self.store.put_step(self.id, key, {"drafts": created})

    async def _draft(self, cand: dict, source: dict, categories: set[str]) -> str | None:
        name = str(cand.get("name") or "").strip()
        if not name:
            return None
        checked, provenance = check_candidate(cand, source)
        if not provenance["fields"]:
            self.event("skipped", f"No verifiable evidence for \"{name[:80]}\"; not drafted")
            return None
        name, prefix = distinctive_name(checked)
        if prefix:
            checked["name"] = name
            provenance["flags"].append({"field": "name", "message": f"the extracted name gave no site or "
                                        f"organisation; \"{prefix[:80]}\" was added in front; check it"})
        existing = self.store.list_drafts(self.id)
        taken = {s.get("slug") for s in self.d.pack.services} | {d["candidate"].get("slug") for d in existing}
        slug = unique_slug(slugify(name), taken)
        provenance["source_id"] = source["id"]
        svc = await build_service(checked, provenance, slug=slug, categories=categories,
                                  geocode=self.d.geocode,
                                  default_state=self.job["params"]["place"].get("state", ""))
        issues = validate_service(svc, self.d.pack.categories_yaml)
        dups = find_duplicates(svc, self.d.pack.services, source="pack")
        dups += find_duplicates(svc, [d["candidate"] for d in existing], source="draft")
        draft_id = self.store.add_draft(
            self.id, kind="service", candidate=svc, provenance=provenance, issues=issues, duplicates=dups,
            confidence=confidence(svc, provenance, cand.get("confidence")),
        )
        self.counters["drafts"] += 1
        self.save_counters()
        note = f"; {len(issues['errors'])} validator error(s)" if issues["errors"] else ""
        note += f"; possible duplicate of {dups[0]['name'][:60]}" if dups else ""
        self.event("draft_created", f"Draft: {svc['name'][:100]}{note}")
        return draft_id

    def finish(self, stop_reason: str | None) -> None:
        report = coverage_report(self.job, self.store.list_drafts(self.id), self.store, self.id)
        if stop_reason:
            report["notices"].append(f"Stopped by cap {stop_reason}. Raise the cap or start a narrower job for more.")
        self.store.release(
            self.id, self.d.owner, state="needs_review", stop_reason=stop_reason, report=report,
            counters=dict(self.counters), finished_at=self.d.now(),
        )
        self.event("state", f"Finished: {self.counters['drafts']} draft(s) ready for review")


def coverage_report(job: dict, drafts: list[dict], store: Any, job_id: str) -> dict:
    plan = job.get("plan") or {}
    pairs: dict[tuple[str, str], dict] = {}
    for q in plan.get("queries", []):
        pairs.setdefault((q["category"], q["level"]), {"category": q["category"], "level": q["level"],
                                                       "drafts": 0, "full_evidence": 0})
    for d in drafts:
        svc = d["candidate"]
        level = svc.get("provider_type") or "other"
        full = not d["issues"].get("errors") and not (d["provenance"] or {}).get("missing")
        for cat in svc.get("categories") or ["(none)"]:
            row = pairs.setdefault((cat, level), {"category": cat, "level": level, "drafts": 0, "full_evidence": 0})
            row["drafts"] += 1
            row["full_evidence"] += int(full)
    unreachable = []
    done, sel = store.get_step(job_id, "select")
    for url in (sel or {}).get("urls", []) if done else []:
        ok, res = store.get_step(job_id, f"fetch:{_key(url)}")
        if ok and res.get("error") and res.get("error") != "robots":
            unreachable.append(url)
    return {"coverage": sorted(pairs.values(), key=lambda r: (r["category"], r["level"])),
            "unreachable": unreachable[:100], "notices": []}
