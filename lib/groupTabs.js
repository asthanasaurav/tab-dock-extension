function groupTabs(tabs) {
  const groups = new Map();

  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
      continue;
    }

    const app = resolveAppFromUrl(tab.url);
    const existing = groups.get(app.id) ?? {
      id: app.id,
      label: app.label,
      color: app.color,
      openUrl: app.openUrl,
      tabs: [],
      favIconUrl: null,
    };

    existing.tabs.push(tab);
    if (!existing.favIconUrl && tab.favIconUrl) {
      existing.favIconUrl = tab.favIconUrl;
    }

    groups.set(app.id, existing);
  }

  for (const group of groups.values()) {
    group.tabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    group.tabCount = group.tabs.length;
  }

  return groups;
}

function sortGroups(groupsMap, pinnedApps, showEmptyPinned) {
  const groups = [...groupsMap.values()];
  const pinned = [...pinnedApps].sort((a, b) => a.position - b.position);

  const ordered = [];

  for (const pin of pinned) {
    const match = groups.find((g) => g.id === pin.id);
    if (match) {
      ordered.push({ ...match, pinned: true, pinPosition: pin.position });
      continue;
    }

    if (showEmptyPinned) {
      const app = getAppById(pin.id);
      if (app) {
        ordered.push({
          id: app.id,
          label: app.label,
          color: app.color,
          openUrl: app.openUrl,
          tabs: [],
          tabCount: 0,
          favIconUrl: null,
          pinned: true,
          pinPosition: pin.position,
          empty: true,
        });
      }
    }
  }

  const pinnedIds = new Set(pinned.map((p) => p.id));
  const unpinned = groups
    .filter((g) => !pinnedIds.has(g.id))
    .sort((a, b) => {
      if (b.tabCount !== a.tabCount) return b.tabCount - a.tabCount;
      return a.label.localeCompare(b.label);
    })
    .map((g) => ({ ...g, pinned: false }));

  return [...ordered, ...unpinned];
}

function filterGroups(groups, query) {
  const q = query.trim().toLowerCase();
  if (!q) return groups;

  return groups
    .map((group) => {
      const tabs = group.tabs.filter((tab) => {
        const title = (tab.title ?? "").toLowerCase();
        const url = (tab.url ?? "").toLowerCase();
        return title.includes(q) || url.includes(q) || group.label.toLowerCase().includes(q);
      });

      if (tabs.length === 0 && !group.label.toLowerCase().includes(q)) {
        return null;
      }

      return {
        ...group,
        tabs,
        tabCount: tabs.length,
      };
    })
    .filter(Boolean);
}
