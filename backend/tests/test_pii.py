"""Unit tests for app.services.pii.redact."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services import pii
from app.services.city import load_city
from app.services.pii import ASSISTANT_KINDS, PLACEHOLDERS, redact

_DEFAULT_CITY = load_city({})


@pytest.fixture(autouse=True)
def _default_city_config(monkeypatch):
    # The shared fixture assumes config/city.config.json, whatever CITY_CONFIG
    # / CITY_PRESET say; piiGuard.test.ts pins the same file.
    monkeypatch.setattr(pii, "get_city", lambda: _DEFAULT_CITY)


@pytest.mark.parametrize(
    ("text", "kind", "raw"),
    [
        ("My SSN is 123-45-6789", "ssn", "123-45-6789"),
        ("ssn 123 45 6789", "ssn", "123 45 6789"),
        ("social security number is 123456789", "ssn", "123456789"),
        ("my social: 123.45.6789", "ssn", "123.45.6789"),
        ("last four of my social is 4321", "ssn", "4321"),
        ("mi número de seguro social es 123456789", "ssn", "123456789"),
        ("call me at (512) 555-0199", "phone", "555-0199"),
        ("my cell is 512.555.0199", "phone", "512.555.0199"),
        ("text +1 512 555 0199 anytime", "phone", "512 555 0199"),
        ("number 5125550199", "phone", "5125550199"),
        ("reach me at 555-0199", "phone", "555-0199"),
        ("email jane.doe+food@example.org please", "email", "jane.doe+food@example.org"),
        ("card 4111 1111 1111 1111", "card", "4111 1111 1111 1111"),
        ("4111-1111-1111-1111", "card", "4111-1111-1111-1111"),
        ("amex 3782 822463 10005", "card", "3782 822463 10005"),
        ("I live at 1234 Elm St Apt 5", "address", "1234 Elm St"),
        ("4500 S Congress Ave", "address", "4500 S Congress Ave"),
        ("we're at 12 Oak Court now", "address", "12 Oak Court"),
        ("6800 burleson rd", "address", "6800 burleson rd"),
        ("send it to P.O. Box 1234", "address", "Box 1234"),
        ("my DOB is 03/15/1988", "dob", "03/15/1988"),
        ("date of birth: 1988-03-15", "dob", "1988-03-15"),
        ("I was born on March 5, 1990", "dob", "March 5, 1990"),
        ("fecha de nacimiento 5 de mayo de 1990", "dob", "5 de mayo de 1990"),
        ("My Medicaid number is 512345678", "id_number", "512345678"),
        ("medicare id 1EG4-TE5-MK73", "id_number", "1EG4-TE5-MK73"),
        ("member ID: ABC1234567", "id_number", "ABC1234567"),
        ("case # 2024-778812", "id_number", "2024-778812"),
        ("driver's license 12345678", "id_number", "12345678"),
    ],
)
def test_redacts_identifier(text, kind, raw):
    result = redact(text)
    assert raw not in result.text
    assert PLACEHOLDERS[kind] in result.text
    assert kind in result.types


@pytest.mark.parametrize(
    "text",
    [
        "78744",
        "I live in 78744",
        "zip 78744-1234",
        "in case 78744",
        "$1,200 rent",
        "I owe 1,450 on rent, 2 adults 3 kids",
        "I make $2,500 a month",
        "Under $1,000",
        "3 kids",
        "I'm 34",
        "I'm 34 years old and my husband is 36",
        "household of 5 in 78741",
        "2 people",
        "I work 40 hours a week",
        "I have 1 eviction court date next week",
        "3 months on the street",
        "I've been homeless for 2 years on 6th Street",
        "2 kids no way to pay",
        "we have 1 car to drive",
        "I need 2 bus pass",
        "I'm on SNAP benefits since 2019",
        "My insurance policy is 2024",
        "account balance 1200",
        "I was born in 1990",
        "My appointment is 10/21/2026",
        "I'd like 2 bags of groceries",
        "Call 988 if you need help",
        "1234 5678 9012 3456",  # fails Luhn
    ],
)
def test_leaves_safe_text_alone(text):
    result = redact(text)
    assert result.text == text
    assert result.types == []


def test_multiple_types_reported_sorted_without_raw_values():
    text = "SSN 123-45-6789, phone 512-555-0199, I live at 1234 Elm St in 78744 with 3 kids"
    result = redact(text)
    assert result.types == ["address", "phone", "ssn"]
    assert result.text == (
        "SSN [SSN removed], phone [phone removed], I live at [address removed] "
        "in 78744 with 3 kids"
    )
    # Only type keys come back, never the matched values.
    assert set(result.types) <= set(PLACEHOLDERS)


def test_keyword_is_kept_so_sentence_reads_naturally():
    assert redact("my medicaid number is 512345678").text == (
        "my medicaid number is [ID number removed]"
    )


def test_redaction_is_idempotent():
    once = redact("phone 512-555-0199, ssn 123-45-6789").text
    assert redact(once).text == once
    assert redact(once).types == []


@pytest.mark.parametrize(
    "text",
    [
        "45 minute drive to work",
        "I have 2 eviction notices Court date is Monday",
    ],
)
def test_count_and_time_words_are_not_house_numbers(text):
    assert redact(text).text == text


# ── Assistant-mode redaction ────────────────────────────────────────────

def test_assistant_kinds_keep_catalog_phone_address_and_email():
    from app.services.pii import ASSISTANT_KINDS

    text = (
        "Call 512-972-5000 or visit 1000 E 11th St. Email info@caritasofaustin.org. "
        "For Medicaid: 1-800-252-8263. I heard 123-45-6789 and jane@example.org."
    )
    result = redact(text, kinds=ASSISTANT_KINDS, keep={"INFO@caritasofaustin.org"})
    assert result.text == (
        "Call 512-972-5000 or visit 1000 E 11th St. Email info@caritasofaustin.org. "
        "For Medicaid: 1-800-252-8263. I heard [SSN removed] and [email removed]."
    )
    assert result.types == ["email", "ssn"]


def test_dashed_phone_after_id_keyword_is_redacted_as_phone_for_residents():
    assert redact("Medicaid: 512-555-0199").text == "Medicaid: [phone removed]"


# ── Linear time on adversarial input ────────────────────────────────────

@pytest.mark.parametrize(
    "unit",
    ["a", "7", "a1", "a.", "id ", "number ", "phone : ", "1 ", "zip ", "zip code ", "I'm Greater "],
)
def test_redact_is_fast_on_200kb_without_matches(unit):
    import time

    text = (unit * (200_000 // len(unit) + 1))[:200_000]
    started = time.perf_counter()
    redact(text)
    assert time.perf_counter() - started < 1.0


@pytest.mark.parametrize(
    "text",
    [
        "I'm 34",
        "I am a veteran",
        "I am unemployed",
        "I'm in Austin",
        "I am Hispanic",
        "my name is on the lease",
        "I am Not Sure",
        "I'm looking for food",
        "This is Maria",
        "I am Maria",
    ],
)
def test_name_rule_leaves_non_names_alone(text):
    assert redact(text) == (text, [])


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("my name is maria", "my name is [name removed]"),
        ("My name's Maria Garcia.", "My name's [name removed]."),
        ("me llamo José", "me llamo [name removed]"),
        ("I'm Maria Lopez and I need food", "I'm [name removed] and I need food"),
        ("this is Maria Garcia", "this is [name removed]"),
    ],
)
def test_name_rule_redacts_after_self_identification(text, expected):
    result = redact(text)
    assert result.text == expected
    assert result.types == ["name"]


def test_name_is_not_an_assistant_kind():
    assert "name" not in ASSISTANT_KINDS
    text = "I'm Maria Lopez"
    assert redact(text, kinds=ASSISTANT_KINDS).text == text


# Place-name stopwords come from the city config, not from code. Mirrored in
# frontend/src/lib/piiGuard.city.test.ts with the same preset and cases.
_CEDAR_RIDGE_CASES = [
    ("I'm Cedar Ridge Resident", "I'm Cedar Ridge Resident"),
    ("this is Oregon Coast", "this is Oregon Coast"),
    ("I'm Austin Lopez", "I'm [name removed]"),
    ("I'm Texas Born", "I'm [name removed]"),
    ("I'm Maria Lopez", "I'm [name removed]"),
]


@pytest.mark.parametrize(("text", "expected"), _CEDAR_RIDGE_CASES)
def test_place_stopwords_follow_the_city_config(monkeypatch, text, expected):
    cedar_ridge = load_city({"CITY_PRESET": "cedar-ridge-county"})
    monkeypatch.setattr(pii, "get_city", lambda: cedar_ridge)
    assert redact(text).text == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("I'm Cedar Ridge Resident", "I'm [name removed] Resident"),
        ("this is Oregon Coast", "this is [name removed]"),
        ("I'm Texas Born", "I'm Texas Born"),
    ],
)
def test_other_places_are_not_stopwords_under_the_default_config(text, expected):
    assert redact(text).text == expected


_FIXTURE = Path(__file__).parent / "fixtures" / "pii_cases.json"
_CASES = json.loads(_FIXTURE.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", _CASES, ids=[c["input"][:40] for c in _CASES])
def test_shared_fixture_matches_backend_redactor(case):
    # The same fixture is run through frontend/src/lib/piiGuard.ts by vitest.
    result = redact(case["input"])
    assert result.text == case["expected"]
    assert result.types == case["kinds"]
