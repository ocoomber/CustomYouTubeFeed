const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const gridEl = document.getElementById("grid");
const signinBtn = document.getElementById("signin");
const refreshBtn = document.getElementById("refresh");

let tokenClient;
let accessToken = null;

function log(msg) {
  logEl.textContent = msg;
}

function setStatus(msg) {
  statusEl.textContent = msg ? `— ${msg}` : "";
}

// ---- OAuth (Google Identity Services token model) ----

window.addEventListener("load", () => {
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

  // Restore token from last session
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
    // Token expired — clear it and prompt re-auth
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
      part: "contentDetails",
      id: group.map(c => c.id).join(",")
    });
    for (const item of data.items) {
      map[item.id] = item.contentDetails.relatedPlaylists.uploads;
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
    publishedAt: i.contentDetails.videoPublishedAt || i.snippet.publishedAt,
    thumbnail: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url
  }));
}

function parseIsoDuration(iso) {
  // e.g. PT1H2M10S -> seconds
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + min * 60 + s;
}

async function getDurations(videoIds) {
  const durations = {};
  for (const group of chunk(videoIds, 50)) {
    const data = await apiGet("videos", {
      part: "contentDetails",
      id: group.join(",")
    });
    for (const item of data.items) {
      durations[item.id] = parseIsoDuration(item.contentDetails.duration);
    }
  }
  return durations;
}

// ---- Main flow ----

async function loadFeed() {
  gridEl.innerHTML = "";
  refreshBtn.disabled = true;
  try {
    log("Fetching subscriptions…");
    const channels = await getAllSubscriptions();

    log(`Fetching upload playlists for ${channels.length} channels…`);
    const uploadsMap = await getUploadsPlaylistIds(channels);

    log("Fetching recent uploads…");
    let allVideos = [];
    const CONCURRENCY = 10; // simultaneous requests
    const channelBatches = chunk(channels, CONCURRENCY);
    let done = 0;
    for (const batch of channelBatches) {
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
      results.forEach(vids => allVideos.push(...vids));
      done += batch.length;
      log(`Fetching recent uploads… (${done}/${channels.length} channels)`);
    }

    log("Filtering by date…");
    const cutoff = new Date(Date.now() - CONFIG.DAYS_BACK * 86400000);
    allVideos = allVideos.filter(v => new Date(v.publishedAt) >= cutoff);

    log("Filtering out Shorts…");
    const durations = await getDurations(allVideos.map(v => v.videoId));
    allVideos = allVideos.filter(v => {
      const d = durations[v.videoId];
      return d === undefined || d > CONFIG.SHORTS_MAX_SECONDS;
    });

    allVideos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    log(`Loaded ${allVideos.length} videos from ${channels.length} channels.`);
    render(allVideos);
  } catch (e) {
    console.error(e);
    log("Error: " + e.message);
  } finally {
    refreshBtn.disabled = false;
  }
}

function render(videos) {
  gridEl.innerHTML = "";
  for (const v of videos) {
    const a = document.createElement("a");
    a.className = "card";
    a.href = `https://www.youtube.com/watch?v=${v.videoId}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = `
      <img src="${v.thumbnail}" loading="lazy" alt="">
      <div class="body">
        <p class="title">${escapeHtml(v.title)}</p>
        <p class="meta">${escapeHtml(v.channelTitle)} · ${formatDate(v.publishedAt)}</p>
      </div>
    `;
    gridEl.appendChild(a);
  }
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
