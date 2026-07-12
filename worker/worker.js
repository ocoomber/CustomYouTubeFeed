const ALLOWED_ORIGINS = ["https://ocoomber.github.io"];

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
          },
        });
      }

      // Validate Origin header — reject non-browser or wrong-origin clients
      const origin = request.headers.get("Origin") || "";
      if (origin && !ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
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

      // Build YouTube API URL
      const ytPath = url.pathname.replace(/^\/youtube\//, "");
      if (!ytPath || !/^[a-zA-Z0-9_.\/]+$/.test(ytPath)) {
        return new Response("Invalid path", { status: 400 });
      }
      const ytUrl = new URL(`https://www.googleapis.com/youtube/v3/${ytPath}`);
      for (const [k, v] of url.searchParams) {
        if (k !== "key") ytUrl.searchParams.set(k, v);
      }
      ytUrl.searchParams.set("key", env.YT_API_KEY);

      // Forward auth + fixed Referer for quota attribution
      const headers = new Headers();
      const auth = request.headers.get("Authorization");
      if (auth) headers.set("Authorization", auth);
      headers.set("Referer", "https://ocoomber.github.io/CustomYouTubeFeed/");

      const res = await fetch(ytUrl.toString(), {
        method: "GET",
        headers,
      });

      // Stream response, forward upstream Content-Type
      const ct = res.headers.get("Content-Type") || "application/json";
      return new Response(res.body, {
        status: res.status,
        headers: {
          "Content-Type": ct,
          "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
          "Vary": "Origin",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Proxy error" }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
        },
      });
    }
  },
};

async function handleTokenExchange(request, env) {
  const { code, redirect_uri } = await request.json();
  if (!code || !redirect_uri) {
    return new Response(JSON.stringify({ error: "Missing code or redirect_uri" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0] },
    });
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type: "authorization_code",
    }),
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
    },
  });
}

async function handleTokenRefresh(request, env) {
  const { refresh_token } = await request.json();
  if (!refresh_token) {
    return new Response(JSON.stringify({ error: "Missing refresh_token" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0] },
    });
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh_token,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
    },
  });
}
