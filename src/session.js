// Session lifecycle: sign-in button, OAuth redirect/refresh bootstrap on load, token state.

import {
  REDIRECT_URI, buildSignInUrl, exchangeCodeForTokens, refreshAccessToken,
  getSavedRefreshToken, getSavedAccessToken, saveAuthState, clearAuthState as clearStoredAuth
} from "./auth.js";

let accessToken = null;

export function getAccessToken() {
  return accessToken;
}

// onAuthenticated is called once a valid access token is available (fresh
// sign-in or silent refresh) so the caller can trigger its first feed load.
export function initSession({ signinBtn, refreshBtn, setStatus, log, onAuthenticated }) {
  function setAuthState(token, refreshToken) {
    accessToken = token;
    saveAuthState(token, refreshToken);
    setStatus("signed in");
    refreshBtn.disabled = false;
  }

  function clearAuthState() {
    accessToken = null;
    clearStoredAuth();
    setStatus("");
    refreshBtn.disabled = true;
  }

  function handleUnauthorized() {
    clearAuthState();
    log("Session expired — please sign in again.");
  }

  signinBtn.addEventListener("click", () => {
    window.location.href = buildSignInUrl();
  });

  window.addEventListener("load", async () => {
    // Returning from the OAuth redirect?
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get("code");
    if (authCode) {
      window.history.replaceState({}, document.title, REDIRECT_URI);
      log("Completing sign-in…");
      try {
        const tokens = await exchangeCodeForTokens(authCode);
        if (tokens.access_token) {
          setAuthState(tokens.access_token, tokens.refresh_token);
          onAuthenticated();
          return;
        }
        log("Sign-in failed: " + (tokens.error_description || tokens.error || "unknown error"));
      } catch (e) {
        console.error("Token exchange failed:", e);
        log("Sign-in failed — network error.");
      }
      return;
    }

    // Try refresh token first (silent, no popup)
    const savedRefresh = getSavedRefreshToken();
    if (savedRefresh) {
      log("Refreshing session…");
      try {
        const tokens = await refreshAccessToken(savedRefresh);
        if (tokens.access_token) {
          setAuthState(tokens.access_token, tokens.refresh_token || savedRefresh);
          onAuthenticated();
          return;
        }
      } catch (e) {
        console.error("Token refresh failed:", e);
      }
      clearAuthState();
      return;
    }

    // No refresh token — user needs to sign in
    if (getSavedAccessToken()) {
      // Legacy token without refresh — clear it
      clearAuthState();
    }
  });

  return { handleUnauthorized };
}
