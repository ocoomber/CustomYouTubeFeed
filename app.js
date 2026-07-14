const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const gridEl = document.getElementById("grid");
const signinBtn = document.getElementById("signin");
const refreshBtn = document.getElementById("refresh");
const themeBtn = document.getElementById("theme-toggle");
const sidebarList = document.getElementById("sidebar-list");
const sidebarSearch = document.getElementById("sidebar-search-input");

let accessToken = null;
let daysBack = CONFIG.DAYS_BACK;
let activeChannel = null;
let allLoadedVideos = [];
let allVideoDetails = {};
let channelAvatars = {};

function openGemini(videoUrl) {
  window.open(`https://gemini.google.com/app?q=${encodeURIComponent(videoUrl)}`);
}

function log(msg) { logEl.textContent = msg; }
function setStatus(msg) { statusEl.textContent = msg ? `— ${msg}` : ""; }

// ---- Theme ----

function applyTheme(theme) {
  document.body.classList.toggle("light", theme === "light");
  themeBtn.textContent = theme === "light" ? "☾" : "☀";
  localStorage.setItem("yt_feed_theme", theme);
}

themeBtn.addEventListener("click", () => {
  const next = document.body.classList.contains("light") ? "dark" : "light";
  applyTheme(next);
});

// ---- Date range ----

document.querySelectorAll(".range-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelector(".range-btn.active")?.classList.remove("active");
    btn.classList.add("active");
    daysBack = Number(btn.dataset.days);
    localStorage.setItem("yt_feed_days", daysBack);
    loadFeed();
  });
});

// ---- OAuth ----

const REDIRECT_URI = (location.origin + location.pathname.replace(/index\.html$/, "")).replace(/\/$/, "") + "/";

