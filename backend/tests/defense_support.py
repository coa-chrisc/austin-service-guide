"""Helpers shared by the test_defense_* modules."""

from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.access_gate import AccessGateMiddleware, load_gate_config
from app.defense.principal import Principal
from app.defense.store import set_store
from app.defense.store_memory import MemoryStore

GATE_SECRET = "g" * 40
GATE_CODES = "alpha:alpha-code-1,bravo:bravo-code-2"


class FakeClock:
    def __init__(self, start: float = 1_800_000_000.0) -> None:  # 2027-01-15, mid-window
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


def use_store(clock: FakeClock | None = None) -> tuple[MemoryStore, FakeClock]:
    clock = clock or FakeClock()
    store = MemoryStore(clock=clock)
    set_store(store)
    return store, clock


def principal(kind: str = "device", ident: str = "dev-1", net: str = "net-1", issued_at: int | None = None) -> Principal:
    return Principal(kind, ident, f"h-{kind}-{ident}", net, issued_at)  # type: ignore[arg-type]


def gated_client(app) -> TestClient:
    """The real app behind the access gate, as the Vercel demo runs it."""
    config = load_gate_config({"ACCESS_CODES": GATE_CODES, "ACCESS_GATE_SECRET": GATE_SECRET})
    return TestClient(AccessGateMiddleware(app, config=config, app_name="Test"), base_url="https://testserver")


def login(client: TestClient, code: str) -> None:
    res = client.post("/access", data={"code": code, "next": "/"}, follow_redirects=False)
    assert res.status_code == 303, res.text


def fake_openai(monkeypatch, text: str = "How many people live with you?", usage: dict | None = None,
                fail: Exception | None = None) -> list[dict]:
    """Stub AsyncOpenAI: every call returns ``text`` with ``usage`` (or raises ``fail``)."""
    import openai

    from app.config import get_settings

    calls: list[dict] = []

    class _Responses:
        async def create(self, **kwargs):
            calls.append(kwargs)
            if fail is not None:
                raise fail
            return SimpleNamespace(
                output=[], output_text=text,
                usage=SimpleNamespace(**usage) if usage is not None else None,
            )

    class _Client:
        def __init__(self, **_):
            self.responses = _Responses()

    monkeypatch.setattr(openai, "AsyncOpenAI", _Client)
    settings = get_settings()
    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    return calls
