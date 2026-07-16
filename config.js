// Fill these in with your own values from Google Cloud Console.
// See SETUP.md for exact steps.

export const CONFIG = {
  CLIENT_ID: "460699246810-67ngl4qg7lb48nf2e7tr723384qmt080.apps.googleusercontent.com",

  // Cloudflare Worker URL that proxies YouTube API requests (hides API key)
  PROXY_URL: "https://youtube-proxy.ocoomber.workers.dev",

  // How many recent uploads to pull per channel before merging & sorting.
  // Higher = more complete but uses more of your daily quota.
  VIDEOS_PER_CHANNEL: 15,

  // Only show videos uploaded within this many days.
  DAYS_BACK: 7,

  // Skip anything this many seconds or shorter (filters out Shorts).
  SHORTS_MAX_SECONDS: 60
};
