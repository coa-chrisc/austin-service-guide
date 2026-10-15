"""Unit tests for app.services.pii.redact."""

from __future__ import annotations

import pytest

from app.services.pii import PLACEHOLDERS, redact


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
