const ICON_RAIL_WIDTH = "44px";
const PANEL_RAIL_WIDTH = "280px";
const HOST_ID = "tab-dock-root";
const HOVER_HIDE_MS = 50;

let state = {
  groups: [],
  pinnedApps: [],
  settings: {
    dockPosition: "right",
    dockVisible: true,
    pushContent: true,
    showEmptyPinned: true,
    dockMode: "icon",
    windowScope: "current",
  },
  activeTabId: null,
  requestWindowId: null,
  windowScope: "current",
};

let rootEl = null;
let iconsEl = null;
let flyoutsEl = null;
let panelGroupsEl = null;
let panelSearchEl = null;
let settingsEl = null;
let expandAllBtn = null;
let panelExpandAllBtn = null;
const flyoutCache = new Map();
const expandedGroupIds = new Set();
let hoverGroupId = null;
let stickyGroupId = null;
let settingsOpen = false;
let dragSourceId = null;
let hideHoverTimer = null;
let searchQuery = "";

init();

async function init() {
  if (window.top !== window.self) return;
  if (document.getElementById(HOST_ID)) return;

  buildShell();
  bindMessages();
  await refresh();
}

function isPanelMode() {
  return state.settings.dockMode === "panel";
}

function getRailWidth() {
  return isPanelMode() ? PANEL_RAIL_WIDTH : ICON_RAIL_WIDTH;
}

function buildShell() {
  rootEl = document.createElement("div");
  rootEl.id = HOST_ID;
  rootEl.innerHTML = `
    <aside class="td-rail" aria-label="Tab Dock">
      <div class="td-icon-view">
        <div class="td-top">
          <div class="td-brand" title="Tab Dock">TD</div>
          <button class="td-expand-all-btn" data-action="expand-all" title="Expand all groups" aria-label="Expand all groups">+</button>
        </div>
        <div class="td-divider"></div>
        <div class="td-icons"></div>
        <div class="td-divider"></div>
        <div class="td-footer">
          <button class="td-ghost-btn" data-action="settings" title="Dock settings" aria-label="Dock settings">⚙</button>
        </div>
      </div>
      <div class="td-panel-view">
        <div class="td-panel-header">
          <div class="td-panel-title">Tab Dock</div>
          <button class="td-expand-all-btn" data-action="expand-all-panel" title="Expand all groups" aria-label="Expand all groups">+</button>
        </div>
        <div class="td-panel-search-wrap">
          <input class="td-panel-search" type="search" placeholder="Search tabs…" autocomplete="off" />
        </div>
        <div class="td-panel-groups"></div>
        <div class="td-panel-footer">
          <button class="td-ghost-btn" data-action="settings-panel" title="Dock settings" aria-label="Dock settings">⚙</button>
        </div>
      </div>
    </aside>
    <div class="td-flyouts"></div>
    <div class="td-settings" hidden></div>
  `;
  document.documentElement.appendChild(rootEl);

  iconsEl = rootEl.querySelector(".td-icons");
  flyoutsEl = rootEl.querySelector(".td-flyouts");
  panelGroupsEl = rootEl.querySelector(".td-panel-groups");
  panelSearchEl = rootEl.querySelector(".td-panel-search");
  settingsEl = rootEl.querySelector(".td-settings");
  expandAllBtn = rootEl.querySelector('[data-action="expand-all"]');
  panelExpandAllBtn = rootEl.querySelector('[data-action="expand-all-panel"]');

  expandAllBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleExpandAll();
  });

  panelExpandAllBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleExpandAll();
  });

  const openSettings = (event) => {
    event.stopPropagation();
    settingsOpen = !settingsOpen;
    renderSettings();
    updateSettingsButton();
  };

  rootEl.querySelector('[data-action="settings"]').addEventListener("click", openSettings);
  rootEl.querySelector('[data-action="settings-panel"]').addEventListener("click", openSettings);

  panelSearchEl.addEventListener("input", () => {
    searchQuery = panelSearchEl.value;
    renderPanelGroups();
  });

  panelSearchEl.addEventListener("click", (event) => event.stopPropagation());

  flyoutsEl.addEventListener("mouseenter", cancelHideFlyout);
  flyoutsEl.addEventListener("mouseleave", scheduleHideFlyout);
  flyoutsEl.addEventListener("click", handleFlyoutClick);

  rootEl.querySelector(".td-icon-view")?.addEventListener("mouseleave", (event) => {
    if (!isPanelMode() && !flyoutsEl.contains(event.relatedTarget)) {
      scheduleHideFlyout();
    }
  });

  panelGroupsEl.addEventListener("click", handlePanelClick);

  document.addEventListener("click", (event) => {
    if (!rootEl.contains(event.target)) {
      settingsOpen = false;
      renderSettings();
      updateSettingsButton();
      collapseAllFlyouts();
    }
  });
}

