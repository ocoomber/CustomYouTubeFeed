// Google OAuth token exchange and refresh endpoints.

import { corsHeaders } from "./cors.js";

export async function handleTokenExchange(request, env) {
  const { code, redirect_uri } = await request.json();
  if (!code || !redirect_uri) {
    return new Response(JSON.stringify({ error: "Missing code or redirect_uri" }), {
      status: 400,
      headers: corsHeaders({ "Content-Type": "application/json" }),
    });
  }

  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: corsHeaders({ "Content-Type": "application/json" }),
  });
}

export async function handleTokenRefresh(request, env) {
  const { refresh_token } = await request.json();
  if (!refresh_token) {
    return new Response(JSON.stringify({ error: "Missing refresh_token" }), {
      status: 400,
      headers: corsHeaders({ "Content-Type": "application/json" }),
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
    headers: corsHeaders({ "Content-Type": "application/json" }),
  });
}
