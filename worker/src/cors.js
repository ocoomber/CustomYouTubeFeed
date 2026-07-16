// Origin allowlist and shared CORS headers for the youtube-proxy worker.

export const ALLOWED_ORIGINS = ["https://ocoomber.github.io"];

export function isAllowedOrigin(origin) {
  try {
    const u = new URL(origin);
    return ALLOWED_ORIGINS.some(o => new URL(o).hostname === u.hostname);
  } catch { return false; }
}

export function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
    ...extra,
  };
}
