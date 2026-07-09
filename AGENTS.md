# AGENTS.md

## What this is

Static site (HTML + JS, no build step) that shows a YouTube subscriptions feed. Deployed via GitHub Pages from `main` branch root.

## Structure

- `index.html` — entry point, loads Google Identity Services SDK, then `config.js` and `app.js`
- `config.js` — Google OAuth Client ID and YouTube Data API key (live credentials, do not commit new ones)
- `app.js` — all application logic: OAuth flow, YouTube Data API calls, rendering

## Running locally

No build or install needed. Serve the directory with any static file server:

```
python -m http.server 8000
```

Then open `http://localhost:8000`. Google OAuth requires serving from a real origin (not `file://`).

## Important caveats

- **No lint, test, typecheck, or formatter** exists in this repo.
- `config.js` contains live Google API credentials. Treat it carefully — the API key is restricted by domain in Google Cloud Console.
- The repo is public; `config.js` is visible to anyone. The API key's domain restriction is the security boundary.
- YouTube Data API has daily quota limits. Increasing `VIDEOS_PER_CHANNEL` in `config.js` consumes more quota per load.
