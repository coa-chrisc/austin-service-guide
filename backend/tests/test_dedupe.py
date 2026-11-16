"""Duplicate detection between a draft and the pack (or other drafts)."""

from __future__ import annotations

from app.services.dedupe import address_key, find_duplicates, phone_key, registrable_domain

EXISTING = [
    {"slug": "central-food-bank", "name": "Central Texas Food Bank", "phone": "(512) 282-2111",
     "website_url": "https://www.centraltexasfoodbank.org/get-help",
     "locations": [{"address": "6500 Metropolis Drive", "zip_code": "78744"}]},
    {"slug": "other", "name": "Library Card Signup", "phone": "512-974-7400"},
]


def test_keys_normalize_formatting():
    assert phone_key("+1 (512) 282-2111") == phone_key("512.282.2111") == "5122822111"
    assert registrable_domain("https://www.centraltexasfoodbank.org/x") == "centraltexasfoodbank.org"
    assert registrable_domain("https://foodbank.austintexas.gov/") == "austintexas.gov"
    assert address_key("6500 Metropolis Dr.", "78744") == address_key("6500 METROPOLIS DRIVE", "78744-1234")


def test_same_phone_address_and_domain_are_reported_with_reasons():
    draft = {"slug": "ctfb", "name": "Food Bank Pantry Network", "phone": "512.282.2111",
             "website_url": "http://centraltexasfoodbank.org/",
             "locations": [{"address": "6500 Metropolis Dr", "zip_code": "78744"}]}
    [dup] = find_duplicates(draft, EXISTING, source="pack")
    assert dup["slug"] == "central-food-bank" and dup["source"] == "pack"
    assert "same phone number" in dup["reasons"]
    assert "same street address and ZIP" in dup["reasons"]
    assert any(r.startswith("same website domain") for r in dup["reasons"])


def test_similar_names_are_reported():
    [dup] = find_duplicates({"name": "Central Texas Food Bank Inc"}, EXISTING, source="draft")
    assert dup["reasons"] == ["similar name (80% word overlap)"] or dup["reasons"][0].startswith("similar name")


def test_unrelated_services_are_not_duplicates():
    assert find_duplicates({"name": "Eastside Clinic", "phone": "512-555-0100"}, EXISTING, source="pack") == []


def test_a_record_is_not_its_own_duplicate():
    assert find_duplicates(EXISTING[0], EXISTING, source="pack") == []


def test_a_shared_government_domain_needs_the_same_page():
    pack = [{"slug": "wic", "name": "WIC Nutrition", "website_url": "https://www.austintexas.gov/department/wic"}]
    other_page = {"name": "Library Cards", "website_url": "https://austintexas.gov/department/library"}
    same_page = {"name": "Nutrition Help", "website_url": "https://austintexas.gov/department/wic/"}
    assert find_duplicates(other_page, pack, source="pack") == []
    assert find_duplicates(same_page, pack, source="pack")[0]["reasons"] == ["same website page"]
