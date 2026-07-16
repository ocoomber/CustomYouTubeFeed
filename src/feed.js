// Feed loading orchestration: subscriptions -> videos -> render/cache.

import { CONFIG } from "../config.js";
import { getAllSubscriptions, getUploadsPlaylistIds, getRecentVideosForPlaylist, getDurations } from "./youtube-api.js";
import { cacheFeed, loadCachedFeed } from "./cache.js";
import { renderCards, renderSidebar, appendCard } from "./render.js";
import { chunk } from "./format.js";
import { getAccessToken } from "./session.js";

let daysBack = CONFIG.DAYS_BACK;
let activeChannel = null;
let allLoadedVideos = [];
let allVideoDetails = {};
let feedVersion = 0;

export function getDaysBack() { return daysBack; }
export function setDaysBack(days) { daysBack = days; }

export function initFeedUI({ gridEl, sidebarList, sidebarSearch, refreshBtn, log, handleUnauthorized }) {
  function selectChannel(name) {
    activeChannel = name === null ? null : (activeChannel === name ? null : name);
    renderCards(gridEl, allLoadedVideos, allVideoDetails, activeChannel);
    renderSidebar(sidebarList, sidebarSearch, allLoadedVideos, activeChannel, selectChannel);
  }

  async function loadFeed() {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    const myVersion = ++feedVersion;
    gridEl.innerHTML = "";
    refreshBtn.disabled = true;
    activeChannel = null;

    const cached = loadCachedFeed();
    if (cached && cached.length) {
      log(`Showing ${cached.length} cached videos, refreshing…`);
      allLoadedVideos = cached;
      renderCards(gridEl, cached, undefined, activeChannel);
      renderSidebar(sidebarList, sidebarSearch, cached, activeChannel, selectChannel);
    }

    try {
      log("Fetching subscriptions…");
      const channels = await getAllSubscriptions(accessToken, handleUnauthorized);

      log(`Fetching upload playlists for ${channels.length} channels…`);
      const uploadsMap = await getUploadsPlaylistIds(channels, accessToken, handleUnauthorized);

      log("Fetching recent uploads…");
      let allVideos = [];
      let renderedIds = new Set(cached ? cached.map(v => v.videoId) : []);
      const CONCURRENCY = 10;
      const channelBatches = chunk(channels, CONCURRENCY);
      let done = 0;
      const cutoff = new Date(Date.now() - daysBack * 86400000);
      for (const batch of channelBatches) {
        if (myVersion !== feedVersion) return;
        const results = await Promise.all(batch.map(async (channel) => {
          const playlistId = uploadsMap[channel.id];
          if (!playlistId) return [];
          try {
            return await getRecentVideosForPlaylist(playlistId, accessToken, handleUnauthorized);
          } catch (e) {
            console.warn("Skipping channel", channel.title, e);
            return [];
          }
        }));
        const newVideos = results.flat()
          .filter(v => new Date(v.publishedAt) >= cutoff && !renderedIds.has(v.videoId))
          .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        for (const v of newVideos) {
          renderedIds.add(v.videoId);
          appendCard(gridEl, v);
        }
        allVideos.push(...results.flat());
        done += batch.length;
        log(`Fetching… (${done}/${channels.length} channels, ${renderedIds.size} videos)`);
      }

      if (myVersion !== feedVersion) return;

      log("Filtering out Shorts…");
      const dateFiltered = allVideos.filter(v => new Date(v.publishedAt) >= cutoff);
      const videoDetails = await getDurations(dateFiltered.map(v => v.videoId), accessToken, handleUnauthorized);
      const final = dateFiltered
        .filter(v => {
          const d = videoDetails[v.videoId];
          return d === undefined || d.duration > CONFIG.SHORTS_MAX_SECONDS;
        })
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

      log(`Loaded ${final.length} videos.`);
      allLoadedVideos = final;
      allVideoDetails = videoDetails;
      renderCards(gridEl, final, videoDetails, activeChannel);
      renderSidebar(sidebarList, sidebarSearch, final, activeChannel, selectChannel);
      cacheFeed(final);
    } catch (e) {
      console.error(e);
      log("Error: " + e.message);
    } finally {
      if (myVersion === feedVersion) refreshBtn.disabled = false;
    }
  }

  return { loadFeed };
}
