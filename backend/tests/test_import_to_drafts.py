"""Partner import: fixtures to drafts to export, end to end through the routes (issue #19)."""

from __future__ import annotations

import io
import json
import zipfile

import pytest
import yaml

from app.services.pack_validator import validate_pack
from app.services.partner_import.export import VERIFICATION_KEYS, csv_safe
from app.services.partner_import.pack_context import get_context
from tests.import_support import (  # noqa: F401  (import_on is a fixture)
    FORBIDDEN,
    HEADERS,
    PREFIX,
    default_table,
    drafts,
    import_fixture,
    import_on,
    inspect,
    proposed_params,
)

FIXTURES = ("partners.csv", "partners.xlsx", "partners.docx")


def accepted(body: dict) -> list[dict]:
    return [{"service": d["service"], "provenance": d["provenance"], "flags": d["flags"],
             "suggestions": d["suggestions"]} for d in body["drafts"]]


def export_zip(client, items: list[dict]) -> zipfile.ZipFile:
    res = client.post(f"{PREFIX}/export", headers=HEADERS, json={"items": items})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "application/zip"
    assert res.headers["cache-control"] == "no-store"
    return zipfile.ZipFile(io.BytesIO(res.content))


@pytest.mark.parametrize("name", FIXTURES)
def test_inspect_proposes_dropping_people_and_notes(client, import_on, name: str) -> None:
    res = inspect(client, name)
    assert res.status_code == 200, res.text
    columns = {c["header"]: c for c in default_table(res.json())["columns"]}
    for header in ("Contact Name", "Contact Cell", "Notes"):
        assert columns[header]["action"] == "drop" and columns[header]["sensitive"], header
    assert columns["Organization"]["field"] == "provider_name"
    assert columns["Main Phone"]["field"] == "phone"
    # Previews of sensitive columns are hidden, not echoed.
    assert "Jordan Fakename" not in res.text
    assert "512-555-0199" not in res.text


@pytest.mark.parametrize("name", FIXTURES)
def test_no_contact_name_cell_number_note_or_personal_email_reaches_a_draft(client, import_on, name: str) -> None:
    body = import_fixture(client, name)
    text = json.dumps(body)
    for value in FORBIDDEN:
        assert value not in text, f"{value!r} leaked from {name}"


@pytest.mark.parametrize("name", FIXTURES)
def test_rows_group_by_provider_with_provenance(client, import_on, name: str) -> None:
    body = import_fixture(client, name)
    drafts_ = body["drafts"]
    assert len(drafts_) == 4  # Riverbend's two sites become one service
    pantry = next(d for d in drafts_ if d["service"]["provider_name"] == "Riverbend Food Collective")
    assert pantry["grouped"] is True
    assert [loc["address"] for loc in pantry["service"]["locations"]] == ["1200 E 7th St", "4500 S Congress Ave"]
    assert pantry["provenance"]["file_name"] == name
    assert len(pantry["provenance"]["rows"]) == 2
    hillside = next(d for d in drafts_ if d["service"]["provider_name"] == "Hillside Tenant Help")
    assert hillside["service"]["phone"] == "512-555-0175"
    assert "email" not in hillside["service"]  # the only address was personal
    assert body["rows_read"] == 5


def test_group_false_keeps_one_draft_per_row(client, import_on) -> None:
    body = import_fixture(client, "partners.csv", group=False)
    assert len(body["drafts"]) == 5
    assert len({d["service"]["slug"] for d in body["drafts"]}) == 5


def test_drafts_are_unverified_and_flagged_for_review(client, import_on) -> None:
    body = import_fixture(client, "partners.csv")
    for d in body["drafts"]:
        assert not set(VERIFICATION_KEYS) & set(d["service"])
    codes = {f["code"] for d in body["drafts"] for f in d["flags"]}
    assert "direct_line_removed" in codes  # Hillside's "cell 512-555-0188"


def test_a_pack_duplicate_is_found_by_phone(client, import_on) -> None:
    data = b"Organization,Program,Phone\nAustin Community College,Night Classes,512-223-7022\n"
    res = inspect(client, "list.csv", data=data)
    out = drafts(client, "list.csv", proposed_params(default_table(res.json())), data=data)
    assert out.status_code == 200, out.text
    dupes = out.json()["drafts"][0]["duplicates"]
    assert dupes[0]["slug"] == "acc-adult-education-hse"
    assert "phone" in dupes[0]["reasons"]