function bindMessages() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATE_UPDATED") {
      applyState(message.state);
    }
  });
}

async function refresh() {
  const next = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (next) applyState(next);
}

function applyState(next) {
  const validIds = new Set(next.groups.map((g) => g.id));
  for (const id of expandedGroupIds) {
    if (!validIds.has(id)) expandedGroupIds.delete(id);
  }
  if (stickyGroupId && !validIds.has(stickyGroupId)) stickyGroupId = null;
  if (hoverGroupId && !validIds.has(hoverGroupId)) hoverGroupId = null;

  state = next;
  applyLayout();

  if (isPanelMode()) {
    renderPanelGroups();
  } else {
    rebuildFlyoutCache();
    renderIcons();
    syncFlyoutVisibility();
  }

  updateExpandAllButton();
  if (settingsOpen) renderSettings();
}

function applyLayout() {
  const { dockPosition, dockVisible, pushContent } = state.settings;

  rootEl.classList.toggle("td-hidden", !dockVisible);
  rootEl.classList.toggle("td-left", dockPosition === "left");
  rootEl.classList.toggle("td-right", dockPosition !== "left");
  rootEl.classList.toggle("td-mode-panel", isPanelMode());
  rootEl.classList.toggle("td-mode-icon", !isPanelMode());

  document.documentElement.style.setProperty("--tab-dock-width", getRailWidth());
  document.documentElement.classList.remove("tab-dock-push-left", "tab-dock-push-right");

  if (dockVisible && pushContent) {
    document.documentElement.classList.add(dockPosition === "left" ? "tab-dock-push-left" : "tab-dock-push-right");
  }
}

function getDisplayGroups() {
  if (!searchQuery.trim()) return state.groups;
  return filterGroups(state.groups, searchQuery);
}

function renderPanelGroups() {
  const groups = getDisplayGroups();
  panelGroupsEl.innerHTML = "";

  if (groups.length === 0) {
    panelGroupsEl.innerHTML = `<div class="td-empty-msg">${searchQuery ? "No matching tabs" : "No tabs"}</div>`;
    return;
  }

  for (const group of groups) {
    panelGroupsEl.appendChild(createPanelGroup(group));
  }
}

function createPanelGroup(group) {
  const isExpanded = expandedGroupIds.has(group.id);
  const pinned = state.pinnedApps.some((p) => p.id === group.id);
  const card = document.createElement("div");
  card.className = "td-panel-group" + (isExpanded ? " td-expanded" : "");
  card.dataset.groupId = group.id;

  const iconHtml = group.favIconUrl
    ? `<img src="${escapeAttr(group.favIconUrl)}" alt="">`
    : `<div class="td-fallback" style="background:${group.color}">${escapeHtml(group.label.charAt(0))}</div>`;

  const tabsHtml = isExpanded ? buildPanelTabsHtml(group) : "";

  card.innerHTML = `
    <div class="td-panel-group-header" data-panel-toggle="${group.id}">
      <div class="td-panel-group-icon">${iconHtml}</div>
      <div class="td-panel-group-meta">
        <div class="td-panel-group-name">${escapeHtml(group.label)}</div>
        <div class="td-panel-group-count">${group.tabCount} open tab${group.tabCount === 1 ? "" : "s"}</div>
      </div>
      ${group.tabCount > 0 ? `<span class="td-panel-badge">${group.tabCount}</span>` : ""}
      <button class="td-pin${pinned ? " td-on" : ""}" title="${pinned ? "Unpin" : "Pin position"}" data-pin-id="${group.id}">${pinned ? "★" : "☆"}</button>
      <span class="td-panel-chevron">›</span>
    </div>
    ${isExpanded ? `<div class="td-panel-tabs">${tabsHtml}</div>` : ""}
  `;

  return card;
}

