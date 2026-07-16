// Proxies GET /youtube/* requests to the YouTube Data API, injecting the
// server-side API key so it never reaches the client.

import { corsHeaders } from "./cors.js";

export async function handleYoutubeProxy(request, url, env) {
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
    headers: corsHeaders({ "Content-Type": ct, "Vary": "Origin" }),
  });
}