def test_export_passes_validate_pack(client, import_on) -> None:
    body = import_fixture(client, "partners.xlsx")
    zf = export_zip(client, accepted(body))
    names = zf.namelist()
    assert "README.txt" in names and "review-issues.csv" in names
    files = get_context().validation_files()
    for n in names:
        if n.startswith("services/"):
            text = zf.read(n).decode()
            assert text.startswith("# Draft from a partner-list import")
            record = yaml.safe_load(text)
            assert not set(VERIFICATION_KEYS) & set(record)
            files[n] = record
    report = validate_pack(files)
    assert report["errors"] == [], report["errors"]
    everything = b"".join(zf.read(n) for n in names).decode("utf-8")
    for value in FORBIDDEN:
        assert value not in everything


def test_merge_keeps_the_existing_id_and_slug(client, import_on) -> None:
    body = import_fixture(client, "partners.csv")
    item = accepted(body)[0]
    item["merge_into"] = "age-of-central-texas"
    zf = export_zip(client, [item])
    record = yaml.safe_load(zf.read("services/age-of-central-texas.yaml"))
    assert record["id"] == "svc-age"
    assert record["slug"] == "age-of-central-texas"
    assert record["phone"] == "512-451-4611"  # existing facts are not overwritten
    assert any(loc["id"].startswith("loc-age-of-central-texas-import-") for loc in record["locations"])
    assert not set(VERIFICATION_KEYS) & set(record)


def test_export_refuses_a_slug_already_in_the_pack(client, import_on) -> None:
    body = import_fixture(client, "partners.csv")
    item = accepted(body)[0]
    item["service"] = {**item["service"], "slug": "age-of-central-texas", "id": "svc-new"}
    res = client.post(f"{PREFIX}/export", headers=HEADERS, json={"items": [item]})
    assert res.status_code == 422
    assert res.json()["code"] == "invalid_drafts"
    assert res.json()["problems"][0]["errors"][0]["code"] == "exists_in_pack"


def test_validate_reports_errors_for_an_edited_draft(client, import_on) -> None:
    body = import_fixture(client, "partners.csv")
    item = accepted(body)[0]
    item["service"] = {**item["service"], "name": ""}
    res = client.post(f"{PREFIX}/validate", headers=HEADERS, json={"items": [item]})
    assert res.status_code == 200
    assert res.json()["ok"] is False


def test_review_csv_cells_cannot_start_a_formula(client, import_on) -> None:
    assert csv_safe("=HYPERLINK(\"http://x\")") == "'=HYPERLINK(\"http://x\")"
    assert csv_safe("+1") == "'+1" and csv_safe("@SUM") == "'@SUM" and csv_safe("plain") == "plain"
    body = import_fixture(client, "partners.csv")
    item = accepted(body)[0]
    item["service"] = {**item["service"], "name": "=cmd|' /C calc'!A0"}
    zf = export_zip(client, [item])
    issues = zf.read("review-issues.csv").decode("utf-8-sig")
    assert ",'=cmd" in issues


def test_write_routes_need_the_admin_token(client, import_on) -> None:
    from tests.import_support import fixture_bytes

    res = client.post(f"{PREFIX}/inspect", files={"file": ("partners.csv", fixture_bytes("partners.csv"))})
    assert res.status_code in (401, 403)
    res = client.post(f"{PREFIX}/export", headers={"X-Admin-Token": "wrong"}, json={"items": [{}]})
    assert res.status_code in (401, 403)


@pytest.mark.parametrize("change", [
    {"merge_into": ["age-of-central-texas"]},
    {"merge_into": {"slug": "age-of-central-texas"}},
    {"service.slug": ["a-b"]},
    {"service.slug": {"x": 1}},
    {"service.id": {"x": 1}},
    {"provenance.rows": {"a": 1}},
    {"provenance": ["not", "a", "dict"]},
    {"flags": 7},
    {"suggestions": 7},
    {"service.locations": 7},
    {"merge_into": "age-of-central-texas", "service.categories": [{"a": 1}]},
])
def test_badly_shaped_items_get_a_problem_not_a_500(client, import_on, change: dict) -> None:
    body = import_fixture(client, "partners.csv")
    item = accepted(body)[0]
    item["service"] = dict(item["service"])
    item["provenance"] = dict(item["provenance"])
    for key, value in change.items():
        if "." in key:
            outer, inner = key.split(".")
            item[outer][inner] = value
        else:
            item[key] = value
    res = client.post(f"{PREFIX}/export", headers=HEADERS, json={"items": [item]})
    assert res.status_code == 422, res.text
    assert res.json()["code"] == "invalid_drafts"
    assert res.json()["problems"][0]["index"] == 0
    res = client.post(f"{PREFIX}/validate", headers=HEADERS, json={"items": [item]})
    assert res.status_code == 200
    assert res.json()["ok"] is False
