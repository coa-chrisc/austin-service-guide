"""Vercel entrypoint: the same FastAPI app as the Docker image, SPA included.

Vercel runs this file as one Python function (see pyproject.toml
``[tool.vercel]`` and vercel.json). The build command compiles the frontend
into frontend/dist, which the app serves like the container does with
STATIC_DIR. See deploy/README.md (Vercel).
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("STATIC_DIR", str(ROOT / "frontend" / "dist"))

from app.main import app  # noqa: E402,F401
