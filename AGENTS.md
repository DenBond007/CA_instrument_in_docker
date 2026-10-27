# Repository Guidelines

## Project Structure & Module Organization

This Docker Compose toolkit for system analysts includes Russian-language Obsidian documentation.

- `compose.yaml` defines the editors and rendering services; `compose.portainer.yaml` manages optional Portainer separately.
- `scripts/` contains setup, health-check, update, and configuration-backup scripts.
- `specs/openapi.yaml` supplies Swagger UI; `samples/` contains Mermaid, PlantUML, and AsyncAPI examples.
- Numbered notes (`00`–`15`) document operation; `assets/portainer/` and `assets/portal/` hold screenshots.
- `docker/portal/` contains the static tool launcher, unprivileged Nginx image, and runtime link generator; the portal uses the same host/port settings as Compose.
- `docker/mermaid/` contains the custom Dockerfile, checked upstream patch, and runtime configuration generator. `.github/workflows/` tests and publishes the image to GHCR.

## Build, Test, and Development Commands

Run from the repository root on Ubuntu with Docker Engine, Compose, curl, and sudo available. Create `.env` from `.env.example` if absent, then set `BIND_IP` to an address assigned to the host. The published Mermaid image can be pulled anonymously from GHCR.

- `bash scripts/first-run.sh` — checks prerequisites, pulls ready-made images, and starts services.
- `sudo docker compose config --quiet` — validates the resolved configuration.
- `sudo docker compose up -d --no-build` — applies configuration using published images.
- `sudo docker compose -f compose.yaml -f compose.build.yaml build mermaid-editor` — builds the custom image locally for development.
- `sudo docker compose -f compose.yaml -f compose.build.yaml build portal` — builds the portal locally for development.
- `bash scripts/healthcheck.sh` — checks HTTP endpoints and Kroki Mermaid SVG rendering.
- `bash scripts/backup-config.sh` — archives configuration, including `.env`; excludes Portainer volume data.
- `bash scripts/update.sh` — updates images after confirmation; choose Mermaid's version with `MERMAID_IMAGE`.

Changing `BIND_IP`, `KROKI_PORT`, or `KROKI_URL` requires container recreation, not image rebuilding. Preserve runtime configuration loading and disabled public renderers.

## Coding Style & Naming Conventions

Use two-space indentation in YAML and Bash blocks. Preserve Bash shebangs, `set -euo pipefail`, quoted variable expansions, and uppercase environment variables. Use descriptive kebab-case script names. Keep documentation in Russian, preserving numbered filenames, frontmatter, and Obsidian `[[links]]`. No formatter or lint pipeline is configured.

## Testing Guidelines

Run `npm ci` and `npm test` for Node's built-in runtime-config tests (requires jq). After building the image, run `npx playwright install chromium` and `npm run test:browser`; Playwright verifies real diagram rendering and two Kroki addresses with the same image. Check shell syntax and validate Compose. No coverage threshold is configured. Run the stack health check on Ubuntu for deployed services.

For the portal, run `npm run test:portal`, build the image, then run `npm run test:portal:browser`. These checks cover runtime links, safe configuration, optional Portainer, search, themes, mobile layout, and local-only asset loading. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` may select an existing Chromium installation.

## Commit & Pull Request Guidelines

Use short imperative commit subjects, optionally scoped, such as `docs: clarify Kroki setup`. Describe the change, link applicable issues, report validation, and include screenshots for visible UI/documentation changes. Update related notes alongside configuration changes.

## Security & Agent Instructions

Keep `.env`, backups, and secrets untracked. Preserve local rendering, sandbox settings, and LAN/VPN access restrictions. Before editing, inspect relevant instructions, implementation, dependencies, and tests; reread truncated output and restore context from original files after compaction.
