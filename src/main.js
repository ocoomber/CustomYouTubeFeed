// Entry point: grabs DOM refs and wires the session/feed/theme modules together.

import { applyTheme, getSavedTheme, wireThemeToggle } from "./theme.js";
import { initSession } from "./session.js";
import { initFeedUI, getDaysBack, setDaysBack } from "./feed.js";

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const gridEl = document.getElementById("grid");
const signinBtn = document.getElementById("signin");
const refreshBtn = document.getElementById("refresh");
const themeBtn = document.getElementById("theme-toggle");
const sidebarList = document.getElementById("sidebar-list");
const sidebarSearch = document.getElementById("sidebar-search-input");

function log(msg) { logEl.textContent = msg; }
function setStatus(msg) { statusEl.textContent = msg ? `— ${msg}` : ""; }

wireThemeToggle(themeBtn);

// session and feed each need a callback the other provides (session triggers
// the first feed load once authenticated; feed reacts to a 401 from session).
// Forward through a small indirection so neither has to wait on the other.
let handleUnauthorized = () => {};
const { loadFeed } = initFeedUI({
  gridEl, sidebarList, sidebarSearch, refreshBtn, log,
  handleUnauthorized: (...args) => handleUnauthorized(...args)
});
const session = initSession({ signinBtn, refreshBtn, setStatus, log, onAuthenticated: loadFeed });
handleUnauthorized = session.handleUnauthorized;

document.querySelectorAll(".range-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelector(".range-btn.active")?.classList.remove("active");
    btn.classList.add("active");
    const days = Number(btn.dataset.days);
    setDaysBack(days);
    localStorage.setItem("yt_feed_days", days);
    loadFeed();
  });
});

sidebarSearch.addEventListener("input", () => {
  const q = sidebarSearch.value.toLowerCase();
  sidebarList.querySelectorAll(".sidebar-item").forEach(item => {
    const name = item.dataset.name.toLowerCase();
    item.style.display = name.includes(q) ? "" : "none";
  });
});

window.addEventListener("load", () => {
  applyTheme(getSavedTheme(), themeBtn);

  const savedDays = localStorage.getItem("yt_feed_days");
  if (savedDays && !isNaN(Number(savedDays))) setDaysBack(Number(savedDays));
  document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(`.range-btn[data-days="${getDaysBack()}"]`)?.classList.add("active");
});
