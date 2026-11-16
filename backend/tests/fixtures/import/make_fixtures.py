"""Regenerate the partner-list import fixtures in this folder.

Run from backend/:  python tests/fixtures/import/make_fixtures.py

All organisations, people, numbers and addresses are invented. The files
carry the columns the acceptance criteria name (Organization, Program, Main
Phone, Contact Name, Contact Cell, Email, Address, Hours, Notes), so tests
can prove that contact names, cell numbers, notes and personal emails never
reach a draft.
"""

from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent

HEADERS = ["Organization", "Program", "Main Phone", "Contact Name", "Contact Cell", "Email", "Address", "Hours", "Notes"]
PARTNERS = [
    ["Riverbend Food Collective", "Weekly Grocery Pantry", "(512) 555-0142", "Jordan Fakename", "512-555-0199",
     "info@riverbendfood.example.org", "1200 E 7th St, Austin, TX 78702", "Mon-Fri 9am-5pm",
     "Contact: Priya Testperson about the MOU renewal"],
    ["Riverbend Food Collective", "Weekly Grocery Pantry", "(512) 555-0142", "Jordan Fakename", "512-555-0199",
     "info@riverbendfood.example.org", "4500 S Congress Ave, Austin, TX 78745", "Sat 10am-2pm",
     "Second site, opened last spring"],
    ["Hillside Tenant Help", "Eviction Defense Clinic", "Main: 512-555-0175, cell 512-555-0188", "Avery Madeup",
     "512-555-0161", "avery.madeup@hillsidetenant.example.org", "88 Oak Hollow Dr, Austin, TX 78741",
     "M/W/F 9:00 AM - 12:00 PM", "Ask for Avery; budget code 44-17"],
    ["Northside Learning Center", "Adult GED Classes", "512-555-0133", "Sam Notreal", "512-555-0122",
     "classes@northsidelearning.example.org", "9100 N Lamar Blvd, Austin, TX 78753", "Weekdays 8-5",
     "Liaison retired in June"],
    ["Bluebonnet Crisis Line", "24-Hour Support Line", "512-555-0100", "Casey Imaginary", "512-555-0111",
     "casey.i@bluebonnetline.example.org", "", "24/7", "Do not share the director's cell"],
]
CLIENT_HEADERS = ["Client Name", "DOB", "Case #", "Household Size", "Program", "Phone"]
CLIENTS = [
    ["Pat Example", "03/14/1981", "C-1001", "3", "Pantry", "512-555-0150"],
    ["Lee Sample", "11/02/1975", "C-1002", "1", "Rent help", "512-555-0151"],
    ["Robin Fictional", "07/30/1990", "C-1003", "4", "GED", "512-555-0152"],
]


def write_csv(path: Path, headers: list[str], rows: list[list[str]]) -> None:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(headers)
    writer.writerows(rows)
    path.write_text(buf.getvalue(), encoding="utf-8")


def write_xlsx(path: Path) -> None:
    """A title row merged across the header, a hidden sheet and a hidden row."""
    import openpyxl
    from openpyxl.comments import Comment

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Partners"
    ws.append(["Community partner list (fictional)"])
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(HEADERS))
    ws.append(HEADERS)
    for row in PARTNERS:
        ws.append(row)
    ws.append(["Hidden Partner Org", "Hidden Program", "512-555-0177", "Hidden Person", "512-555-0178",
               "hidden@example.org", "1 Hidden Way, Austin, TX 78701", "Mon 9am-5pm", "hidden row"])
    ws.row_dimensions[ws.max_row].hidden = True
    ws["I3"].comment = Comment("Internal note: call the director first", "Staff")
    internal = wb.create_sheet("Internal budget")
    internal.append(["Partner", "Budget", "Contract #"])
    internal.append(["Riverbend Food Collective", "12000", "K-77"])
    internal.sheet_state = "hidden"
    wb.save(path)


def _w_cell(text: str) -> str:
    return f"<w:tc><w:p><w:r><w:t xml:space=\"preserve\">{escape(text)}</w:t></w:r></w:p></w:tc>"


def write_docx(path: Path) -> None:
    """A minimal Word document: a heading paragraph and one table."""
    rows = "".join("<w:tr>" + "".join(_w_cell(c) for c in row) + "</w:tr>" for row in [HEADERS, *PARTNERS])
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        "<w:p><w:r><w:t>Community partner list (fictional)</w:t></w:r></w:p>"
        f"<w:tbl>{rows}</w:tbl></w:body></w:document>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/></Relationships>'
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/document.xml", document)


def main() -> None:
    write_csv(HERE / "partners.csv", HEADERS, PARTNERS)
    write_csv(HERE / "client_list.csv", CLIENT_HEADERS, CLIENTS)
    write_xlsx(HERE / "partners.xlsx")
    write_docx(HERE / "partners.docx")


if __name__ == "__main__":
    main()
