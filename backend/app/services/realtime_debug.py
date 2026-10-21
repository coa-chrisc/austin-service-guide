"""Opt-in Realtime voice troubleshooting log (file only).

Off unless REALTIME_DEBUG_LOG_ENABLED=true. Every string is PII-redacted and
clipped before it is written to REALTIME_DEBUG_LOG_PATH. Events are keyed by
a random per-voice-session ``trace_id`` from the browser; nothing is kept in
process memory.
"""

from __future__ import annotations

import json
import logging
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.services.pii import redact

log = logging.getLogger(__name__)

_MAX_REALTIME_DEBUG_TEXT = 1000
_MAX_REALTIME_DEBUG_FILE_READ = 10000
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _clip_debug_text(value: str, limit: int = _MAX_REALTIME_DEBUG_TEXT) -> str:
    text = value.strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}... [truncated {len(text) - limit} chars]"


def _redact_debug_text(value: str, limit: int = _MAX_REALTIME_DEBUG_TEXT) -> str:
    """Redact then clip. Pre-clips to 2x the limit first so a huge string
    can't make redaction slow; the margin keeps an identifier that straddles
    the final cut from surviving half-redacted."""
    text = value.strip()
    if len(text) <= limit * 2:
        return _clip_debug_text(redact(text).text, limit)
    head = redact(text[: limit * 2]).text[:limit]
    return f"{head}... [truncated {len(text) - limit} chars]"


def _sanitize_debug_value(value: Any, depth: int = 0) -> Any:
    """Keep debug payloads useful without letting them become huge.

    Every string (keys included) is PII-redacted before the final clip, so
    transcript previews and tool arguments never reach the opt-in debug log
    with raw values.
    """
    if depth > 4:
        return _redact_debug_text(str(value), 300)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _redact_debug_text(value)
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for idx, (key, child) in enumerate(value.items()):
            if idx >= 50:
                cleaned["_truncated_keys"] = len(value) - idx
                break
            cleaned[_redact_debug_text(str(key), 120)] = _sanitize_debug_value(
                child,
                depth + 1,
            )
        return cleaned
    if isinstance(value, (list, tuple, set)):
        items = list(value)
        cleaned_items = [_sanitize_debug_value(item, depth + 1) for item in items[:40]]
        if len(items) > 40:
            cleaned_items.append({"_truncated_items": len(items) - 40})
        return cleaned_items
    return _redact_debug_text(str(value))


def _realtime_debug_log_path() -> Path:
    configured = get_settings().realtime_debug_log_path
    path = Path(configured)
    if not path.is_absolute():
        path = _BACKEND_ROOT / path
    return path


def _append_realtime_debug_log(entry: dict[str, Any]) -> None:
    if not get_settings().realtime_debug_log_enabled:
        return
    try:
        path = _realtime_debug_log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as exc:
        log.warning("Failed to write Realtime debug log (%s)", type(exc).__name__)


def _read_realtime_debug_file(
    trace_id: str | None = None,
    limit: int = _MAX_REALTIME_DEBUG_FILE_READ,
) -> list[dict[str, Any]]:
    safe_limit = max(1, min(_MAX_REALTIME_DEBUG_FILE_READ, limit))
    path = _realtime_debug_log_path()
    if not path.exists():
        return []

    events: deque[dict[str, Any]] = deque(maxlen=safe_limit)
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(entry, dict):
                    continue
                if trace_id and entry.get("trace_id") != trace_id:
                    continue
                events.append(entry)
    except OSError as exc:
        log.warning("Failed to read Realtime debug log (%s)", type(exc).__name__)
        return []
    return list(events)


