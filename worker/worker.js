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
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
          },
        });
      }

      // GET only
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }

      // Only proxy /youtube/ requests
      if (!url.pathname.startsWith("/youtube/")) {
        return new Response("Not found", { status: 404 });
      }

      // Build YouTube API URL
      const ytPath = url.pathname.replace(/^\/youtube\//, "");
      if (!ytPath) {
        return new Response("Missing API path", { status: 400 });
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
