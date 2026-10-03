---
name: Vite artifact build environment
description: Environment variables required when invoking the web artifact's Vite build outside its managed workflow.
---

The Dhruva/ASTALY Vite config requires both `PORT` and `BASE_PATH` even for a production build. The managed artifact workflow supplies them; a direct shell build must set values matching the artifact's service configuration.

**Why:** A build without these values fails while loading Vite config, before source compilation begins.

**How to apply:** For local verification, read `PORT` and `BASE_PATH` from the artifact TOML and set both in the command environment.