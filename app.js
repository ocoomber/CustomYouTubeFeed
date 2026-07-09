const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const gridEl = document.getElementById("grid");
const chipsEl = document.getElementById("chips");
const signinBtn = document.getElementById("signin");
const refreshBtn = document.getElementById("refresh");
const themeBtn = document.getElementById("theme-toggle");
const sidebarEl = document.getElementById("sidebar");
const sidebarList = document.getElementById("sidebar-list");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarClose = document.getElementById("sidebar-close");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const sidebarSearch = document.getElementById("sidebar-search-input");

let tokenClient;
let accessToken = null;
let daysBack = 7;
let activeChannel = null;
let allLoadedVideos = [];
let allVideoDetails = {};
let channelAvatars = {};

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

window.addEventListener("load", () => {
  // Restore theme
  applyTheme(localStorage.getItem("yt_feed_theme") || "dark");

  // Restore days
  const savedDays = localStorage.getItem("yt_feed_days");
  if (savedDays) {
    daysBack = Number(savedDays);
    document.querySelector(`.range-btn[data-days="${daysBack}"]`)?.classList.add("active");
    document.querySelector(".range-btn.active")?.classList.remove("active");
    document.querySelector(`.range-btn[data-days="${daysBack}"]`)?.classList.add("active");
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    callback: (resp) => {
      if (resp.error) {
        log("Sign-in failed: " + resp.error);
        return;
      }
      accessToken = resp.access_token;
      localStorage.setItem("yt_feed_token", accessToken);
      setStatus("signed in");
      refreshBtn.disabled = false;
      loadFeed();
    }
  });

  const saved = localStorage.getItem("yt_feed_token");
  if (saved) {
    accessToken = saved;
    setStatus("signed in");
    refreshBtn.disabled = false;
    loadFeed();
  }
});

signinBtn.addEventListener("click", () => {
  tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
});

refreshBtn.addEventListener("click", loadFeed);

// ---- Sidebar ----

function openSidebar() { sidebarEl.classList.add("open"); }
function closeSidebar() { sidebarEl.classList.remove("open"); }

sidebarToggle.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

sidebarSearch.addEventListener("input", () => {
  const q = sidebarSearch.value.toLowerCase();
  sidebarList.querySelectorAll(".sidebar-item").forEach(item => {
    const name = item.dataset.name.toLowerCase();
    item.style.display = name.includes(q) ? "" : "none";
  });
});

// ---- YouTube Data API helpers ----

const API_BASE = "https://www.googleapis.com/youtube/v3";

async function apiGet(path, params) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("key", CONFIG.API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      localStorage.removeItem("yt_feed_token");
      accessToken = null;
      setStatus("");
      refreshBtn.disabled = true;
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
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + min * 60 + s;
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
    closeSidebar();
  });
  sidebarList.appendChild(allBtn);

  for (const [name, count] of sorted) {
    const id = channelIds[name] || "";
    const avatar = channelAvatars[id] || "";
    const btn = document.createElement("button");
    btn.className = "sidebar-item" + (activeChannel === name ? " active" : "");
    btn.dataset.name = name;
    btn.innerHTML = `
      ${avatar ? `<img class="sidebar-item-avatar" src="${avatar}" alt="" loading="lazy">` : `<div class="sidebar-item-avatar" style="background:var(--chip-bg);border-radius:50%;"></div>`}
      <span class="sidebar-item-name">${escapeHtml(name)}</span>
      <span class="sidebar-item-count">${count}</span>
    `;
    btn.addEventListener("click", () => {
      activeChannel = activeChannel === name ? null : name;
      renderCards(allLoadedVideos, allVideoDetails);
      renderSidebar(allLoadedVideos);
      closeSidebar();
    });
    sidebarList.appendChild(btn);
  }

  sidebarSearch.value = "";
  sidebarList.querySelectorAll(".sidebar-item").forEach(item => {
    item.style.display = "";
  });
}

// ---- Main flow ----

let feedVersion = 0;

async function loadFeed() {
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
    let renderedIds = new Set();
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
        ${avatar ? `<img class="card-avatar" src="${avatar}" alt="" loading="lazy">` : ""}
        <p class="card-channel">${escapeHtml(v.channelTitle)}</p>
      </div>
      <p class="card-title">${escapeHtml(v.title)}</p>
      ${desc ? `<p class="card-desc">${desc}${d.description.length > 150 ? "…" : ""}</p>` : ""}
      <p class="card-meta">${timeAgo(v.publishedAt)}${dur ? " · " + dur : ""}</p>
    </div>
    <img class="card-thumb" src="${v.thumbnail}" loading="lazy" alt="">
  `;
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
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
