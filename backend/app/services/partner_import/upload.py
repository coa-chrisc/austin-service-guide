"""Bounded request reading and an in-memory multipart split.

Starlette's ``UploadFile`` spools anything over 1 MB to a temporary file,
which would leave a copy of the upload on disk. This reader stops at a byte
cap (``Content-Length`` first, then while streaming) and splits the
multipart body in memory, so the file only ever exists in this request's
memory and is gone when the request ends.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from starlette.requests import Request

from app.services.partner_import import limits as L

try:  # python-multipart >= 0.0.13
    from python_multipart.multipart import MultipartParser, parse_options_header
except ImportError:  # pragma: no cover - older python-multipart
    from multipart.multipart import MultipartParser, parse_options_header  # type: ignore[no-redef]

MAX_FIELDS = 8
MAX_FIELD_BYTES = 64 * 1024


@dataclass
class Form:
    file_name: str = ""
    file: bytes = b""
    fields: dict[str, str] = field(default_factory=dict)


def _too_large(limit: int) -> L.ImportRefused:
    mb = limit / (1024 * 1024)
    return L.ImportRefused(L.TOO_LARGE, f"The upload is over the {mb:.0f} MB limit.")


async def read_body(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            if int(declared) > limit:
                raise _too_large(limit)
        except ValueError:
            raise L.ImportRefused(L.BAD_REQUEST, "Bad Content-Length header.") from None
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise _too_large(limit)
        chunks.append(chunk)
    return b"".join(chunks)


async def read_json(request: Request, limit: int = L.MAX_JSON_BODY_BYTES) -> dict[str, Any]:
    body = await read_body(request, limit)
    try:
        data = json.loads(body or b"{}")
    except (ValueError, UnicodeDecodeError):
        raise L.ImportRefused(L.BAD_REQUEST, "The request body is not valid JSON.") from None
    if not isinstance(data, dict):
        raise L.ImportRefused(L.BAD_REQUEST, "The request body must be a JSON object.")
    return data


def _disposition(value: bytes) -> tuple[str, str | None]:
    _, params = parse_options_header(value)
    name = params.get(b"name", b"").decode("utf-8", "replace")
    file_name = params.get(b"filename")
    return name, (file_name.decode("utf-8", "replace") if file_name is not None else None)


async def read_form(request: Request) -> Form:
    """One file part plus a few small text fields, parsed in memory."""
    content_type, params = parse_options_header(request.headers.get("content-type", ""))
    boundary = params.get(b"boundary")
    if content_type != b"multipart/form-data" or not boundary:
        raise L.ImportRefused(L.BAD_REQUEST, "Send the file as multipart/form-data.")
    body = await read_body(request, L.MAX_BODY_BYTES)

    form = Form()
    state: dict[str, Any] = {"headers": {}, "field": b"", "value": b"", "name": "", "file_name": None, "data": []}
    errors: list[L.ImportRefused] = []

    def on_part_begin() -> None:
        state.update(headers={}, name="", file_name=None, data=[])

    def on_header_field(data: bytes, start: int, end: int) -> None:
        state["field"] += data[start:end]

    def on_header_value(data: bytes, start: int, end: int) -> None:
        state["value"] += data[start:end]

    def on_header_end() -> None:
        state["headers"][state["field"].lower()] = state["value"]
        state["field"], state["value"] = b"", b""

    def on_headers_finished() -> None:
        name, file_name = _disposition(state["headers"].get(b"content-disposition", b""))
        state["name"], state["file_name"] = name, file_name

    def on_part_data(data: bytes, start: int, end: int) -> None:
        state["data"].append(data[start:end])

    def on_part_end() -> None:
        payload = b"".join(state["data"])
        state["data"] = []
        if state["file_name"] is not None:
            if form.file_name or form.file:
                errors.append(L.ImportRefused(L.BAD_REQUEST, "Upload one file at a time."))
            form.file_name, form.file = state["file_name"], payload
        elif state["name"]:
            if len(form.fields) >= MAX_FIELDS or len(payload) > MAX_FIELD_BYTES:
                errors.append(L.ImportRefused(L.BAD_REQUEST, "Too many or too large form fields."))
            else:
                form.fields[state["name"]] = payload.decode("utf-8", "replace")

    parser = MultipartParser(boundary, {
        "on_part_begin": on_part_begin, "on_part_data": on_part_data, "on_part_end": on_part_end,
        "on_header_field": on_header_field, "on_header_value": on_header_value, "on_header_end": on_header_end,
        "on_headers_finished": on_headers_finished,
    })
    try:
        parser.write(body)
        parser.finalize()
    except Exception as exc:  # noqa: BLE001 - malformed multipart from the client
        raise L.ImportRefused(L.BAD_REQUEST, "The upload could not be read as multipart/form-data.") from exc
    if errors:
        raise errors[0]
    if not form.file_name and not form.file:
        raise L.ImportRefused(L.BAD_REQUEST, "No file was attached.")
    if len(form.file) > L.MAX_FILE_BYTES:
        raise _too_large(L.MAX_FILE_BYTES)
    return form
