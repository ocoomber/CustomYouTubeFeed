// DOM rendering only — takes data in, never fetches or mutates app state.

import { escapeHtml, timeAgo, formatDuration } from "./format.js";
import { channelAvatars } from "./youtube-api.js";

function openGemini(videoUrl) {
  window.open(`https://gemini.google.com/app?q=${encodeURIComponent(videoUrl)}`);
}

export function appendCard(gridEl, v, details) {
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

export function renderCards(gridEl, videos, details, activeChannel) {
  gridEl.innerHTML = "";
  const filtered = activeChannel ? videos.filter(v => v.channelTitle === activeChannel) : videos;
  for (const v of filtered) appendCard(gridEl, v, details);
}

export function renderSidebar(sidebarList, sidebarSearch, videos, activeChannel, onSelectChannel) {
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
  allBtn.addEventListener("click", () => onSelectChannel(null));
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
    btn.addEventListener("click", () => onSelectChannel(name));
    sidebarList.appendChild(btn);
  }

  const prevSearch = sidebarSearch.value;
  sidebarList.querySelectorAll(".sidebar-item").forEach(item => {
    const name = item.dataset.name.toLowerCase();
    item.style.display = name.includes(prevSearch.toLowerCase()) ? "" : "none";
  });
}
