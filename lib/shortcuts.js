const SHORTCUT_STORAGE_KEY = "tabDockShortcuts";

const SHORTCUT_DEFINITIONS = [
  { id: "toggleDock", label: "Toggle dock" },
  { id: "focusSearch", label: "Focus search" },
  { id: "expandAll", label: "Expand all groups" },
  { id: "collapseAll", label: "Collapse all groups" },
  { id: "nextGroup", label: "Next group" },
  { id: "prevGroup", label: "Previous group" },
  { id: "jumpPinned1", label: "Jump to pinned app 1" },
  { id: "jumpPinned2", label: "Jump to pinned app 2" },
  { id: "jumpPinned3", label: "Jump to pinned app 3" },
  { id: "jumpPinned4", label: "Jump to pinned app 4" },
  { id: "jumpPinned5", label: "Jump to pinned app 5" },
  { id: "jumpPinned6", label: "Jump to pinned app 6" },
  { id: "jumpPinned7", label: "Jump to pinned app 7" },
  { id: "jumpPinned8", label: "Jump to pinned app 8" },
  { id: "jumpPinned9", label: "Jump to pinned app 9" },
];

function buildDefaultShortcuts() {
  return {
    toggleDock: "alt+shift+KeyD",
    focusSearch: "alt+shift+KeyF",
    expandAll: "alt+shift+KeyE",
    collapseAll: "alt+shift+KeyC",
    nextGroup: "alt+shift+BracketRight",
    prevGroup: "alt+shift+BracketLeft",
    jumpPinned1: "alt+shift+Digit1",
    jumpPinned2: "alt+shift+Digit2",
    jumpPinned3: "alt+shift+Digit3",
    jumpPinned4: "alt+shift+Digit4",
    jumpPinned5: "alt+shift+Digit5",
    jumpPinned6: "alt+shift+Digit6",
    jumpPinned7: "alt+shift+Digit7",
    jumpPinned8: "alt+shift+Digit8",
    jumpPinned9: "alt+shift+Digit9",
  };
}

const DEFAULT_SHORTCUTS = buildDefaultShortcuts();

function mergeShortcuts(stored) {
  return { ...DEFAULT_SHORTCUTS, ...(stored ?? {}) };
}

function formatChord(chord) {
  if (!chord) return "—";
  return chord
    .split("+")
    .map((part) => {
      const p = part.toLowerCase();
      if (p === "alt") return "Alt";
      if (p === "ctrl") return "Ctrl";
      if (p === "shift") return "Shift";
      if (p === "meta") return "⌘";
      if (p.startsWith("digit")) return p.replace("digit", "");
      if (p.startsWith("key")) return p.replace("key", "").toUpperCase();
      if (p === "bracketleft") return "[";
      if (p === "bracketright") return "]";
      if (p === "space") return "Space";
      return part.toUpperCase();
    })
    .join("+");
}

function chordFromKeyboardEvent(event) {
  if (event.key === "Escape") return null;
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;

  const mods = [];
  if (event.ctrlKey) mods.push("ctrl");
  if (event.altKey) mods.push("alt");
  if (event.shiftKey) mods.push("shift");
  if (event.metaKey) mods.push("meta");
  if (mods.length === 0) return null;

  return `${mods.join("+")}+${event.code}`.toLowerCase();
}

function findActionForEvent(event, shortcuts) {
  const pressed = chordFromKeyboardEvent(event);
  if (!pressed) return null;
  for (const def of SHORTCUT_DEFINITIONS) {
    if (shortcuts[def.id]?.toLowerCase() === pressed) {
      return def.id;
    }
  }
  return null;
}

function findConflictingAction(chord, shortcuts, exceptActionId) {
  if (!chord) return null;
  const normalized = chord.toLowerCase();
  for (const def of SHORTCUT_DEFINITIONS) {
    if (def.id === exceptActionId) continue;
    if (shortcuts[def.id]?.toLowerCase() === normalized) return def.id;
  }
  return null;
}
