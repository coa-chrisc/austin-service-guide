"""Serve the built single-page app from the API container.

``mount_spa`` registers one catch-all GET route. Call it *after* all API
routers so real API routes always match first; paths under ``/api/`` that match
no route return a JSON 404 instead of index.html.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

_IMMUTABLE = "public, max-age=31536000, immutable"
_NO_CACHE = "no-cache"
_SHORT = "public, max-age=3600"


def _cache_control(rel: str) -> str:
    if rel.startswith("assets/"):
        return _IMMUTABLE  # Vite content-hashes everything under /assets
    if rel in ("index.html", "sw.js", "service-worker.js", "manifest.json") or rel.endswith(".webmanifest"):
        return _NO_CACHE
    return _SHORT


def mount_spa(app: FastAPI, static_dir: str | Path) -> None:
    root = Path(static_dir).resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"SPA index.html not found in {root}")

    def _file(path: Path) -> FileResponse:
        rel = path.relative_to(root).as_posix()
        return FileResponse(path, headers={"Cache-Control": _cache_control(rel)})

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        if full_path:
            try:
                candidate = (root / full_path).resolve()
                candidate.relative_to(root)  # raises if it escapes static_dir
            except (ValueError, OSError):
                raise HTTPException(status_code=404, detail="Not Found")
            if candidate.is_file():
                return _file(candidate)
            # A missing hashed asset must 404, not return HTML.
            if full_path.startswith("assets/"):
                raise HTTPException(status_code=404, detail="Not Found")
        return _file(index)
