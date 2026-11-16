# Private SearXNG for the research worker (#18).
# Bakes settings.yml into the official image, because Railway has no config-file
# mount. Build context is this directory: railway up deploy/railway/searxng --path-as-root --service searxng
# The image listens on [::]:8080 (GRANIAN_HOST="::", GRANIAN_PORT=8080), which
# serves both IPv4 and IPv6 on Railway's private network.
# Pinned to a dated tag; bump it deliberately.
FROM searxng/searxng:2026.11.14-a7128d5d1
# The entrypoint expects the config to be owned by searxng:searxng.
COPY --chown=searxng:searxng settings.yml /etc/searxng/settings.yml
