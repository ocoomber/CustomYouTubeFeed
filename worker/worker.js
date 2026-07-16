// Entry point: routes requests to the OAuth or YouTube-proxy handlers.

import { isAllowedOrigin, corsHeaders } from "./src/cors.js";
import { handleTokenExchange, handleTokenRefresh } from "./src/oauth.js";
import { handleYoutubeProxy } from "./src/youtube-proxy.js";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: corsHeaders({
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
          }),
        });
      }

      // Validate Origin header — reject non-browser or wrong-origin clients
      const origin = request.headers.get("Origin") || "";
      if (origin && !isAllowedOrigin(origin)) {
        return new Response("Forbidden", { status: 403 });
      }

      // OAuth token exchange endpoint (POST only)
      if (url.pathname === "/oauth/token" && request.method === "POST") {
        return handleTokenExchange(request, env);
      }

      // OAuth refresh endpoint (POST only)
      if (url.pathname === "/oauth/refresh" && request.method === "POST") {
        return handleTokenRefresh(request, env);
      }

      // GET only for API proxy
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }

      // Only proxy /youtube/ requests
      if (!url.pathname.startsWith("/youtube/")) {
        return new Response("Not found", { status: 404 });
      }

      return handleYoutubeProxy(request, url, env);
    } catch (err) {
      return new Response(JSON.stringify({ error: "Proxy error" }), {
        status: 502,
        headers: corsHeaders({ "Content-Type": "application/json", "Vary": "Origin" }),
      });
    }
  },
};
