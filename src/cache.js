// localStorage persistence for the loaded feed.

const CACHE_KEY = "yt_feed_cache";

export function cacheFeed(videos) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(videos)); } catch (e) {}
}

export function loadCachedFeed() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
