"""Background jobs (catalog research, later partner import; issue #18).

The main app only proxies (``settings``, ``auth``, ``proxy``; stdlib + httpx,
safe on Vercel). The worker side (``models``, ``store``) needs the worker
dependencies in ``backend/requirements-worker.txt`` and is never imported by
the main app unless ``JOB_BACKEND=inline``.
"""
