importScripts("lib/apps.js", "lib/groupTabs.js");

const DEFAULT_PINNED = [
  { id: "gmail", position: 0 },
  { id: "calendar", position: 1 },
];

const DEFAULT_SETTINGS = {
  dockPosition: "right",
  dockVisible: true,
  pushContent: true,
  showEmptyPinned: true,
  dockMode: "icon",
  windowScope: "current",
};

const RIGHT_DOCK_MIGRATION_KEY = "tabDockRightDefaultApplied";

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    "tabDockPinnedApps",
    "tabDockSettings",
    RIGHT_DOCK_MIGRATION_KEY,
  ]);

  if (!Array.isArray(stored.tabDockPinnedApps)) {
    await chrome.storage.local.set({ tabDockPinnedApps: DEFAULT_PINNED });
  }

  const nextSettings = {
    ...DEFAULT_SETTINGS,
    ...(stored.tabDockSettings ?? {}),
  };

  if (!stored[RIGHT_DOCK_MIGRATION_KEY]) {
    nextSettings.dockPosition = "right";
    await chrome.storage.local.set({
      tabDockSettings: nextSettings,
      [RIGHT_DOCK_MIGRATION_KEY]: true,
    });
    return;
  }

  if (!stored.tabDockSettings) {
    await chrome.storage.local.set({ tabDockSettings: nextSettings });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  const { tabDockSettings = DEFAULT_SETTINGS } = await chrome.storage.local.get("tabDockSettings");
  const next = { ...tabDockSettings, dockVisible: !tabDockSettings.dockVisible };
  await chrome.storage.local.set({ tabDockSettings: next });
  await broadcastState();
});

chrome.tabs.onCreated.addListener(broadcastState);
chrome.tabs.onRemoved.addListener(broadcastState);
chrome.tabs.onUpdated.addListener(broadcastState);
chrome.tabs.onActivated.addListener(broadcastState);
chrome.tabs.onMoved.addListener(broadcastState);
chrome.tabs.onAttached.addListener(broadcastState);
chrome.tabs.onDetached.addListener(broadcastState);
chrome.windows.onFocusChanged.addListener(broadcastState);
chrome.windows.onRemoved.addListener(broadcastState);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    broadcastState();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const windowId = message?.windowId ?? sender.tab?.windowId ?? null;

  if (message?.type === "GET_STATE") {
    buildState(windowId).then(sendResponse);
    return true;
  }

  if (message?.type === "ACTIVATE_TAB") {
    activateTab(message.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "OPEN_URL") {
    openUrlInWindow(message.url, windowId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "UPDATE_SETTINGS") {
    updateSettings(message.patch).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "UPDATE_PINNED") {
    chrome.storage.local.set({ tabDockPinnedApps: message.pinnedApps }).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function updateSettings(patch) {
  const { tabDockSettings = DEFAULT_SETTINGS } = await chrome.storage.local.get("tabDockSettings");
  await chrome.storage.local.set({ tabDockSettings: { ...tabDockSettings, ...patch } });
}

async function activateTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId != null) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

async function openUrlInWindow(url, windowId) {
  if (windowId != null) {
    await chrome.tabs.create({ url, active: true, windowId });
    return;
  }
  await chrome.tabs.create({ url, active: true });
}

function serializeTabs(tabs) {
  return tabs
    .filter((tab) => tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://"))
    .map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      active: tab.active,
      index: tab.index,
      windowId: tab.windowId,
    }));
}

function enrichGroupsForWindow(groups, allGroupsMap, requestWindowId, windowScope) {
  return groups.map((group) => {
    const allGroup = allGroupsMap.get(group.id);
    const totalTabCount = allGroup?.tabCount ?? group.tabCount;
    const hereTabCount =
      windowScope === "all" && requestWindowId != null
        ? (allGroup?.tabs ?? []).filter((tab) => tab.windowId === requestWindowId).length
        : group.tabCount;

    const tabs = group.tabs.map((tab) => ({
      ...tab,
      isOtherWindow: windowScope === "all" && requestWindowId != null && tab.windowId !== requestWindowId,
    }));

    return {
      ...group,
      tabs,
      tabCount: windowScope === "current" ? group.tabCount : totalTabCount,
      hereTabCount,
      totalTabCount,
      hasOtherWindows: windowScope === "all" && hereTabCount < totalTabCount,
    };
  });
}

async function buildState(requestWindowId) {
  const stored = await chrome.storage.local.get(["tabDockPinnedApps", "tabDockSettings"]);
  const tabs = await chrome.tabs.query({});
  const pinnedApps = Array.isArray(stored.tabDockPinnedApps) ? stored.tabDockPinnedApps : DEFAULT_PINNED;
  const settings = { ...DEFAULT_SETTINGS, ...(stored.tabDockSettings ?? {}) };
  const windowScope = settings.windowScope === "all" ? "all" : "current";

  const allSerializableTabs = serializeTabs(tabs);
  const scopedTabs =
    windowScope === "current" && requestWindowId != null
      ? allSerializableTabs.filter((tab) => tab.windowId === requestWindowId)
      : allSerializableTabs;

  const allGroupsMap = groupTabs(allSerializableTabs);
  const groupsMap = groupTabs(scopedTabs);
  let groups = sortGroups(groupsMap, pinnedApps, settings.showEmptyPinned);

  if (windowScope === "all") {
    groups = enrichGroupsForWindow(groups, allGroupsMap, requestWindowId, windowScope);
  } else {
    groups = groups.map((group) => ({
      ...group,
      hereTabCount: group.tabCount,
      totalTabCount: group.tabCount,
      hasOtherWindows: false,
    }));
  }

  const activeTabId =
    scopedTabs.find((tab) => tab.active && tab.windowId === requestWindowId)?.id ??
    scopedTabs.find((tab) => tab.active)?.id ??
    null;

  return {
    groups,
    pinnedApps,
    settings,
    activeTabId,
    requestWindowId,
    windowScope,
  };
}

async function broadcastState() {
  try {
    const tabs = await chrome.tabs.query({});
    const seenWindows = new Set();

    for (const tab of tabs) {
      if (!tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
        continue;
      }

      const state = await buildState(tab.windowId ?? null);
      chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATED", state }).catch(() => {});
      if (tab.windowId != null) seenWindows.add(tab.windowId);
    }
  } catch (error) {
    console.error("Tab Dock: broadcastState failed", error);
  }
}
