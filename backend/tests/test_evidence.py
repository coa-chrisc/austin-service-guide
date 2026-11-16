"""Every drafted field must be supported by text on the cited page."""

from __future__ import annotations

from app.research.evidence import check_candidate, local_date

PAGE = {
    "url": "https://www.example.org/help",
    "final_url": "https://www.example.org/help",
    "title": "Help",
    "retrieved_at": "2026-11-10T15:00:00+00:00",
    "text": ("Northside Clinic offers free check-ups. Call 512.555.0123 or email info@northside.example.org. "
             "We serve adults over 18 living in the county. Located at 9 Oak Ave, Austin, TX 78702."),
    "links": ["https://www.example.org/apply"],
}


def cand(**kw):
    base = {"name": "Northside Clinic", "provider_name": "Northside Clinic", "evidence": []}
    base.update(kw)
    return base


def test_supported_quote_is_kept_with_its_source():
    c, prov = check_candidate(cand(description="Free check-ups.", evidence=[
        {"field": "description", "quote": "Northside Clinic offers free check-ups."}]), PAGE)
    assert c["description"] == "Free check-ups."
    [ref] = prov["fields"]["description"]
    assert ref["url"] == PAGE["final_url"] and ref["quote"].startswith("Northside")
    assert ref["retrieved_at"] == local_date(PAGE["retrieved_at"])


def test_text_field_without_evidence_is_blanked_and_listed_missing():
    c, prov = check_candidate(cand(eligibility_summary="Anyone can come."), PAGE)
    assert c["eligibility_summary"] is None
    assert "eligibility_summary" in prov["missing"]
    assert any(f["field"] == "eligibility_summary" for f in prov["flags"])


def test_quote_not_on_the_page_is_dropped_and_flagged():
    c, prov = check_candidate(cand(description="Free dental care.", evidence=[
        {"field": "description", "quote": "We offer free dental care to everyone."}]), PAGE)
    assert c["description"] is None and "description" not in prov["fields"]
    assert any("not found on the cited page" in f["message"] for f in prov["flags"])


def test_quote_matching_tolerates_whitespace_case_and_typographic_quotes():
    page = {**PAGE, "text": "We’re open   to ADULTS\nover 18."}
    c, prov = check_candidate(cand(eligibility_summary="Adults.", evidence=[
        {"field": "eligibility_summary", "quote": "we're open to adults over 18"}]), page)
    assert c["eligibility_summary"] == "Adults." and "eligibility_summary" in prov["fields"]


def test_phone_must_appear_on_the_page_in_any_format():
    c, prov = check_candidate(cand(phone="(512) 555-0123"), PAGE)
    assert c["phone"] == "(512) 555-0123" and "phone" in prov["fields"]
    c, prov = check_candidate(cand(phone="512-555-9999"), PAGE)
    assert c["phone"] is None and "phone" in prov["missing"]


def test_email_and_website_must_come_from_the_page():
    c, _ = check_candidate(cand(email="info@northside.example.org", website_url="https://example.org/apply/"), PAGE)
    assert c["email"] == "info@northside.example.org"
    assert c["website_url"] == "https://example.org/apply/"  # a link on the page
    c, prov = check_candidate(cand(email="boss@elsewhere.example", website_url="https://scam.example/"), PAGE)
    assert c["email"] is None and c["website_url"] is None
    assert {"email", "website_url"} <= set(prov["missing"])


def test_location_without_its_address_on_the_page_is_dropped():
    c, prov = check_candidate(cand(locations=[
        {"address": "1 Fake St", "phone": None, "hours": {}},
        {"address": "9 Oak Ave", "phone": "512.555.0123", "hours": {"monday": "9:00 AM - 5:00 PM"}},
    ]), PAGE)
    assert [loc["address"] for loc in c["locations"]] == ["9 Oak Ave"]
    assert c["locations"][0]["hours"] == {}  # hours without a quote are removed
    assert "locations.0.address" in prov["fields"]  # renumbered to the kept index
    assert any(f["field"] == "locations.0.address" and "dropped" in f["message"] for f in prov["flags"])


def test_name_not_on_the_page_is_flagged_for_review():
    _, prov = check_candidate(cand(name="Southside Clinic"), PAGE)
    assert any(f["field"] == "name" for f in prov["flags"])
