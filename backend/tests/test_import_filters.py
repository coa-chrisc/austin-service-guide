"""Partner import: column classification and value-level filters (issue #19)."""

from __future__ import annotations

import pytest

from app.services.partner_import.filters import clean_text, clean_website, is_role_email, pick_email, pick_phone
from app.services.partner_import.mapping import DROP, classify


@pytest.mark.parametrize("header,field", [
    ("Organization", "provider_name"), ("Agency Name", "provider_name"), ("Program", "name"),
    ("Main Phone", "phone"), ("Hours of Operation", "hours"), ("E-mail", "email"), ("Zip Code", "zip_code"),
    ("Who We Serve", "eligibility_summary"), ("Website", "website_url"), ("Street Address", "address"),
])
def test_known_headers_are_kept(header: str, field: str) -> None:
    result = classify(header)
    assert (result["action"], result["field"]) == ("keep", field)


@pytest.mark.parametrize("header", [
    "Contact Name", "Contact Cell", "Point of Contact", "Director", "Staff Email", "Direct Line", "Liaison Phone",
    "Notes", "Comments", "MOU Expiration", "Budget", "Title", "Case Manager", "Cell", "Ext.",
])
def test_person_and_internal_headers_are_dropped_as_sensitive(header: str) -> None:
    result = classify(header)
    assert result["action"] == DROP
    assert result["sensitive"] is True, header


@pytest.mark.parametrize("header", ["Name", "Service Area", "County", "Status", "", "Xyzzy"])
def test_ambiguous_or_unknown_headers_are_dropped_by_default(header: str) -> None:
    result = classify(header)
    assert result["action"] == DROP
    assert result["sensitive"] is False


def test_contact_phrases_are_removed_from_free_text() -> None:
    flags: set[str] = set()
    out = clean_text("Free groceries every week. Contact: Priya Testperson for details.", flags)
    assert "Priya" not in out and "Testperson" not in out
    assert out.startswith("Free groceries every week.")
    assert "contact_name_removed" in flags


def test_ask_for_and_attn_phrases_are_removed() -> None:
    for text in ("Walk in; ask for Avery Madeup at the desk", "Mail forms attn Dr. Sam Notreal"):
        flags: set[str] = set()
        out = clean_text(text, flags)
        assert "Madeup" not in out and "Notreal" not in out, out
        assert "contact_name_removed" in flags


def test_labelled_direct_lines_and_personal_emails_are_removed() -> None:
    flags: set[str] = set()
    out = clean_text("Call the office. Cell: 512-555-0188. Write to avery.madeup@x.example.org or info@x.example.org", flags)
    assert "555-0188" not in out
    assert "avery.madeup@" not in out
    assert "info@x.example.org" in out
    assert {"direct_line_removed", "personal_email_removed"} <= flags


def test_resident_identifiers_are_redacted() -> None:
    flags: set[str] = set()
    out = clean_text("Bring ID. Example SSN 123-45-6789 on file.", flags)
    assert "123-45-6789" not in out
    assert "resident_identifier_removed" in flags


def test_a_bare_name_in_free_text_still_gets_through() -> None:
    # The documented limit: no phrase, no catch. A person reviews every draft.
    assert "Jordan" in clean_text("Run by Jordan Fakename since 2019.", set())


def test_pick_phone_keeps_the_main_number_and_drops_the_cell() -> None:
    flags: set[str] = set()
    assert pick_phone("Main: 512-555-0175, cell 512-555-0188", flags) == "512-555-0175"
    assert "direct_line_removed" in flags


def test_pick_phone_drops_extensions_and_prefers_labelled_main() -> None:
    flags: set[str] = set()
    assert pick_phone("(512) 555-0100 x204; office 512-555-0101", flags) == "512-555-0101"
    assert {"extension_removed", "extra_phones_dropped"} <= flags
    assert pick_phone("311", set()) == "311"
    flags = set()
    assert pick_phone("call us", flags) == ""
    assert "phone_unrecognised" in flags


def test_role_emails_are_kept_and_personal_ones_dropped() -> None:
    assert is_role_email("info@riverbend.example.org", ())
    assert is_role_email("classes@northside.example.org", ("Adult GED Classes",))
    assert not is_role_email("casey.i@bluebonnet.example.org", ("24-Hour Support Line",))
    flags: set[str] = set()
    assert pick_email("casey.i@a.example.org; help@a.example.org", (), flags) == "help@a.example.org"
    assert "personal_email_removed" in flags


def test_websites_are_normalised_or_flagged() -> None:
    assert clean_website("riverbend.example.org/pantry", set()) == "https://riverbend.example.org/pantry"
    flags: set[str] = set()
    assert clean_website("info@riverbend.example.org", flags) == ""
    assert "website_unrecognised" in flags
    assert clean_website("javascript:alert(1)", set()) == ""
