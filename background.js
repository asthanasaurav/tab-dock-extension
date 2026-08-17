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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    broadcastState();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_STATE") {
    buildState().then(sendResponse);
    return true;
  }

  if (message?.type === "ACTIVATE_TAB") {
    activateTab(message.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "OPEN_URL") {
    chrome.tabs.create({ url: message.url, active: true }).then(() => sendResponse({ ok: true }));
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

async function buildState() {
  const stored = await chrome.storage.local.get(["tabDockPinnedApps", "tabDockSettings"]);
  const tabs = await chrome.tabs.query({});
  const pinnedApps = Array.isArray(stored.tabDockPinnedApps) ? stored.tabDockPinnedApps : DEFAULT_PINNED;
  const settings = { ...DEFAULT_SETTINGS, ...(stored.tabDockSettings ?? {}) };

  const serializableTabs = tabs
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

  const groupsMap = groupTabs(serializableTabs);
  const groups = sortGroups(groupsMap, pinnedApps, settings.showEmptyPinned);

  return {
    groups,
    pinnedApps,
    settings,
    activeTabId: serializableTabs.find((t) => t.active)?.id ?? null,
  };
}

async function broadcastState() {
  try {
    const state = await buildState();
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
        continue;
      }
      chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATED", state }).catch(() => {});
    }
  } catch (error) {
    console.error("Tab Dock: broadcastState failed", error);
  }
}
