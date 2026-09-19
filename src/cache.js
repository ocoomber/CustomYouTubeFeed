// localStorage persistence for the loaded feed, channel list, and video details.

const CACHE_KEY = "yt_feed_cache";
const SUBS_CACHE_KEY = "yt_subs_cache";
const DETAILS_CACHE_KEY = "yt_details_cache";

// Pure freshness check — no storage access.
export function isFresh(savedAt, ttlMs) {
  return typeof savedAt === "number" && Date.now() - savedAt < ttlMs;
}

export function cacheFeed(videos) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(videos)); } catch (e) {}
}

export function loadCachedFeed() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function saveSubscriptionsCache(channels, uploadsMap, avatars) {
  try {
    localStorage.setItem(SUBS_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      channels,
      uploadsMap,
      avatars
    }));
  } catch (e) {}
}

// Returns { channels, uploadsMap, avatars } or null when missing/stale/corrupt.
export function loadSubscriptionsCache(ttlMs) {
  try {
    const raw = localStorage.getItem(SUBS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !isFresh(parsed.savedAt, ttlMs)) return null;
    if (!Array.isArray(parsed.channels) || typeof parsed.uploadsMap !== "object") return null;
    return {
      channels: parsed.channels,
      uploadsMap: parsed.uploadsMap,
      avatars: parsed.avatars || {}
    };
  } catch (e) { return null; }
}

export function loadVideoDetailsCache() {
  try {
    const raw = localStorage.getItem(DETAILS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

// Prunes to keepIds so the cache does not grow without bound.
export function saveVideoDetailsCache(details, keepIds) {
  try {
    const keep = new Set(keepIds || Object.keys(details || {}));
    const pruned = {};
    for (const id of keep) {
      if (details[id]) pruned[id] = details[id];
    }
    localStorage.setItem(DETAILS_CACHE_KEY, JSON.stringify(pruned));
  } catch (e) {}
}
