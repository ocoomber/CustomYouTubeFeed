// Feed loading orchestration: subscriptions -> videos -> render/cache.

import { CONFIG } from "../config.js";
import { channelAvatars, getAllSubscriptions, getUploadsPlaylistIds, getRecentVideosForPlaylist, getDurations } from "./youtube-api.js";
import { cacheFeed, loadCachedFeed, loadSubscriptionsCache, saveSubscriptionsCache, loadVideoDetailsCache, saveVideoDetailsCache } from "./cache.js";
import { renderCards, renderSidebar, appendCard, updateCardDetails } from "./render.js";
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

  // Renders the cached feed (if any) so returning users see content even
  // before auth resolves or when signed out, instead of a blank page.
  function showCachedFeed() {
    const cached = loadCachedFeed();
    if (!cached || !cached.length) return false;
    allLoadedVideos = cached;
    allVideoDetails = loadVideoDetailsCache();
    renderCards(gridEl, cached, allVideoDetails, activeChannel);
    renderSidebar(sidebarList, sidebarSearch, cached, activeChannel, selectChannel);
    log(`Showing ${cached.length} cached videos — please sign in to refresh.`);
    return true;
  }

  async function loadFeed(forceFresh = false) {
    const accessToken = getAccessToken();
    if (!accessToken) {
      if (!showCachedFeed()) log("Please sign in to load your subscriptions feed.");
      return;
    }
    const myVersion = ++feedVersion;
    gridEl.innerHTML = "";
    refreshBtn.disabled = true;
    activeChannel = null;

    const cached = loadCachedFeed();
    const knownDetails = loadVideoDetailsCache();
    const subsTtlMs = (CONFIG.SUBSCRIPTIONS_TTL_HOURS || 24) * 3600000;
    const subsCached = forceFresh ? null : loadSubscriptionsCache(subsTtlMs);
    if (subsCached) Object.assign(channelAvatars, subsCached.avatars);
    if (cached && cached.length) {
      log(`Showing ${cached.length} cached videos, refreshing…`);
      allLoadedVideos = cached;
      allVideoDetails = knownDetails;
      renderCards(gridEl, cached, knownDetails, activeChannel);
      renderSidebar(sidebarList, sidebarSearch, cached, activeChannel, selectChannel);
    }

    try {
      let channels;
      let uploadsMap;
      if (subsCached) {
        channels = subsCached.channels;
        uploadsMap = subsCached.uploadsMap;
        log(`Using ${channels.length} cached channels, fetching uploads…`);
      } else {
        log("Fetching subscriptions…");
        channels = await getAllSubscriptions(accessToken, handleUnauthorized);
        if (myVersion !== feedVersion) return;
        log(`Fetching upload playlists for ${channels.length} channels…`);
        uploadsMap = await getUploadsPlaylistIds(channels, accessToken, handleUnauthorized);
        if (myVersion !== feedVersion) return;
        saveSubscriptionsCache(channels, uploadsMap, channelAvatars);
      }

      log("Fetching recent uploads…");
      let allVideos = [];
      let renderedIds = new Set(cached ? cached.map(v => v.videoId) : []);
      const CONCURRENCY = 15;
      const channelBatches = chunk(channels, CONCURRENCY);
      let done = 0;
      const cutoff = new Date(Date.now() - daysBack * 86400000);
      const pendingDetails = [];
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
          appendCard(gridEl, v, knownDetails);
        }
        allVideos.push(...results.flat());
        const unknownIds = [...new Set(newVideos.map(v => v.videoId).filter(id => !knownDetails[id]))];
        if (unknownIds.length) {
          pendingDetails.push(getDurations(unknownIds, accessToken, handleUnauthorized).then(details => {
            if (myVersion !== feedVersion) return;
            Object.assign(knownDetails, details);
            for (const v of newVideos) {
              if (details[v.videoId]) updateCardDetails(gridEl, v, knownDetails);
            }
          }).catch(e => console.warn("Background details failed", e)));
        }
        done += batch.length;
        log(`Fetching… (${done}/${channels.length} channels, ${renderedIds.size} videos)`);
      }

      if (myVersion !== feedVersion) return;
      if (pendingDetails.length) {
        log("Filling in video details…");
        await Promise.allSettled(pendingDetails);
        if (myVersion !== feedVersion) return;
      }

      log("Filtering out Shorts…");
      const dateFiltered = allVideos.filter(v => new Date(v.publishedAt) >= cutoff);
      const missingIds = [...new Set(dateFiltered.map(v => v.videoId).filter(id => !knownDetails[id]))];
      if (missingIds.length) {
        Object.assign(knownDetails, await getDurations(missingIds, accessToken, handleUnauthorized));
        if (myVersion !== feedVersion) return;
      }
      const final = dateFiltered
        .filter(v => {
          const d = knownDetails[v.videoId];
          return d === undefined || d.duration > CONFIG.SHORTS_MAX_SECONDS;
        })
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

      log(`Loaded ${final.length} videos.`);
      allLoadedVideos = final;
      allVideoDetails = { ...knownDetails };
      renderCards(gridEl, final, knownDetails, activeChannel);
      renderSidebar(sidebarList, sidebarSearch, final, activeChannel, selectChannel);
      cacheFeed(final);
      saveVideoDetailsCache(knownDetails, final.map(v => v.videoId));
    } catch (e) {
      console.error(e);
      log("Error: " + e.message);
    } finally {
      if (myVersion === feedVersion) refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", () => { loadFeed(true); });

  // Show cached content immediately so a returning user with an expired or
  // missing session sees videos + a sign-in prompt instead of a blank page.
  if (!showCachedFeed()) log("Please sign in to load your subscriptions feed.");

  return { loadFeed };
}
