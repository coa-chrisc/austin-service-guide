"""Partner import: the client-record guard refuses files about residents (issue #19)."""

from __future__ import annotations

import logging

import pytest

from app.services.partner_import import limits as L
from app.services.partner_import.pipeline import parse_upload
from tests.import_support import (  # noqa: F401  (import_on is a fixture)
    default_table,
    drafts,
    fixture_bytes,
    import_on,
    inspect,
    proposed_params,
)

CLIENT_VALUES = ["Pat Example", "03/14/1981", "C-1001", "Lee Sample", "11/02/1975", "512-555-0150"]


def test_client_list_is_refused_and_nothing_is_echoed_or_logged(client, import_on, caplog) -> None:
    caplog.set_level(logging.DEBUG)
    res = inspect(client, "client_list.csv")
    assert res.status_code == 422
    body = res.json()
    assert body["code"] == L.LOOKS_LIKE_CLIENT_RECORDS
    assert "Nothing from the file was kept" in body["message"]
    for value in CLIENT_VALUES:
        assert value not in res.text
        assert value not in caplog.text
    assert "client_list.csv" not in caplog.text


def test_refused_on_values_alone_over_five_percent() -> None:
    rows = ["Organization,Program,Notes"]
    rows += [f"Org {i},Pantry,fine" for i in range(18)]
    rows += ["Org X,Pantry,SSN 123-45-6789", "Org Y,Pantry,DOB: 03/14/1981"]
    with pytest.raises(L.ImportRefused) as exc:
        parse_upload("\n".join(rows).encode(), "list.csv")
    assert exc.value.code == L.LOOKS_LIKE_CLIENT_RECORDS
    assert "123-45-6789" not in exc.value.message


def test_one_stray_value_under_the_threshold_is_allowed() -> None:
    rows = ["Organization,Program,Notes"] + [f"Org {i},Pantry,fine" for i in range(40)] + ["Org X,Pantry,SSN 123-45-6789"]
    parse_upload("\n".join(rows).encode(), "list.csv")


def test_data_cells_that_mention_medicaid_do_not_trip_the_header_rule() -> None:
    data = b"Organization,Program,Eligibility\nOrg A,Clinic,Medicaid accepted\nOrg B,Clinic,Client name required\n"
    parse_upload(data, "list.csv")


@pytest.mark.parametrize("header", ["Client Name", "DOB", "Case #", "Social Security Number", "Diagnosis", "Patient ID"])
def test_each_client_header_is_refused(header: str) -> None:
    data = f"Organization,{header}\nOrg A,x\n".encode()
    with pytest.raises(L.ImportRefused) as exc:
        parse_upload(data, "list.csv")
    assert exc.value.code == L.LOOKS_LIKE_CLIENT_RECORDS


def test_a_header_row_chosen_at_confirm_time_is_checked(client, import_on) -> None:
    # Row 13 holds client headers below a normal-looking table: inspect passes, choosing it is refused.
    data = (b"Organization,Program\nOrg A,Pantry\nOrg B,Clinic\nOrg C,Clinic\nOrg D,Clinic\nOrg E,Clinic\n"
            b"Org F,Clinic\nOrg G,Clinic\nOrg H,Clinic\nOrg I,Clinic\nOrg J,Clinic\nOrg K,Clinic\n"
            b"Client Name,Case #\nOrg L,Clinic\n")
    body = inspect(client, "list.csv", data=data).json()
    params = proposed_params(default_table(body))
    params.update(header_row=13, mapping={"0": "provider_name", "1": "name"})
    res = drafts(client, "list.csv", params, data=data)
    assert res.status_code == 422
    assert res.json()["code"] == L.LOOKS_LIKE_CLIENT_RECORDS


def test_partner_fixtures_pass_the_guard() -> None:
    for name in ("partners.csv", "partners.xlsx", "partners.docx"):
        parse_upload(fixture_bytes(name), name)
