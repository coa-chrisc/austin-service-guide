"""Demo personas for the four PH-commissioner scenarios.

A persona is a pre-written resident scenario: a seed profile, an opening
message and a scripted conversation. Loading one makes no model call: the
seed profile goes through the rules-based matching engine, the intake is
marked completed, and the browser replays the script before showing the
plan. ``summary`` and ``shows`` describe the scenario on the launcher card.

``persona_note`` stays on the session for prompts that later run on a
persona's state (a live-AI plan build reads the transcript); it tells the
model the seed is a hypothesis, not a fact.

The persona definitions are data: ``personas.yaml`` in the data pack (optional;
a pack without it offers no personas).

Used by ``POST /api/v1/intake/load-persona`` and the ``?demo=1`` launcher
on the resident landing page.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

from app.models import ResidentProfile
from app.services.data_pack import read_yaml


@dataclass
class ScriptedTurn:
    role: str  # "user" or "assistant"
    content: str
    delay_ms: int = 800  # typing-indicator pause before this bubble appears


@dataclass
class Persona:
    id: str
    label: str
    language: str
    summary: str
    shows: list[str]
    seed_profile: ResidentProfile
    opening_message: str
    persona_note: str
    script: list[ScriptedTurn] = field(default_factory=list)


# A shared note appended to every persona — keeps the model honest about
# the seed being a hypothesis, not a fact.
_HYBRID_NOTE_PREFIX = (
    "This resident entered through a demo persona launcher. The profile "
    "is pre-seeded with a hypothesis, but treat it as a starting point — "
    "not a fact. Listen carefully to what the resident actually says. "
    "If their description contradicts the seed (different role, different "
    "household, different need), call extract_profile to overwrite. "
    "Adapt your matches to the person you're actually talking to."
)


@lru_cache(maxsize=1)
def _load_personas() -> dict[str, Persona]:
    raw = read_yaml("personas.yaml", required=False) or {}
    personas: dict[str, Persona] = {}
    for pid, entry in raw.items():
        personas[pid] = Persona(
            id=entry["id"],
            label=entry["label"],
            language=entry["language"],
            summary=entry.get("summary", ""),
            shows=[str(tag) for tag in entry.get("shows") or []],
            seed_profile=ResidentProfile(**entry["seed_profile"]),
            opening_message=entry["opening_message"],
            persona_note=f"{_HYBRID_NOTE_PREFIX}\n\n{entry['persona_note']}",
            script=[ScriptedTurn(**turn) for turn in entry.get("script") or []],
        )
    return personas


def get_persona(persona_id: str) -> Persona | None:
    return _load_personas().get(persona_id)


def list_personas() -> list[dict]:
    """Lightweight metadata for the demo launcher UI."""
    return [
        {
            "id": p.id,
            "label": p.label,
            "language": p.language,
            "summary": p.summary,
            "shows": p.shows,
        }
        for p in _load_personas().values()
    ]
