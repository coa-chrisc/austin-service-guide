"""Request bodies shared by the main app's proxy and the worker.

Pure pydantic (no SQLAlchemy), so the Vercel function can import it: the
main app validates every body before it signs and forwards it, and the
worker validates it again.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ID_PATTERN = r"^[a-f0-9]{32}$"
MAX_YAML = 100_000
DraftState = Literal["pending", "accepted", "rejected", "merged"]
Level = Literal["city", "county", "state", "federal", "nonprofit"]
_HOST = re.compile(r"^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$")
_URL = re.compile(r"^https?://[^\s]{3,2000}$")


class Place(BaseModel):
    city: str | None = Field(None, max_length=100)
    county: str | None = Field(None, max_length=100)
    state: str = Field(..., pattern=r"^[A-Z]{2}$")
    country: Literal["US"] = "US"


class Caps(BaseModel):
    max_steps: int | None = Field(None, ge=1)
    max_searches: int | None = Field(None, ge=1)
    max_pages: int | None = Field(None, ge=1)
    max_pages_per_host: int | None = Field(None, ge=1)
    max_cost_usd: float | None = Field(None, gt=0)
    max_runtime_minutes: int | None = Field(None, ge=1)
    max_drafts: int | None = Field(None, ge=1)


class ResearchParams(BaseModel):
    place: Place
    topic: str | None = Field(None, max_length=200)
    categories: list[str] = Field(default_factory=list, max_length=40)
    levels: list[Level] = Field(default_factory=lambda: ["city", "county", "state", "federal", "nonprofit"],
                                min_length=1)
    seed_urls: list[str] = Field(default_factory=list, max_length=50)
    allowed_domains: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("categories")
    @classmethod
    def _categories(cls, v: list[str]) -> list[str]:
        for slug in v:
            if not re.match(r"^[a-z0-9][a-z0-9_-]{0,63}$", slug):
                raise ValueError(f"not a category slug: {slug[:80]}")
        return v

    @field_validator("seed_urls")
    @classmethod
    def _urls(cls, v: list[str]) -> list[str]:
        for url in v:
            if not _URL.match(url):
                raise ValueError(f"not an http(s) URL: {url[:80]}")
        return v

    @field_validator("allowed_domains")
    @classmethod
    def _domains(cls, v: list[str]) -> list[str]:
        out = []
        for d in v:
            d = d.strip().lower().removeprefix("https://").removeprefix("http://").split("/", 1)[0]
            if not _HOST.match(d):
                raise ValueError(f"not a domain: {d[:80]}")
            out.append(d)
        return out


class ResearchRequest(ResearchParams):
    """What the staff console posts to the main app."""

    caps: Caps = Field(default_factory=Caps)
    acknowledge_cost: Literal[True]


class JobCreate(BaseModel):
    """What the main app posts to the worker."""

    kind: Literal["research", "noop"]
    params: ResearchParams | None = None
    caps: Caps = Field(default_factory=Caps)


class ApprovePlan(BaseModel):
    keep: list[int] | None = Field(None, max_length=500)


class DraftEdit(BaseModel):
    yaml: str = Field(..., max_length=MAX_YAML)


class Reject(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)