def record_realtime_debug_event(trace_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Append one bounded, redacted troubleshooting event to the debug file.

    No-op when REALTIME_DEBUG_LOG_ENABLED is false (the default). Events are
    keyed by a random trace id the browser generates per voice session; the
    server keeps nothing in memory.
    """
    if not get_settings().realtime_debug_log_enabled:
        return {}
    detail = event.get("detail", {})
    entry = {
        "trace_id": _clip_debug_text(str(trace_id or "unknown"), 80),
        "timestamp": f"{datetime.utcnow().isoformat()}Z",
        "event": _clip_debug_text(str(event.get("event") or event.get("type") or "event"), 120),
        "source": _clip_debug_text(str(event.get("source") or "server"), 40),
        "status": (
            _clip_debug_text(str(event.get("status")), 80)
            if event.get("status") is not None
            else None
        ),
        "detail": _sanitize_debug_value(detail if isinstance(detail, dict) else {"value": detail}),
    }
    _append_realtime_debug_log(entry)
    return entry


def get_realtime_debug_events(trace_id: str, limit: int = 200) -> list[dict[str, Any]]:
    """Return the latest debug-file events for one trace."""
    safe_limit = max(1, min(500, limit))
    return _read_realtime_debug_file(trace_id=trace_id, limit=safe_limit)[-safe_limit:]


def get_realtime_debug_sessions(limit: int = 20) -> list[dict[str, Any]]:
    """Summarize recent traces in the debug file so one can be picked."""
    safe_limit = max(1, min(100, limit))
    events = _read_realtime_debug_file(limit=_MAX_REALTIME_DEBUG_FILE_READ)

    sessions: dict[str, dict[str, Any]] = {}
    for entry in events:
        trace_id = str(entry.get("trace_id") or "")
        if not trace_id:
            continue
        event_name = str(entry.get("event") or "")
        status = entry.get("status")
        timestamp = str(entry.get("timestamp") or "")
        detail = entry.get("detail") if isinstance(entry.get("detail"), dict) else {}
        summary = sessions.setdefault(
            trace_id,
            {
                "trace_id": trace_id,
                "first_timestamp": timestamp,
                "last_timestamp": timestamp,
                "event_count": 0,
                "last_event": event_name,
                "last_status": status,
                "has_error": False,
                "has_thinking_timeout": False,
                "has_completion": False,
                "response_create_count": 0,
                "tool_call_count": 0,
                "last_progress_percent": None,
            },
        )
        summary["event_count"] += 1
        if timestamp and (
            not summary["first_timestamp"] or timestamp < summary["first_timestamp"]
        ):
            summary["first_timestamp"] = timestamp
        if timestamp and (
            not summary["last_timestamp"] or timestamp >= summary["last_timestamp"]
        ):
            summary["last_timestamp"] = timestamp
            summary["last_event"] = event_name
            summary["last_status"] = status
        if "error" in event_name.lower() or status in {"error", "failed", "not_found"}:
            summary["has_error"] = True
        if event_name == "thinking_timeout":
            summary["has_thinking_timeout"] = True
        if event_name in {
            "completion_finish_scheduled",
            "completion_finish_from_tool_result",
            "completion_voice_timeout_finalized",
        }:
            summary["has_completion"] = True
        if event_name in {"response_create_sent", "startup_response_create_sent"}:
            summary["response_create_count"] += 1
        if event_name == "tool_call_completed":
            summary["tool_call_count"] += 1
        progress = detail.get("progress_percent") if detail else None
        if isinstance(progress, (int, float)):
            summary["last_progress_percent"] = int(progress)

    return sorted(
        sessions.values(),
        key=lambda item: str(item.get("last_timestamp") or ""),
        reverse=True,
    )[:safe_limit]


def summarize_tool_output(output: str) -> dict[str, Any]:
    try:
        parsed = json.loads(output)
    except json.JSONDecodeError:
        return {"text": _redact_debug_text(output, 500)}

    if not isinstance(parsed, dict):
        return {"value": _sanitize_debug_value(parsed)}

    summary: dict[str, Any] = {
        "keys": sorted(str(key) for key in parsed.keys())[:20],
    }
    for key in (
        "error",
        "deferred",
        "action",
        "missing_fields",
        "next_question",
        "wait",
        "no_response",
        "count",
        "match_count",
        "summary",
    ):
        if key in parsed:
            summary[key] = _sanitize_debug_value(parsed[key])
    if "results" in parsed and isinstance(parsed["results"], list):
        summary["result_count"] = len(parsed["results"])
    return summary
