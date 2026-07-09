export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }

    // Only proxy /youtube/ requests
    if (!url.pathname.startsWith("/youtube/")) {
      return new Response("Not found", { status: 404 });
    }

    // Build YouTube API URL
    const ytPath = url.pathname.replace("/youtube/", "");
    const ytUrl = new URL(`https://www.googleapis.com/youtube/v3/${ytPath}`);
    for (const [k, v] of url.searchParams) {
      ytUrl.searchParams.set(k, v);
    }
    ytUrl.searchParams.set("key", env.YT_API_KEY);

    // Forward the request
    const headers = new Headers();
    const auth = request.headers.get("Authorization");
    if (auth) headers.set("Authorization", auth);

    const res = await fetch(ytUrl.toString(), {
      method: request.method,
      headers,
    });

    // Return with CORS
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