function buildPanelTabsHtml(group) {
  if (group.tabs.length === 0) {
    const openBtn =
      group.openUrl
        ? `<button class="td-open-btn" data-open-url="${escapeAttr(group.openUrl)}">Open ${escapeHtml(group.label)}</button>`
        : `<div class="td-empty-msg">No open tabs</div>`;
    return openBtn;
  }

  return group.tabs
    .map((tab) => {
      const active = tab.id === state.activeTabId ? " td-current" : "";
      const fav = tab.favIconUrl ? `<img src="${escapeAttr(tab.favIconUrl)}" alt="">` : "";
      return `
        <div class="td-tab-row${active}" data-tab-id="${tab.id}">
          ${fav}
          <div class="td-tab-title">${escapeHtml(tab.title || tab.url || "Untitled")}</div>
        </div>
      `;
    })
    .join("");
}

async function handlePanelClick(event) {
  event.stopPropagation();

  const row = event.target.closest(".td-tab-row[data-tab-id]");
  if (row) {
    await chrome.runtime.sendMessage({ type: "ACTIVATE_TAB", tabId: Number(row.dataset.tabId) });
    return;
  }

  const pinBtn = event.target.closest(".td-pin");
  if (pinBtn) {
    event.stopPropagation();
    await togglePin(pinBtn.dataset.pinId);
    return;
  }

  const openBtn = event.target.closest(".td-open-btn");
  if (openBtn) {
    await chrome.runtime.sendMessage({ type: "OPEN_URL", url: openBtn.dataset.openUrl });
    return;
  }

  const header = event.target.closest("[data-panel-toggle]");
  if (header) {
    togglePanelGroup(header.dataset.panelToggle);
  }
}

function togglePanelGroup(groupId) {
  if (expandedGroupIds.has(groupId)) {
    expandedGroupIds.delete(groupId);
  } else {
    expandedGroupIds.clear();
    expandedGroupIds.add(groupId);
  }
  renderPanelGroups();
  updateExpandAllButton();
}

function rebuildFlyoutCache() {
  flyoutsEl.innerHTML = "";
  flyoutCache.clear();

  for (const group of state.groups) {
    const flyout = buildFlyoutElement(group);
    flyout.hidden = true;
    flyoutCache.set(group.id, flyout);
    flyoutsEl.appendChild(flyout);
  }
}

function renderIcons() {
  iconsEl.innerHTML = "";

  if (state.groups.length === 0) {
    iconsEl.innerHTML = `<div class="td-empty-msg" style="padding:8px 4px;font-size:10px;">No tabs</div>`;
    return;
  }

  for (const group of state.groups) {
    iconsEl.appendChild(createIconButton(group));
  }
}

function isGroupVisible(groupId) {
  return expandedGroupIds.has(groupId) || hoverGroupId === groupId || stickyGroupId === groupId;
}

function createIconButton(group) {
  const wrap = document.createElement("div");
  wrap.className = "td-icon-wrap";
  wrap.dataset.groupId = group.id;

  const visible = isGroupVisible(group.id);
  const hasActive = group.tabs.some((tab) => tab.id === state.activeTabId);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "td-icon-btn" +
    (group.pinned ? " td-pinned" : "") +
    (hasActive ? " td-active-group" : "") +
    (visible ? " td-expanded" : "");
  btn.title = group.label;
  btn.setAttribute("aria-expanded", String(visible));

  if (group.favIconUrl) {
    const img = document.createElement("img");
    img.src = group.favIconUrl;
    img.alt = "";
    btn.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "td-fallback";
    fallback.style.background = group.color;
    fallback.textContent = group.label.charAt(0);
    btn.appendChild(fallback);
  }

  if (group.pinned) {
    btn.draggable = true;
    btn.addEventListener("dragstart", (event) => {
      dragSourceId = group.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", group.id);
    });
    btn.addEventListener("dragend", () => {
      dragSourceId = null;
    });
    btn.addEventListener("dragover", (event) => {
      if (!dragSourceId || dragSourceId === group.id) return;
      event.preventDefault();
    });
    btn.addEventListener("drop", async (event) => {
      event.preventDefault();
      const sourceId = event.dataTransfer.getData("text/plain") || dragSourceId;
      if (!sourceId || sourceId === group.id) return;
      await reorderPinned(sourceId, group.id);
    });
  }

  wrap.addEventListener("mouseenter", () => {
    cancelHideFlyout();
    showFlyout(group.id, "hover");
  });

  wrap.addEventListener("mouseleave", (event) => {
    if (flyoutsEl.contains(event.relatedTarget)) return;
    scheduleHideFlyout();
  });

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleStickyGroup(group.id);
  });

  const badge = document.createElement("span");
  badge.className = "td-badge" + (group.tabCount === 0 ? " td-empty" : "");
  badge.textContent = String(group.tabCount);
  if (group.tabCount === 0) badge.style.display = "none";

  wrap.append(btn, badge);
  return wrap;
}

