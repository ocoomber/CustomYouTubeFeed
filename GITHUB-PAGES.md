# Hosting on GitHub Pages

## 1. Create the repo

1. Go to https://github.com/new
2. Name it e.g. `yt-feed`
3. Set it to **Public** (required for free GitHub Pages)
4. Don't initialize with a README — leave it empty
5. Click **Create repository**

## 2. Upload the files

On the new repo's page, click **uploading an existing file** (or drag files onto the page), then drag in all four files from this folder:

- `index.html`
- `app.js`
- `config.js` (make sure this has YOUR real Client ID and API key in it — not the placeholders)
- `SETUP.md`

Commit directly to the `main` branch.

## 3. Turn on Pages

1. In the repo, go to **Settings → Pages**
2. Under "Build and deployment" → Source: **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)**
4. Save

It'll give you a URL like `https://<yourusername>.github.io/yt-feed/` — takes a minute or two to go live.

## 4. Update Google Cloud so sign-in works on the new URL

Go to https://console.cloud.google.com/apis/credentials, open your **Web application** OAuth client, and under **Authorized JavaScript origins** click **+ Add URI**, adding:

```
https://<yourusername>.github.io
```

(no trailing slash, no `/yt-feed` path — just the origin). Save. You can leave `http://localhost:8000` there too if you still want to test locally sometimes.

## 5. Restrict your API key to this domain

Still in Google Cloud Console, go to your API key (Credentials page → API Keys), and under **Application restrictions** choose **Websites**, then add:

```
https://<yourusername>.github.io/*
```

This matters because the repo is public — anyone could technically view `config.js` and see your key. Restricting it this way means the key only works when called from your page, so it's useless to anyone else even if they copy it.

## Done

Visit `https://<yourusername>.github.io/yt-feed/`, sign in, and it should work exactly like it did locally — just without needing to start a server first.
