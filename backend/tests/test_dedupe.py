"""Duplicate detection between a draft and the pack (or other drafts).

A possible duplicate needs a similar service name AND the same organisation
or place (address, phone, website); records at two known, different
addresses are never duplicates. A shared phone or address alone is not
enough: one community center runs many different services."""

from __future__ import annotations

from app.services.dedupe import address_key, find_duplicates, phone_key, registrable_domain

EXISTING = [
    {"slug": "central-food-bank", "name": "Central Texas Food Bank", "provider_name": "Central Texas Food Bank",
     "phone": "(512) 282-2111",
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
    draft = {"slug": "ctfb", "name": "Central Texas Food Bank Pantry", "phone": "512.282.2111",
             "website_url": "http://centraltexasfoodbank.org/",
             "locations": [{"address": "6500 Metropolis Dr", "zip_code": "78744"}]}
    [dup] = find_duplicates(draft, EXISTING, source="pack")
    assert dup["slug"] == "central-food-bank" and dup["source"] == "pack"
    assert "same phone number" in dup["reasons"]
    assert "same street address and ZIP" in dup["reasons"]
    assert any(r.startswith("same website domain") for r in dup["reasons"])
    assert any(r.startswith("similar name") for r in dup["reasons"])


def test_similar_names_of_the_same_organisation_are_reported():
    draft = {"name": "Central Texas Food Bank Inc", "provider_name": "Central Texas Food Bank"}
    [dup] = find_duplicates(draft, EXISTING, source="draft")
    assert dup["reasons"] == ["same organisation", "similar name (100% word overlap)"]


def test_a_similar_name_alone_is_not_a_duplicate():
    assert find_duplicates({"name": "Central Texas Food Bank Inc"}, EXISTING, source="draft") == []


def test_different_services_at_one_site_are_not_duplicates():
    site = {"phone": "(512) 854-4100", "provider_name": "Travis County Health and Human Services",
            "website_url": "https://www.traviscountytx.gov/central",
            "locations": [{"name": "Central Austin Community Center", "address": "100 Main St", "zip_code": "78702"}]}
    pantry = {**site, "slug": "pantry", "name": "Central Austin Community Center Food Pantry"}
    for other in ("Clothing Closet", "Public Computers", "Utility Assistance", "Job Search Services"):
        draft = {**site, "name": f"Central Austin Community Center {other}"}
        assert find_duplicates(draft, [pantry], source="draft") == [], other
    same = {**site, "name": "Central Austin Community Center Food Pantry Program"}
    [dup] = find_duplicates(same, [pantry], source="draft")
    assert "same street address and ZIP" in dup["reasons"]


def test_the_same_service_at_two_known_addresses_is_not_a_duplicate():
    county = {"phone": "(512) 854-4100", "provider_name": "Travis County Health and Human Services"}
    central = {**county, "slug": "c", "name": "Food Pantry",
               "locations": [{"name": "Central Austin Community Center", "address": "100 Main St", "zip_code": "78702"}]}
    del_valle = {**county, "name": "Food Pantry",
                 "locations": [{"name": "Del Valle Community Center", "address": "3518 FM 973", "zip_code": "78617"}]}
    assert find_duplicates(del_valle, [central], source="draft") == []
    no_address = {**county, "name": "Food Pantry"}  # nothing tells them apart: a reviewer should look
    assert find_duplicates(no_address, [central], source="draft")[0]["reasons"][:2] == [
        "same phone number", "same organisation"]


def test_unrelated_services_are_not_duplicates():
    assert find_duplicates({"name": "Eastside Clinic", "phone": "512-555-0100"}, EXISTING, source="pack") == []


def test_a_record_is_not_its_own_duplicate():
    assert find_duplicates(EXISTING[0], EXISTING, source="pack") == []


def test_a_shared_government_domain_needs_the_same_page():
    pack = [{"slug": "wic", "name": "WIC Nutrition", "website_url": "https://www.austintexas.gov/department/wic"}]
    other_page = {"name": "WIC Nutrition", "website_url": "https://austintexas.gov/department/library"}
    same_page = {"name": "WIC Nutrition Help", "website_url": "https://austintexas.gov/department/wic/"}
    assert find_duplicates(other_page, pack, source="pack") == []
    assert find_duplicates(same_page, pack, source="pack")[0]["reasons"][0] == "same website page"
