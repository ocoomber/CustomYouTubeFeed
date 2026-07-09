# AGENTS.md

## What this is

Static site (HTML + JS, no build step) that shows a YouTube subscriptions feed. Deployed via GitHub Pages from `main` branch root.

## Structure

- `index.html` — entry point, loads Google Identity Services SDK, then `config.js` and `app.js`
- `config.js` — Google OAuth Client ID and YouTube Data API key (live credentials, do not commit new ones)
- `app.js` — all application logic: OAuth flow, YouTube Data API calls, rendering

## Workflow

- **Auto-push to main**: After every change, commit and push directly to `main` for immediate testing on GitHub Pages. No PRs — this is a personal tool.

## Running locally

No build or install needed. Serve the directory with any static file server:

```
python -m http.server 8000
```

Then open `http://localhost:8000`. Google OAuth requires serving from a real origin (not `file://`).

## Features

- OAuth via Google Identity Services (token model, silent re-auth on reload)
- Feed shows subscriptions sorted by upload date with configurable time window (3/7/14/30 days)
- Shorts filtered out (configurable `SHORTS_MAX_SECONDS` in config.js)
- Persistent sidebar channel filter with search (position: fixed, aligned to wrapper)
- Light/dark theme toggle (persisted to localStorage)
- Feed cached in localStorage for instant load on reload
- Incremental rendering during load (cards append as channels are fetched)
- YouTube Home link in header

## Important caveats

- **No lint, test, typecheck, or formatter** exists in this repo.
- `config.js` contains live Google API credentials. Treat it carefully — the API key is restricted by domain in Google Cloud Console.
- The repo is public; `config.js` is visible to anyone. The API key's domain restriction is the security boundary.
- YouTube Data API has daily quota limits. Increasing `VIDEOS_PER_CHANNEL` in config.js consumes more quota per load.
- The sidebar is `position: fixed` with `left: max(16px, calc(50% - 570px))` to align with the wrapper. Grid has `margin-left: 284px` to avoid overlap.
- YouTube Data API does not expose the algorithmic home feed (recommended videos) — only subscriptions and own activity.
