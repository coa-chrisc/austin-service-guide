"""Challenge and device-token endpoints (ungated deployments).

The SPA calls these lazily, the first time a resident opens chat or voice;
never for the directory, map or service pages. With the access gate on the
provider is ``none`` and no token is ever issued. Holds no state: the
challenge is signed, spent nonces live in the defense store.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.access_gate import _is_https
from app.config import get_settings
from app.defense import breakers, device
from app.defense.challenge import issue_pow, verify_pow
from app.defense.keys import challenge_provider, defense_enabled
from app.defense.limits import DefenseRefusal, limit
from app.defense.store import get_store

router = APIRouter(prefix="/api/v1/defense", tags=["defense"])


class TokenRequest(BaseModel):
    nonce: str = Field(min_length=8, max_length=64)
    difficulty: int = Field(ge=1, le=32)
    expires_at: int = Field(ge=0)
    sig: str = Field(min_length=8, max_length=128)
    counter: str = Field(min_length=1, max_length=16)


def _challenge_active() -> bool:
    return defense_enabled() and challenge_provider() != "none"


@router.get("/challenge")
async def get_challenge(response: Response):
    """A proof-of-work challenge, or ``{"provider": "none"}`` when there is none."""
    response.headers["Cache-Control"] = "no-store"
    if not _challenge_active():
        return {"provider": "none"}
    try:
        surge = (await breakers.state("voice")).state in ("warn", "open")
    except Exception:  # noqa: BLE001 — no surge signal without the store
        surge = False
    return issue_pow(get_store().now(), surge=surge)


@router.post("/token", status_code=204, dependencies=[Depends(limit("defense_token"))])
async def issue_device_token(body: TokenRequest, request: Request):
    """Verify a solved challenge and set the 24-hour ``csg_dev`` cookie."""
    if not _challenge_active():
        raise HTTPException(status_code=404, detail="Not found")
    store = get_store()
    try:
        ok = await verify_pow(store, body.nonce, body.difficulty, body.expires_at, body.sig, body.counter)
    except Exception as exc:  # noqa: BLE001 — store down: fail closed (D5)
        raise DefenseRefusal(503, "defense_unavailable",
                             "The assistant can't be turned on right now. The service directory still works.",
                             policy="defense_token") from exc
    if not ok:
        raise DefenseRefusal(400, "challenge_failed", "That check didn't work. Please try again.",
                             policy="defense_token")
    value, _ = device.issue(store.now())
    response = Response(status_code=204, headers={"Cache-Control": "no-store"})
    response.set_cookie(
        device.COOKIE_NAME,
        value,
        max_age=get_settings().defense_device_token_ttl_seconds,
        httponly=True,
        secure=_is_https(request),
        samesite="lax",
        path=device.COOKIE_PATH,
    )
    return response