async function exchangeCodeForTokens(code) {
  const res = await fetch(`${CONFIG.PROXY_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
  });
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${CONFIG.PROXY_URL}/oauth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return res.json();
}

function setAuthState(token, refreshToken) {
  accessToken = token;
  localStorage.setItem("yt_feed_token", accessToken);
  if (refreshToken) localStorage.setItem("yt_feed_refresh_token", refreshToken);
  setStatus("signed in");
  refreshBtn.disabled = false;
}

function clearAuthState() {
  accessToken = null;
  localStorage.removeItem("yt_feed_token");
  localStorage.removeItem("yt_feed_refresh_token");
  setStatus("");
  refreshBtn.disabled = true;
}

window.addEventListener("load", async () => {
  // Restore theme
  applyTheme(localStorage.getItem("yt_feed_theme") || "dark");

  // Restore days
  const savedDays = localStorage.getItem("yt_feed_days");
  if (savedDays && !isNaN(Number(savedDays))) daysBack = Number(savedDays);
  document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(`.range-btn[data-days="${daysBack}"]`)?.classList.add("active");

  // Check if returning from OAuth redirect
  const urlParams = new URLSearchParams(window.location.search);
  const authCode = urlParams.get("code");
  if (authCode) {
    // Clean URL
    window.history.replaceState({}, document.title, REDIRECT_URI);
    log("Completing sign-in…");
    try {
      const tokens = await exchangeCodeForTokens(authCode);
      if (tokens.access_token) {
        setAuthState(tokens.access_token, tokens.refresh_token);
        loadFeed();
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
  const savedRefresh = localStorage.getItem("yt_feed_refresh_token");
  if (savedRefresh) {
    log("Refreshing session…");
    try {
      const tokens = await refreshAccessToken(savedRefresh);
      if (tokens.access_token) {
        setAuthState(tokens.access_token, tokens.refresh_token || savedRefresh);
        loadFeed();
        return;
      }
    } catch (e) {
      console.error("Token refresh failed:", e);
    }
    // Refresh failed — clear and require manual sign-in
    clearAuthState();
    return;
  }

  // No refresh token — user needs to sign in
  const saved = localStorage.getItem("yt_feed_token");
  if (saved) {
    // Legacy token without refresh — clear it
    clearAuthState();
  }
});

signinBtn.addEventListener("click", () => {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", CONFIG.CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.readonly");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  window.location.href = authUrl.toString();
});

refreshBtn.addEventListener("click", loadFeed);

// ---- Sidebar search ----

sidebarSearch.addEventListener("input", () => {
  const q = sidebarSearch.value.toLowerCase();
  sidebarList.querySelectorAll(".sidebar-item").forEach(item => {
    const name = item.dataset.name.toLowerCase();
    item.style.display = name.includes(q) ? "" : "none";
  });
});

// ---- YouTube Data API helpers ----

const API_BASE = CONFIG.PROXY_URL + "/youtube";

async function apiGet(path, params, retries = 2) {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    if (retries > 0 && (res.status === 429 || res.status >= 500)) {
      await new Promise(r => setTimeout(r, 1000));
      return apiGet(path, params, retries - 1);
    }
    const body = await res.text();
    if (res.status === 401) {
      clearAuthState();
      log("Session expired — please sign in again.");
    }
    throw new Error(`${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function getAllSubscriptions() {
  let channels = [];
  let pageToken = "";
  do {
    const data = await apiGet("subscriptions", {
      part: "snippet",
      mine: "true",
      maxResults: "50",
      pageToken
    });
    channels.push(...data.items.map(i => ({
      id: i.snippet.resourceId.channelId,
      title: i.snippet.title
    })));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return channels;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getUploadsPlaylistIds(channels) {
  const map = {};
  for (const group of chunk(channels, 50)) {
    const data = await apiGet("channels", {
      part: "contentDetails,snippet",
      id: group.map(c => c.id).join(",")
    });
    for (const item of data.items) {
      map[item.id] = item.contentDetails.relatedPlaylists.uploads;
      channelAvatars[item.id] = item.snippet.thumbnails?.default?.url || "";
    }
  }
  return map;
}

async function getRecentVideosForPlaylist(playlistId) {
  const data = await apiGet("playlistItems", {
    part: "snippet,contentDetails",
    playlistId,
    maxResults: String(CONFIG.VIDEOS_PER_CHANNEL)
  });
  return data.items.map(i => ({
    videoId: i.contentDetails.videoId,
    title: i.snippet.title,
    channelTitle: i.snippet.channelTitle,
    channelId: i.snippet.channelId,
    publishedAt: i.contentDetails.videoPublishedAt || i.snippet.publishedAt,
    thumbnail: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url
  }));
}

function parseIsoDuration(iso) {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const d = parseInt(m[1] || "0", 10);
  const h = parseInt(m[2] || "0", 10);
  const min = parseInt(m[3] || "0", 10);
  const s = parseInt(m[4] || "0", 10);
  return d * 86400 + h * 3600 + min * 60 + s;
}

async function getDurations(videoIds) {
  const details = {};
  for (const group of chunk(videoIds, 50)) {
    const data = await apiGet("videos", {
      part: "contentDetails,snippet",
      id: group.join(",")
    });
    for (const item of data.items) {
      details[item.id] = {
        duration: parseIsoDuration(item.contentDetails.duration),
        description: item.snippet.description || ""
      };
    }
  }
  return details;
}

// ---- Cache ----

function cacheFeed(videos) {
  try { localStorage.setItem("yt_feed_cache", JSON.stringify(videos)); } catch (e) {}
}

function loadCachedFeed() {
  try {
    const raw = localStorage.getItem("yt_feed_cache");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ---- Channel sidebar ----

function renderSidebar(videos) {
  const channelCounts = {};
  const channelIds = {};
  for (const v of videos) {
    const name = v.channelTitle;
    channelCounts[name] = (channelCounts[name] || 0) + 1;
    if (v.channelId) channelIds[name] = v.channelId;
  }
  const sorted = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]);

  sidebarList.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "sidebar-item" + (activeChannel ? "" : " active");
  allBtn.dataset.name = "all";
  allBtn.innerHTML = `<span class="sidebar-item-name">All videos</span><span class="sidebar-item-count">${videos.length}</span>`;
  allBtn.addEventListener("click", () => {
    activeChannel = null;
    renderCards(allLoadedVideos, allVideoDetails);
    renderSidebar(allLoadedVideos);
  });
  sidebarList.appendChild(allBtn);

  for (const [name, count] of sorted) {
    const id = channelIds[name] || "";
    const avatar = channelAvatars[id] || "";
    const btn = document.createElement("button");
    btn.className = "sidebar-item" + (activeChannel === name ? " active" : "");
    btn.dataset.name = name;
    btn.innerHTML = `
      ${avatar ? `<img class="sidebar-item-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy">` : `<div class="sidebar-item-avatar" style="background:var(--chip-bg);border-radius:50%;"></div>`}
      <span class="sidebar-item-name">${escapeHtml(name)}</span>
      <span class="sidebar-item-count">${count}</span>
    `;
    btn.addEventListener("click", () => {
      activeChannel = activeChannel === name ? null : name;
      renderCards(allLoadedVideos, allVideoDetails);
      renderSidebar(allLoadedVideos);
    });
    sidebarList.appendChild(btn);
  }

  const prevSearch = sidebarSearch.value;
  sidebarList.querySelectorAll(".sidebar-item").forEach(item => {
    const name = item.dataset.name.toLowerCase();
    item.style.display = name.includes(prevSearch.toLowerCase()) ? "" : "none";
  });
}

// ---- Main flow ----

let feedVersion = 0;

async function loadFeed() {
  if (!accessToken) return;
  const myVersion = ++feedVersion;
  gridEl.innerHTML = "";
  refreshBtn.disabled = true;
  activeChannel = null;

  const cached = loadCachedFeed();
  if (cached && cached.length) {
    log(`Showing ${cached.length} cached videos, refreshing…`);
    allLoadedVideos = cached;
    renderCards(cached);
    renderSidebar(cached);
  }

  try {
    log("Fetching subscriptions…");
    const channels = await getAllSubscriptions();

    log(`Fetching upload playlists for ${channels.length} channels…`);
    const uploadsMap = await getUploadsPlaylistIds(channels);

    log("Fetching recent uploads…");
    let allVideos = [];
    let renderedIds = new Set(cached ? cached.map(v => v.videoId) : []);
    const CONCURRENCY = 10;
    const channelBatches = chunk(channels, CONCURRENCY);
    let done = 0;
    for (const batch of channelBatches) {
      if (myVersion !== feedVersion) return;
      const results = await Promise.all(batch.map(async (channel) => {
        const playlistId = uploadsMap[channel.id];
        if (!playlistId) return [];
        try {
          return await getRecentVideosForPlaylist(playlistId);
        } catch (e) {
          console.warn("Skipping channel", channel.title, e);
          return [];
        }
      }));
      const cutoff = new Date(Date.now() - daysBack * 86400000);
      const newVideos = results.flat()
        .filter(v => new Date(v.publishedAt) >= cutoff && !renderedIds.has(v.videoId))
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      for (const v of newVideos) {
        renderedIds.add(v.videoId);
        appendCard(v);
      }
      allVideos.push(...results.flat());
      done += batch.length;
      log(`Fetching… (${done}/${channels.length} channels, ${renderedIds.size} videos)`);
    }

    if (myVersion !== feedVersion) return;

    log("Filtering out Shorts…");
    const dateCutoff = new Date(Date.now() - daysBack * 86400000);
    const dateFiltered = allVideos.filter(v => new Date(v.publishedAt) >= dateCutoff);
    const videoDetails = await getDurations(dateFiltered.map(v => v.videoId));
    const final = dateFiltered
      .filter(v => {
        const d = videoDetails[v.videoId];
        return d === undefined || d.duration > CONFIG.SHORTS_MAX_SECONDS;
      })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    log(`Loaded ${final.length} videos.`);
    allLoadedVideos = final;
    allVideoDetails = videoDetails;
    renderCards(final, videoDetails);
    renderSidebar(final);
    cacheFeed(final);
  } catch (e) {
    console.error(e);
    log("Error: " + e.message);
  } finally {
    if (myVersion === feedVersion) refreshBtn.disabled = false;
  }
}

function renderCards(videos, details) {
  gridEl.innerHTML = "";
  const filtered = activeChannel ? videos.filter(v => v.channelTitle === activeChannel) : videos;
  for (const v of filtered) appendCard(v, details);
}

function appendCard(v, details) {
  const d = details?.[v.videoId] || {};
  const avatar = channelAvatars[v.channelId] || "";
  const a = document.createElement("a");
  a.className = "card";
  a.href = `https://www.youtube.com/watch?v=${v.videoId}`;
  a.target = "_blank";
  a.rel = "noopener";
  const desc = d.description ? escapeHtml(d.description.slice(0, 150)) : "";
  const dur = d.duration ? formatDuration(d.duration) : "";
  a.innerHTML = `
    <div class="card-body">
      <div class="card-header">
        ${avatar ? `<img class="card-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy">` : ""}
        <p class="card-channel">${escapeHtml(v.channelTitle)}</p>
      </div>
      <p class="card-title">${escapeHtml(v.title)}</p>
      ${desc ? `<p class="card-desc">${desc}${d.description.length > 150 ? "…" : ""}</p>` : ""}
      <p class="card-meta">${timeAgo(v.publishedAt)}${dur ? " · " + dur : ""}</p>
      <button class="gemini-btn" title="Open in Gemini">✦</button>
    </div>
    <img class="card-thumb" src="${escapeHtml(v.thumbnail || "")}" loading="lazy" alt="">
  `;
  const geminiBtn = a.querySelector(".gemini-btn");
  geminiBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openGemini(`https://www.youtube.com/watch?v=${v.videoId}`);
  });
  gridEl.appendChild(a);
}

// ---- Formatting ----

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
