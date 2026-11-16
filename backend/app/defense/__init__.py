"""Abuse defense and cost guardrails (issues #26 and #27, epic #25).

Lives outside ``app.services`` and ``app.routers`` on purpose: those
packages hold no module-level state (``tests/test_stateless_intake.py``),
while the limiter needs counters. Nothing here holds resident text; see
``tests/test_defense_privacy.py``.

Modules:

- ``principal``: who is asking (access label, admin, device token, anon)
- ``store`` / ``store_memory``: the ``DefenseStore`` protocol and its
  in-memory backend (per process; on Vercel per instance)
- ``limits``: the policy table and the ``limit("policy")`` route dependency
- ``challenge`` / ``device``: proof of work and the 24-hour device cookie
- ``usage``: ``response.usage`` metering and dollar estimates
- ``budget``: token, dollar and voice-second budgets; ``ai_allowed()``
- ``breakers``: ``voice``, ``live_ai``, ``share`` breakers and kill switches
"""
