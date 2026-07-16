// All calls to the YouTube Data API (via the Cloudflare Worker proxy).

import { CONFIG } from "../config.js";
import { chunk, parseIsoDuration } from "./format.js";

const API_BASE = CONFIG.PROXY_URL + "/youtube";

// channelAvatars is populated as a side effect of getUploadsPlaylistIds, since
// avatar URLs come back on the same /channels response as the playlist IDs.
export const channelAvatars = {};

export async function apiGet(path, params, accessToken, onUnauthorized, retries = 2) {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    if (retries > 0 && (res.status === 429 || res.status >= 500)) {
      await new Promise(r => setTimeout(r, 1000));
      return apiGet(path, params, accessToken, onUnauthorized, retries - 1);
    }
    const body = await res.text();
    if (res.status === 401) onUnauthorized?.();
    throw new Error(`${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

export async function getAllSubscriptions(accessToken, onUnauthorized) {
  let channels = [];
  let pageToken = "";
  do {
    const data = await apiGet("subscriptions", {
      part: "snippet",
      mine: "true",
      maxResults: "50",
      pageToken
    }, accessToken, onUnauthorized);
    channels.push(...data.items.map(i => ({
      id: i.snippet.resourceId.channelId,
      title: i.snippet.title
    })));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return channels;
}

export async function getUploadsPlaylistIds(channels, accessToken, onUnauthorized) {
  const map = {};
  for (const group of chunk(channels, 50)) {
    const data = await apiGet("channels", {
      part: "contentDetails,snippet",
      id: group.map(c => c.id).join(",")
    }, accessToken, onUnauthorized);
    for (const item of data.items) {
      map[item.id] = item.contentDetails.relatedPlaylists.uploads;
      channelAvatars[item.id] = item.snippet.thumbnails?.default?.url || "";
    }
  }
  return map;
}

export async function getRecentVideosForPlaylist(playlistId, accessToken, onUnauthorized) {
  const data = await apiGet("playlistItems", {
    part: "snippet,contentDetails",
    playlistId,
    maxResults: String(CONFIG.VIDEOS_PER_CHANNEL)
  }, accessToken, onUnauthorized);
  return data.items.map(i => ({
    videoId: i.contentDetails.videoId,
    title: i.snippet.title,
    channelTitle: i.snippet.channelTitle,
    channelId: i.snippet.channelId,
    publishedAt: i.contentDetails.videoPublishedAt || i.snippet.publishedAt,
    thumbnail: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url
  }));
}

export async function getDurations(videoIds, accessToken, onUnauthorized) {
  const details = {};
  for (const group of chunk(videoIds, 50)) {
    const data = await apiGet("videos", {
      part: "contentDetails,snippet",
      id: group.join(",")
    }, accessToken, onUnauthorized);
    for (const item of data.items) {
      details[item.id] = {
        duration: parseIsoDuration(item.contentDetails.duration),
        description: item.snippet.description || ""
      };
    }
  }
  return details;
}