function buildFlyoutElement(group) {
  const flyout = document.createElement("div");
  flyout.className = "td-flyout";
  flyout.dataset.groupId = group.id;

  const pinned = state.pinnedApps.some((p) => p.id === group.id);
  const rows =
    group.tabs.length > 0
      ? group.tabs
          .map((tab) => {
            const active = tab.id === state.activeTabId ? " td-current" : "";
            const fav = tab.favIconUrl ? `<img src="${escapeAttr(tab.favIconUrl)}" alt="">` : "";
            return `
              <div class="td-tab-row${active}" data-tab-id="${tab.id}">
                ${fav}
                <div class="td-tab-title">${escapeHtml(tab.title || tab.url || "Untitled")}</div>
              </div>
            `;
          })
          .join("")
      : `<div class="td-empty-msg">No open tabs for ${escapeHtml(group.label)}</div>`;

  const openBtn =
    group.tabs.length === 0 && group.openUrl
      ? `<button class="td-open-btn" data-open-url="${escapeAttr(group.openUrl)}">Open ${escapeHtml(group.label)}</button>`
      : "";

  flyout.innerHTML = `
    <div class="td-flyout-header">
      <div class="td-flyout-icon" style="background:${group.color}22">
        ${group.favIconUrl ? `<img src="${escapeAttr(group.favIconUrl)}" alt="">` : `<span style="color:${group.color};font-weight:700;">${escapeHtml(group.label.charAt(0))}</span>`}
      </div>
      <div class="td-flyout-meta">
        <div class="td-flyout-title">${escapeHtml(group.label)}</div>
        <div class="td-flyout-sub">${group.tabCount} open tab${group.tabCount === 1 ? "" : "s"}${group.pinned ? " · Pinned" : ""}</div>
      </div>
      <button class="td-close" title="Collapse group" aria-label="Collapse group" data-close-id="${group.id}">−</button>
      <button class="td-pin${pinned ? " td-on" : ""}" title="${pinned ? "Unpin" : "Pin position"}" data-pin-id="${group.id}">
        ${pinned ? "★" : "☆"}
      </button>
    </div>
    <div class="td-tab-list">${rows}</div>
    ${openBtn}
  `;

  return flyout;
}

function showFlyout(groupId, reason = "hover") {
  if (isPanelMode()) return;
  cancelHideFlyout();

  if (reason === "hover") {
    hoverGroupId = groupId;
    if (expandedGroupIds.size === 0) {
      for (const id of flyoutCache.keys()) {
        if (id !== groupId) hideFlyoutElement(id);
      }
    }
  }

  const flyout = flyoutCache.get(groupId);
  const group = state.groups.find((g) => g.id === groupId);
  if (!flyout || !group) return;

  positionFlyout(flyout, groupId);
  updateFlyoutActiveState(flyout, group);
  flyout.hidden = false;
  flyout.classList.add("td-visible");
  updateIconStates();
}

function hideFlyoutElement(groupId) {
  const flyout = flyoutCache.get(groupId);
  if (!flyout) return;
  flyout.hidden = true;
  flyout.classList.remove("td-visible");
}

function syncFlyoutVisibility() {
  if (isPanelMode()) return;

  if (expandedGroupIds.size > 0) {
    for (const [id, flyout] of flyoutCache) {
      const show = expandedGroupIds.has(id);
      flyout.hidden = !show;
      flyout.classList.toggle("td-visible", show);
      if (show) positionFlyout(flyout, id);
    }
    updateIconStates();
    return;
  }

  if (stickyGroupId) {
    for (const [id, flyout] of flyoutCache) {
      const show = id === stickyGroupId;
      flyout.hidden = !show;
      flyout.classList.toggle("td-visible", show);
      if (show) {
        positionFlyout(flyout, id);
        const group = state.groups.find((g) => g.id === id);
        if (group) updateFlyoutActiveState(flyout, group);
      }
    }
    updateIconStates();
    return;
  }

  if (hoverGroupId) {
    showFlyout(hoverGroupId, "hover");
    return;
  }

  for (const flyout of flyoutCache.values()) {
    flyout.hidden = true;
    flyout.classList.remove("td-visible");
  }
  updateIconStates();
}

