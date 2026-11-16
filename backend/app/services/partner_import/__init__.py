"""Partner-list import (issue #19): staff upload an organisation list and get
catalog drafts that follow the data-pack contract (docs/DATA_PACK.md).

The flow, all in this package and driven by ``app/routers/partner_import.py``:

1. ``upload``     bounded read of the request body and an in-memory multipart
                  split (nothing is spooled to disk).
2. ``sniff``      file type by extension *and* content, macro and zip-bomb checks.
3. ``parse_*``    CSV (stdlib), XLSX (openpyxl, read-only, cached values only)
                  and DOCX tables (zipfile + defusedxml) into plain text tables,
                  under the limits in ``limits``.
4. ``guard``      refuses files that look like records about residents.
5. ``mapping``    header-row guess and the deterministic column matcher: which
                  columns map to which catalog field, which are dropped and why.
6. ``filters``    value-level filters on the reduced table (mapped columns
                  only): resident identifiers, contact-person phrases, direct
                  lines, personal emails.
7. ``model_step`` optional (``IMPORT_USE_MODEL``) structured-output call that
                  suggests hours, address parts, categories and gates.
8. ``to_drafts``  rows to draft services, grouping by provider, slugs, ZIP-centre
                  coordinates, dedupe against the pack and ``validate_pack``.
9. ``export``     merge into an existing service, and the YAML zip download.

The server keeps nothing between requests: the browser holds the file and
sends it again with the confirmed mapping. ``pipeline.build_drafts`` is the
job body; with ``JOB_BACKEND=inline`` the router runs it in the request. A
background worker (issue #18) would call the same function with the reduced
table it stores.
"""
