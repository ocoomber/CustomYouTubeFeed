// OAuth: authorization-code exchange, refresh, and token storage. No DOM here.

import { CONFIG } from "../config.js";

const TOKEN_KEY = "yt_feed_token";
const REFRESH_KEY = "yt_feed_refresh_token";

export const REDIRECT_URI = (location.origin + location.pathname.replace(/index\.html$/, "")).replace(/\/$/, "") + "/";

export function buildSignInUrl() {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", CONFIG.CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.readonly");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  return authUrl.toString();
}

export async function exchangeCodeForTokens(code) {
  const res = await fetch(`${CONFIG.PROXY_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
  });
  return res.json();
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${CONFIG.PROXY_URL}/oauth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return res.json();
}

export function getSavedRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getSavedAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveAuthState(token, refreshToken) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearAuthState() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