function positionFlyout(flyout, groupId) {
  const wrap = iconsEl.querySelector(`[data-group-id="${groupId}"]`);
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const flyoutHeight = Math.min(420, window.innerHeight - 24);
  const maxTop = Math.max(8, Math.min(rect.top, window.innerHeight - flyoutHeight - 8));
  flyout.style.top = `${maxTop}px`;
}

function updateFlyoutActiveState(flyout, group) {
  flyout.querySelectorAll(".td-tab-row[data-tab-id]").forEach((row) => {
    const tabId = Number(row.dataset.tabId);
    row.classList.toggle("td-current", tabId === state.activeTabId);
  });
}

function updateIconStates() {
  iconsEl.querySelectorAll(".td-icon-wrap").forEach((wrap) => {
    const groupId = wrap.dataset.groupId;
    const visible = isGroupVisible(groupId);
    const btn = wrap.querySelector(".td-icon-btn");
    if (btn) {
      btn.classList.toggle("td-expanded", visible);
      btn.setAttribute("aria-expanded", String(visible));
    }
  });
}

function cancelHideFlyout() {
  clearTimeout(hideHoverTimer);
}

function scheduleHideFlyout() {
  if (isPanelMode()) return;
  cancelHideFlyout();
  hideHoverTimer = setTimeout(() => {
    hoverGroupId = null;
    if (expandedGroupIds.size > 0 || stickyGroupId) {
      syncFlyoutVisibility();
      return;
    }
    for (const flyout of flyoutCache.values()) {
      flyout.hidden = true;
      flyout.classList.remove("td-visible");
    }
    updateIconStates();
  }, HOVER_HIDE_MS);
}

function collapseAllFlyouts() {
  expandedGroupIds.clear();
  stickyGroupId = null;
  hoverGroupId = null;
  cancelHideFlyout();
  if (isPanelMode()) {
    renderPanelGroups();
  } else {
    for (const flyout of flyoutCache.values()) {
      flyout.hidden = true;
      flyout.classList.remove("td-visible");
    }
    updateIconStates();
  }
  updateExpandAllButton();
}

function toggleStickyGroup(groupId) {
  if (stickyGroupId === groupId) {
    stickyGroupId = null;
    hoverGroupId = null;
  } else {
    stickyGroupId = groupId;
    hoverGroupId = groupId;
    expandedGroupIds.clear();
  }
  syncFlyoutVisibility();
  updateExpandAllButton();
}

function toggleExpandAll() {
  const groups = getDisplayGroups();
  const allExpanded = groups.length > 0 && groups.every((g) => expandedGroupIds.has(g.id));

  if (allExpanded) {
    collapseAllFlyouts();
    return;
  }

  stickyGroupId = null;
  hoverGroupId = null;
  expandedGroupIds.clear();
  for (const group of groups) {
    expandedGroupIds.add(group.id);
  }

  if (isPanelMode()) {
    renderPanelGroups();
  } else {
    syncFlyoutVisibility();
  }
  updateExpandAllButton();
}

function updateExpandAllButton() {
  const groups = getDisplayGroups();
  const buttons = [expandAllBtn, panelExpandAllBtn].filter(Boolean);
  if (buttons.length === 0 || groups.length === 0) return;

  const allExpanded = groups.every((g) => expandedGroupIds.has(g.id));
  const anyVisible = expandedGroupIds.size > 0 || stickyGroupId != null;

  for (const btn of buttons) {
    if (allExpanded || anyVisible) {
      btn.textContent = "−";
      btn.title = "Collapse all groups";
      btn.setAttribute("aria-label", "Collapse all groups");
      btn.classList.add("td-collapse-mode");
    } else {
      btn.textContent = "+";
      btn.title = "Expand all groups";
      btn.setAttribute("aria-label", "Expand all groups");
      btn.classList.remove("td-collapse-mode");
    }
  }
}

async function handleFlyoutClick(event) {
  event.stopPropagation();

  const row = event.target.closest(".td-tab-row[data-tab-id]");
  if (row) {
    await chrome.runtime.sendMessage({ type: "ACTIVATE_TAB", tabId: Number(row.dataset.tabId) });
    return;
  }

  const closeBtn = event.target.closest(".td-close");
  if (closeBtn) {
    const groupId = closeBtn.dataset.closeId;
    expandedGroupIds.delete(groupId);
    if (stickyGroupId === groupId) stickyGroupId = null;
    if (hoverGroupId === groupId) hoverGroupId = null;
    hideFlyoutElement(groupId);
    updateIconStates();
    updateExpandAllButton();
    return;
  }

  const pinBtn = event.target.closest(".td-pin");
  if (pinBtn) {
    await togglePin(pinBtn.dataset.pinId);
    return;
  }

  const openBtn = event.target.closest(".td-open-btn");
  if (openBtn) {
    await chrome.runtime.sendMessage({ type: "OPEN_URL", url: openBtn.dataset.openUrl });
  }
}

