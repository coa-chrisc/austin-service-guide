"""Validate a whole data pack: every file's JSON Schema (config/schemas/) plus
the cross-file rules. Thin CLI over app/services/pack_validator.py; contract
and output format in docs/DATA_PACK.md.

Usage::

    python backend/scripts/validate_pack.py [--strict] [--json] [--data-dir DIR] [--city-config FILE]

Default pack: the one CITY_DATA_DIR selects (unset: backend/app/data), checked
against the active city config. Runs from any working directory. Exit 1 on
errors.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.services.pack_validator import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
