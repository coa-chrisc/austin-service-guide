"""Hard eligibility gates for the matching engine.

A service's ``eligibility_requires`` lists gates from the closed
``EligibilityGate`` vocabulary in ``app/models.py``. Each gate is checked
against the resident profile and resolves to one of three states:

  True   the profile shows the resident qualifies
  False  the profile shows the resident does not qualify (known, contradicts)
  None   the profile does not say either way

All gates on a service must hold (AND). One False excludes the service; any
None (and no False) keeps it as an unconfirmed, low-confidence match.
"""

from __future__ import annotations

import re
from typing import Callable

from app.models import EligibilityGate, ResidentProfile, Service


# Age bands the age gates accept. Floors/ceilings are the most permissive
# values in the catalog's own eligibility summaries (Family Eldercare and
# AGE serve 50+; American YouthWorks serves 16-28) so a bracket that only
# partly overlaps is never excluded.
_OLDER_ADULT_FLOOR = 50
_YOUTH_BAND = (16, 28)

# Need keywords that by themselves say the resident is unhoused.
_HOMELESS_NEEDS = {"homeless", "homelessness", "shelter"}


def _needs(profile: ResidentProfile) -> set[str]:
    return {n.lower() for n in profile.immediate_needs}


def _age_bounds(age_range: str) -> tuple[int, int] | None:
    """Parse '30-39', '40s', '80+', 'under 18', '65 and older', '35'."""
    s = age_range.strip().lower()
    nums = [int(n) for n in re.findall(r"\d+", s)]
    if not nums:
        return None
    if s.startswith(("under", "<")):
        return (0, nums[0] - 1)
    if s.endswith("+") or "over" in s or "older" in s:
        return (nums[0], 200)
    if len(nums) >= 2:
        return (nums[0], nums[1])
    if s.endswith("s"):
        return (nums[0], nums[0] + 9)
    return (nums[0], nums[0])


def _age_overlaps(profile: ResidentProfile, lo: int, hi: int) -> bool | None:
    bounds = _age_bounds(profile.age_range)
    if bounds is None:
        return None
    return bounds[0] <= hi and bounds[1] >= lo


def _flag(value: bool | None, *, also_true: bool = False) -> bool | None:
    """Tri-state from a profile bool plus extra evidence that it holds."""
    if value or also_true:
        return True
    return False if value is False else None


# ── Gate predicates ───────────────────────────────────────────────────

def _veteran(p: ResidentProfile) -> bool | None:
    # Asking for veterans help explicitly covers dependents/survivors too.
    return _flag(p.veteran_status, also_true=bool({"veteran", "veterans", "va", "military"} & _needs(p)))


def _homeless(p: ResidentProfile) -> bool | None:
    # Fleeing domestic violence counts as homeless under HUD's definition,
    # which ECHO coordinated entry follows.
    if (
        p.housing_situation in ("homeless", "unstable")
        or {"homelessness", "domestic_violence"} & set(p.crisis_indicators)
        or _HOMELESS_NEEDS & _needs(p)
    ):
        return True
    if p.housing_situation in ("renting", "own_home"):
        return False
    return None  # "", "other" — could be couch-surfing


def _refugee(p: ResidentProfile) -> bool | None:
    return _flag(
        p.is_refugee_or_immigrant,
        also_true=bool({"refugee", "immigration", "citizenship"} & _needs(p)),
    )


def _disability(p: ResidentProfile) -> bool | None:
    return _flag(
        p.has_disability,
        also_true=p.employment_status == "disabled" or "disability" in _needs(p),
    )


def _older_adult(p: ResidentProfile) -> bool | None:
    if {"senior", "aging", "elderly"} & _needs(p):
        return True
    return _age_overlaps(p, _OLDER_ADULT_FLOOR, 200)


def _older_adult_or_disability(p: ResidentProfile) -> bool | None:
    states = (_older_adult(p), _disability(p))
    if True in states:
        return True
    return False if states == (False, False) else None


def _has_children(p: ResidentProfile) -> bool | None:
    return _flag(
        p.has_children,
        also_true=bool(p.school_age_children) or bool({"childcare", "daycare", "preschool"} & _needs(p)),
    )


def _youth(p: ResidentProfile) -> bool | None:
    return _age_overlaps(p, *_YOUTH_BAND)


def _other_criteria(p: ResidentProfile) -> bool | None:
    # Restricted to a group the profile has no field for (single parents in
    # college, people in recovery, people living with HIV …). Never
    # confirmable, so the service always shows as "check eligibility".
    return None


_GATES: dict[str, Callable[[ResidentProfile], bool | None]] = {
    "veteran": _veteran,
    "homeless_or_unstable_housing": _homeless,
    "refugee_or_immigrant": _refugee,
    "disability": _disability,
    "older_adult": _older_adult,
    "older_adult_or_disability": _older_adult_or_disability,
    "has_children": _has_children,
    "youth": _youth,
    "other_criteria": _other_criteria,
}

# Resident-facing wording for an unconfirmed gate.
GATE_LABELS: dict[str, str] = {
    "veteran": "veterans and their families",
    "homeless_or_unstable_housing": "people experiencing homelessness or unstable housing",
    "refugee_or_immigrant": "refugees and immigrants",
    "disability": "people with disabilities",
    "older_adult": "older adults",
    "older_adult_or_disability": "older adults or people with disabilities",
    "has_children": "families with children",
    "youth": "young people",
    "other_criteria": "a specific group — see eligibility",
}


def unconfirmed_gates(service: Service, profile: ResidentProfile) -> list[EligibilityGate] | None:
    """Return the service's gates the profile cannot confirm.

    ``None`` means the profile contradicts a gate — the service must be
    excluded. An empty list means the resident is confirmed eligible (or the
    service is ungated).
    """
    unknown: list[EligibilityGate] = []
    for gate in service.eligibility_requires:
        state = _GATES[gate](profile)
        if state is False:
            return None
        if state is None:
            unknown.append(gate)
    return unknown


def eligibility_note(service: Service, unconfirmed: list[EligibilityGate]) -> str:
    """Resident-facing "check eligibility" text for unconfirmed gates.

    Quotes the first sentence of the service's own eligibility summary;
    falls back to the gate labels when the summary is empty. Semicolons are
    swapped out because match reasoning is semicolon-delimited.
    """
    first = re.split(r"(?<=[.!?])\s+", service.eligibility_summary.strip(), maxsplit=1)[0]
    text = first.rstrip(".").replace(";", ",")
    if not text:
        text = "serves " + " and ".join(GATE_LABELS[g] for g in unconfirmed)
    return f"Check eligibility: {text}"