function renderSettings() {
  if (!settingsOpen) {
    settingsEl.hidden = true;
    return;
  }

  const s = state.settings;
  settingsEl.hidden = false;
  settingsEl.innerHTML = `
    <h3>Dock settings</h3>
    <div class="td-setting-row">
      <span>Layout</span>
      <div class="td-seg" data-setting="dockMode">
        <button class="${s.dockMode === "icon" ? "td-on" : ""}" data-value="icon">Icons</button>
        <button class="${s.dockMode === "panel" ? "td-on" : ""}" data-value="panel">Panel</button>
      </div>
    </div>
    <div class="td-setting-row">
      <span>Position</span>
      <div class="td-seg" data-setting="dockPosition">
        <button class="${s.dockPosition === "left" ? "td-on" : ""}" data-value="left">Left</button>
        <button class="${s.dockPosition === "right" ? "td-on" : ""}" data-value="right">Right</button>
      </div>
    </div>
    <div class="td-setting-row">
      <span>Window scope</span>
      <div class="td-seg" data-setting="windowScope">
        <button class="${s.windowScope === "current" ? "td-on" : ""}" data-value="current">This window</button>
        <button class="${s.windowScope === "all" ? "td-on" : ""}" data-value="all">All windows</button>
      </div>
    </div>
    <div class="td-setting-row">
      <button class="td-switch ${s.pushContent ? "td-on" : ""}" data-setting="pushContent" aria-label="Push page content"></button>
    </div>
    <div class="td-setting-row">
      <span>Show pinned when empty</span>
      <button class="td-switch ${s.showEmptyPinned ? "td-on" : ""}" data-setting="showEmptyPinned" aria-label="Show pinned when empty"></button>
    </div>
    <div class="td-setting-row">
      <span>Dock visible</span>
      <button class="td-switch ${s.dockVisible ? "td-on" : ""}" data-setting="dockVisible" aria-label="Dock visible"></button>
    </div>
  `;

  settingsEl.querySelectorAll("[data-setting]").forEach((el) => {
    const key = el.dataset.setting;
    if (el.classList.contains("td-seg")) {
      el.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await updateSetting(key, btn.dataset.value);
        });
      });
      return;
    }

    el.addEventListener("click", async () => {
      await updateSetting(key, !s[key]);
    });
  });
}

function updateSettingsButton() {
  rootEl.querySelectorAll('[data-action="settings"], [data-action="settings-panel"]').forEach((btn) => {
    btn.classList.toggle("td-open", settingsOpen);
  });
}

async function updateSetting(key, value) {
  const patch = { [key]: value };
  if (key === "dockMode") {
    collapseAllFlyouts();
    searchQuery = "";
    if (panelSearchEl) panelSearchEl.value = "";
  }
  await chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", patch });
  await refresh();
}

async function togglePin(appId) {
  let pinned = [...state.pinnedApps];
  const existing = pinned.find((p) => p.id === appId);
  if (existing) {
    pinned = pinned.filter((p) => p.id !== appId);
  } else {
    pinned.push({ id: appId, position: pinned.length });
  }
  pinned = pinned
    .sort((a, b) => a.position - b.position)
    .map((pin, index) => ({ ...pin, position: index }));
  await chrome.runtime.sendMessage({ type: "UPDATE_PINNED", pinnedApps: pinned });
  await refresh();
}

async function reorderPinned(sourceId, targetId) {
  const pinned = [...state.pinnedApps].sort((a, b) => a.position - b.position);
  const sourceIndex = pinned.findIndex((p) => p.id === sourceId);
  const targetIndex = pinned.findIndex((p) => p.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [moved] = pinned.splice(sourceIndex, 1);
  pinned.splice(targetIndex, 0, moved);
  const normalized = pinned.map((pin, index) => ({ ...pin, position: index }));
  await chrome.runtime.sendMessage({ type: "UPDATE_PINNED", pinnedApps: normalized });
  await refresh();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
