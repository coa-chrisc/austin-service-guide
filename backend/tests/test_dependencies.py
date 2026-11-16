"""Runtime dependencies: the Vercel and container installs must match.

Vercel installs from the root pyproject.toml; the container and local dev
install from backend/requirements.txt. python-jose (unfixed advisory, pulls
in ecdsa) and passlib were listed but never imported; they are gone from
both lists.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
UNUSED = ("python-jose", "passlib")


def _requirements() -> set[str]:
    lines = (BACKEND / "requirements.txt").read_text().splitlines()
    return {ln.strip() for ln in lines if ln.strip() and not ln.strip().startswith("#")}


def _pyproject() -> set[str]:
    data = tomllib.loads((ROOT / "pyproject.toml").read_text())
    return set(data["project"]["dependencies"])


def test_requirements_and_pyproject_list_the_same_dependencies():
    assert _requirements() == _pyproject()


def test_unused_auth_libraries_are_not_installed():
    for spec in _requirements() | _pyproject():
        name = re.split(r"[\[<>=!~ ]", spec, maxsplit=1)[0].lower()
        assert name not in UNUSED, spec
    for path in (BACKEND / "app").rglob("*.py"):
        text = path.read_text()
        assert not re.search(r"^\s*(from|import)\s+(jose|passlib)\b", text, re.M), path
