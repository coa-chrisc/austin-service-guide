"""Catalog research agent (issue #18): plan, search, fetch, extract, check
evidence and draft data-pack service entries for staff review.

Runs in the job worker only. Model calls for research live here, not in
``app/services/ai.py``; every call passes ``store=False``.
"""
