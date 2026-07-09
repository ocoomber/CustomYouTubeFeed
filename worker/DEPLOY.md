# Deploy the YouTube API Proxy Worker

This Cloudflare Worker hides your YouTube API key from the public repo.

## One-time setup

1. Install wrangler CLI: `npm install -g wrangler`
2. Log in: `wrangler login`
3. Create the worker: `wrangler deploy` (from this `worker/` directory)
4. Set the API key as a secret:
   ```
   wrangler secret put YT_API_KEY
   ```
   Paste your YouTube Data API key when prompted.
5. Copy the worker URL (shown after deploy, like `https://youtube-proxy.YOUR_SUBDOMAIN.workers.dev`)
6. Update `PROXY_URL` in `../config.js` with that URL

## Redeploy after changes

```
wrangler deploy
```

## Rotate the API key

If the key was exposed:
1. Go to https://console.cloud.google.com/apis/credentials
2. Delete the old API key
3. Create a new one, restrict it to your worker's domain
4. Run `wrangler secret put YT_API_KEY` again with the new key
